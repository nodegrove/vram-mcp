/**
 * A model's memory shape read from its Hugging Face config.json, by the rules the model
 * table in models.ts was read with, so a repo outside the table is estimated the way the
 * table's rows were. Checked against every row of that table.
 *
 * Pure: the caller fetches config.json and the parameter count (safetensors metadata).
 * Anything in the config this reader does not model is named in `warnings`, never
 * silently ignored, and each such case errs on the side of more memory, not less.
 */
import type { KvGroup, KvShape } from './vram.ts';

export type Attention = 'standard' | 'sliding-window' | 'hybrid' | 'latent';

/** How a model caches, read off its shape: the same four kinds the dataset publishes. */
export function attentionOf(m: KvShape): Attention {
  if (!m.kv) return 'standard';
  if (m.kv.some((g) => g.window)) return 'sliding-window';
  if (m.stateGb) return 'hybrid';
  return 'latent';
}

export interface ConfigShape extends KvShape {
  /** Native context window: max_position_embeddings. Absent when the config gives none. */
  ctx?: number;
  attention: Attention;
  /** Mixture of experts: experts in total and routed per token, as config.json states them. */
  moe: { experts: number; perToken: number | null } | null;
  /** The cache layout in one sentence, built from the same values. */
  detail: string;
  /** What this reading does not model, and which way that moves the estimate. */
  warnings: string[];
  /** The quantisation the checkpoint itself ships in, when config.json names one. */
  shippedQuantisation: string | null;
}

export class ConfigError extends Error {}

type Cfg = Record<string, unknown>;
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);
/** Linear attention and Mamba keep their recurrent state in FP32, as the model table assumes. */
const STATE_BYTES = 4;

const FULL = /^(full_attention|attention|full|global|global_attention)$/;
const SLIDING = /^(sliding_attention|sliding|local|local_attention|sliding_window)$/;
const LINEAR = /^(linear_attention|linear)$/;
const MAMBA = /^(mamba|mamba1|mamba2|ssm)$/;
const NO_CACHE = /^(moe|mlp|dense|ffn|feed_forward)$/;

