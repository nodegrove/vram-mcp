/**
 * VRAM estimate for running an LLM. Stated assumptions, no magic:
 *
 *   weights  = params × bytes-per-parameter (quantisation)
 *   KV cache = for each group of attention layers:
 *              layers × cached values per token × tokens held × bytes-per-value
 *              (+ a fixed recurrent state for linear-attention and Mamba layers)
 *   overhead = ~0.5 GB CUDA/runtime context + 4% of weights for activations and buffers
 *
 * For a standard transformer there is one group: every layer caches a key and a
 * value per KV head, 2 × kvHeads × headDim values per token, for the whole context.
 * That was the entire formula until 2025. Current architectures break it three ways,
 * and a model says which in its `kv` field:
 *
 *   sliding window  most layers only keep the last N tokens (Gemma, gpt-oss)
 *   hybrid          most layers are linear attention or Mamba with a fixed-size
 *                   state; only a few keep a growing cache (Qwen3.5+, Nemotron)
 *   MLA             each layer caches one compressed latent per token instead of
 *                   full keys and values (Mistral Small 4, GLM Flash)
 *
 * This file is the only place the arithmetic lives. The pages, the GPU tables and
 * the three browser tools all import it, so they cannot disagree.
 *
 * Bytes per parameter for GGUF-style quants are effective averages that include
 * scales and the un-quantised embedding/output layers:
 *   FP16 2.00 · Q8 1.06 · Q6_K 0.82 · Q5_K_M 0.71 · Q4_K_M 0.58 · Q3_K_M 0.47
 * Results are estimates. Real usage moves with the runtime, batch size, flash attention,
 * and KV quantisation. Treat the "fits" verdict as "worth trying", not "guaranteed".
 */
export type QuantKey = 'fp16' | 'q8' | 'q6' | 'q5' | 'q4' | 'q3';

export const quants: { key: QuantKey; label: string; bytes: number; hint: string }[] = [
  { key: 'fp16', label: 'FP16 / BF16', bytes: 2.0, hint: 'full precision, best quality, largest' },
  { key: 'q8', label: 'Q8_0', bytes: 1.06, hint: 'near-lossless' },
  { key: 'q6', label: 'Q6_K', bytes: 0.82, hint: 'very close to Q8' },
  { key: 'q5', label: 'Q5_K_M', bytes: 0.71, hint: 'good balance' },
  { key: 'q4', label: 'Q4_K_M', bytes: 0.58, hint: 'the common default; small quality loss' },
  { key: 'q3', label: 'Q3_K_M', bytes: 0.47, hint: 'noticeable loss; last resort' },
];

/** A set of layers that cache the same way. */
export interface KvGroup {
  layers: number;
  /** Values cached per token per layer: 2 × kvHeads × headDim, or the latent width for MLA. */
  width: number;
  /** Sliding-window layers stop growing once they hold this many tokens. */
  window?: number;
}

/** What the KV arithmetic needs to know about a model. */
export interface KvShape {
  layers: number;
  kvHeads: number;
  headDim: number;
  /** Present when the model is not a plain transformer; replaces the default single group. */
  kv?: KvGroup[];
  /** Fixed recurrent state of linear-attention or Mamba layers, in GB. Does not grow with context. */
  stateGb?: number;
}

export function kvGroups(m: KvShape): KvGroup[] {
  return m.kv ?? [{ layers: m.layers, width: 2 * m.kvHeads * m.headDim }];
}

/** Cache plus fixed state at this context, in GB. kvBytes: 2 = FP16, 1 = Q8. */
export function kvCacheGb(m: KvShape, context: number, kvBytes = 2): number {
  let values = 0;
  for (const g of kvGroups(m)) values += g.layers * g.width * Math.min(context, g.window ?? Infinity);
  return (values * kvBytes) / 1e9 + (m.stateGb ?? 0);
}

/** What one more token costs once every sliding window is full, in GB. */
export function kvPerTokenGb(m: KvShape, kvBytes = 2): number {
  let values = 0;
  for (const g of kvGroups(m)) if (!g.window) values += g.layers * g.width;
  return (values * kvBytes) / 1e9;
}

export const overheadGb = (weightsGb: number) => 0.5 + weightsGb * 0.04;

export interface EstimateInput extends KvShape {
  params: number;   // billions
  quant: QuantKey;
  context: number;  // tokens
  kvBytes?: number; // 2 = fp16 KV (default), 1 = q8 KV
}

export interface Estimate {
  weightsGb: number;
  kvGb: number;
  overheadGb: number;
  totalGb: number;
}

export function estimate(i: EstimateInput): Estimate {
  const q = quants.find((x) => x.key === i.quant) ?? quants[4];
  const weightsGb = i.params * q.bytes;
  const kvGb = kvCacheGb(i, i.context, i.kvBytes ?? 2);
  const overhead = overheadGb(weightsGb);
  return { weightsGb, kvGb, overheadGb: overhead, totalGb: weightsGb + kvGb + overhead };
}

/**
 * Largest context, in whole thousands of tokens, that fits a memory budget.
 * Returns 0 when the weights alone do not fit, so callers can tell "no context"
 * from "no room at all". Searched rather than solved, because a sliding window
 * makes the cache piecewise-linear in context.
 */
export function maxContextTokens(m: KvShape & { params: number }, quant: QuantKey, budgetGb: number, kvBytes = 2, cap = 131072): number {
  const q = quants.find((x) => x.key === quant) ?? quants[4];
  const weights = m.params * q.bytes;
  const spare = budgetGb - weights - overheadGb(weights);
  if (spare <= 0 || kvCacheGb(m, 1024, kvBytes) > spare) return 0;
  let lo = 1, hi = Math.floor(cap / 1024);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (kvCacheGb(m, mid * 1024, kvBytes) <= spare) lo = mid; else hi = mid - 1;
  }
  return lo * 1024;
}

/**
 * How much model this is, for choosing between models without quoting a benchmark.
 * A dense model counts at its parameter count. A mixture-of-experts model counts at
 * the geometric mean of total and active parameters — the usual rule of thumb: it
 * knows more than its active size and reasons less than its total. It is a rule of
 * thumb, and the pages say so. Lives here, not in gpu-fit.ts, so the browser tools
 * can import it without pulling the whole data set into their bundle.
 */
export function denseEquivalentB(m: { params: number; active?: number }): number {
  return m.active ? Math.sqrt(m.params * m.active) : m.params;
}

/** Smallest tier the estimate fits into with ~5% headroom, or null. */
export function fitsTier(totalGb: number, tiers: readonly { label: string; gb: number }[]): { label: string; gb: number } | null {
  for (const t of tiers) if (totalGb <= t.gb * 0.95) return t;
  return null;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