export function shapeFromConfig(config: Cfg): ConfigShape {
  const nested = (config.text_config ?? config.llm_config ?? config.language_config) as Cfg | undefined;
  const c: Cfg = nested && typeof nested === 'object' ? nested : config;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = num(c[k]) ?? num(config[k]);
      if (v !== undefined) return v;
    }
    return undefined;
  };
  const warnings: string[] = [];

  const layers = pick('num_hidden_layers', 'n_layer', 'num_layers', 'n_layers');
  const heads = pick('num_attention_heads', 'n_head', 'num_heads');
  if (!layers || !heads) throw new ConfigError('config.json has no layer count or attention-head count that this reader knows.');
  const kvHeads = pick('num_key_value_heads', 'num_kv_heads', 'n_head_kv') ?? heads;
  const hidden = pick('hidden_size', 'n_embd', 'd_model');
  const loraRank = num(c.kv_lora_rank);
  const ropeDim = num(c.qk_rope_head_dim) ?? 0;
  const mla = loraRank !== undefined;
  const headDim = (mla && (num(c.qk_nope_head_dim) ?? 0) + ropeDim) || pick('head_dim') || (hidden ? hidden / heads : undefined);
  if (!headDim) throw new ConfigError('config.json gives no head_dim and no hidden_size to derive it from.');
  const ctx = pick('max_position_embeddings', 'max_sequence_length', 'seq_length', 'n_positions');
  const window = num(c.sliding_window);
  const modelType = String(c.model_type ?? config.model_type ?? '');

  // Which kind each layer is. Explicit lists first, then the patterns configs use instead.
  let kinds: string[] | undefined;
  if (Array.isArray(c.layer_types)) kinds = c.layer_types.map(String);
  else if (Array.isArray(c.layers_block_type)) kinds = c.layers_block_type.map(String);
  else if (typeof c.hybrid_override_pattern === 'string') {
    kinds = [...c.hybrid_override_pattern].map((ch) => (ch === '*' ? 'attention' : ch === 'M' ? 'mamba' : 'mlp'));
  } else if (num(c.full_attention_interval)) {
    const every = num(c.full_attention_interval)!;
    kinds = Array.from({ length: layers }, (_, i) => ((i + 1) % every === 0 ? 'full_attention' : 'linear_attention'));
  } else if (num(c.sliding_window_pattern) && window) {
    const every = num(c.sliding_window_pattern)!;
    kinds = Array.from({ length: layers }, (_, i) => ((i + 1) % every === 0 ? 'full_attention' : 'sliding_attention'));
  } else if (modelType === 'gemma2' && window) {
    // Gemma 2 alternates local and global layers, starting with a local one.
    kinds = Array.from({ length: layers }, (_, i) => (i % 2 === 0 ? 'sliding_attention' : 'full_attention'));
  } else if (num(c.attn_layer_period)) {
    const period = num(c.attn_layer_period)!;
    const offset = typeof c.attn_layer_offset === 'number' ? c.attn_layer_offset : 0;
    kinds = Array.from({ length: layers }, (_, i) => (i % period === offset ? 'attention' : 'mamba'));
  }

  let full = 0, sliding = 0, linear = 0, mamba = 0;
  const unknown = new Set<string>();
  if (kinds) {
    for (const k of kinds) {
      const t = k.toLowerCase();
      if (FULL.test(t)) full++;
      else if (SLIDING.test(t)) sliding++;
      else if (LINEAR.test(t)) linear++;
      else if (MAMBA.test(t)) mamba++;
      else if (!NO_CACHE.test(t)) unknown.add(k);
    }
    if (unknown.size) {
      full += kinds.filter((k) => unknown.has(k)).length;
      warnings.push(`Layer kinds this reader does not know (${[...unknown].join(', ')}) are counted as full attention, which overstates the cache if they keep less.`);
    }
  } else {
    full = layers;
    if (window && c.use_sliding_window !== false) {
      warnings.push(`config.json sets a ${window.toLocaleString('en-US')}-token sliding window without saying which layers use it; every layer is counted at full context, an upper bound.`);
    }
  }
  if (sliding && !window) {
    warnings.push('Sliding-window layers are listed but config.json gives no window size; they are counted at full context, an upper bound.');
    full += sliding;
    sliding = 0;
  }

  // Values cached per token per layer. Gemma 4 gives its global layers their own head shape.
  const globalHeads = num(c.num_global_key_value_heads);
  const globalDim = num(c.global_head_dim);
  const width = 2 * kvHeads * headDim;
  const fullWidth = mla ? loraRank! + ropeDim : globalHeads || globalDim ? 2 * (globalHeads ?? kvHeads) * (globalDim ?? headDim) : width;

  // Recurrent state of linear-attention and Mamba layers, a fixed size whatever the context.
  let stateBytes = 0;
  if (linear) {
    const v = num(c.linear_num_value_heads), kd = num(c.linear_key_head_dim), vd = num(c.linear_value_head_dim);
    if (v && kd && vd) stateBytes += linear * v * kd * vd * STATE_BYTES;
    else warnings.push(`${linear} linear-attention layers keep a fixed state this reader cannot size from config.json; it is not counted (usually well under 1 GB).`);
  }
  if (mamba) {
    const h = num(c.mamba_num_heads) ?? num(c.mamba_n_heads);
    const d = num(c.mamba_head_dim) ?? num(c.mamba_d_head);
    const s = num(c.ssm_state_size) ?? num(c.mamba_d_state) ?? num(c.state_size);
    const expand = num(c.mamba_expand) ?? num(c.expand);
    if (h && d && s) stateBytes += mamba * h * d * s * STATE_BYTES;
    else if (expand && hidden && s) stateBytes += mamba * expand * hidden * s * STATE_BYTES;
    else warnings.push(`${mamba} Mamba layers keep a fixed state this reader cannot size from config.json; it is not counted (usually well under 1 GB).`);
  }
  // Two decimals, as the model table records it.
  const stateGb = stateBytes ? Math.round((stateBytes / 1e9) * 100) / 100 || undefined : undefined;

  const plain = !mla && !sliding && !linear && !mamba && fullWidth === width && full === layers;
  const kv: KvGroup[] | undefined = plain
    ? undefined
    : [
        ...(full ? [{ layers: full, width: fullWidth }] : []),
        ...(sliding ? [{ layers: sliding, width, window: window! }] : []),
      ];

  if (num(c.attention_chunk_size)) warnings.push('Chunked attention is not modelled: every attention layer is counted at full context, an upper bound.');
  if (Object.keys(c).some((k) => /^index_(n_heads|head_dim|topk)$/.test(k))) warnings.push('A sparse-attention indexer keeps its own small per-token cache, which is not counted.');
  if (num(c.num_kv_shared_layers)) warnings.push(`${c.num_kv_shared_layers} layers reuse another layer's cache but are counted as keeping their own, an upper bound.`);
  if (num(c.mla_n_layers) || c.use_mla === false) warnings.push('This config mixes cache kinds in a way this reader does not model; check the model card.');

  const experts = pick('num_experts', 'num_local_experts', 'n_routed_experts');
  const perToken = pick('num_experts_per_tok', 'moe_topk', 'top_k');
  const q = (config.quantization_config ?? c.quantization_config) as Cfg | undefined;
  const shippedQuantisation = q && typeof q === 'object' ? String(q.quant_method ?? q.quantization_method ?? 'yes') : null;

  const shape: KvShape = { layers, kvHeads, headDim, kv, stateGb };
  const attention = attentionOf(shape);
  const n = (x: number) => x.toLocaleString('en-US');
  const heads2 = (h: number, d: number) => `${h} KV head${h === 1 ? '' : 's'} of dimension ${d}`;
  let detail: string;
  if (attention === 'standard') detail = `${n(layers)} layers, all full attention, with ${heads2(kvHeads, headDim)}`;
  else if (attention === 'latent') detail = `${n(full)} layers using multi-head latent attention: every layer caches one compressed vector of ${n(fullWidth)} values per token`;
  else if (attention === 'sliding-window')
    detail = `${n(layers)} layers: ${n(sliding)} use sliding-window attention over the last ${n(window!)} tokens (${heads2(kvHeads, headDim)}), and ${n(full)} are full attention${fullWidth !== width ? ` with ${heads2(globalHeads ?? kvHeads, globalDim ?? headDim)}` : ''}`;
  else {
    const rest = [linear ? `${n(linear)} linear-attention` : '', mamba ? `${n(mamba)} Mamba` : ''].filter(Boolean).join(' and ');
    detail = `${n(full)} of ${n(layers)} layers are full attention (${heads2(kvHeads, headDim)}) and keep a cache that grows with the conversation; ${rest} layers keep a fixed state`;
  }

  return {
    ...shape,
    ctx,
    attention,
    moe: experts ? { experts, perToken: perToken ?? null } : null,
    detail,
    warnings,
    shippedQuantisation,
  };
}
