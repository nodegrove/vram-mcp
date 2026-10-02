/**
 * "What can this card run?" — the same arithmetic as the VRAM calculator and the
 * speed estimator, turned around to start from a GPU instead of a model.
 *
 * Nothing here is measured. Memory comes from the stated VRAM formula in vram.ts,
 * speed from the stated bandwidth formula in speed.ts, and both are labelled as
 * estimates wherever they are shown.
 */
import { usableVramGb, type GpuSpec } from './gpus.ts';
import { models, type ModelSpec } from './models.ts';
import { estimate, quants, maxContextTokens, denseEquivalentB, type QuantKey } from './vram.ts';
export { denseEquivalentB };
import { tokensPerSecond, describeSpeed } from './speed.ts';

/** Leave 5% for the desktop, the runtime and fragmentation, as the calculator does. */
export const HEADROOM = 0.95;
/** Above this share of usable memory, a fit is real but has no room to grow. */
export const TIGHT = 0.85;
/** The longest context the tools offer. A model's own window (ModelSpec.ctx) caps lower where it is smaller. */
export const MAX_CONTEXT = 131072;

export interface ModelFit {
  m: ModelSpec;
  needGb: number;
  fits: boolean;
  tight: boolean;
  /** Estimated single-stream tokens per second on this card at this quant. */
  tps: number;
  feels: string;
  /** Largest context this card can hold for this model at this quant, in tokens. */
  maxContext: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Memory the runtime can address, minus the headroom every fit check uses. */
export function budgetGb(g: GpuSpec): number {
  return usableVramGb(g) * HEADROOM;
}

/**
 * Largest context that still fits, in tokens. Returns 0 when the weights alone
 * do not fit, so callers can tell "no context" from "no room at all".
 */
export function maxContextFor(m: ModelSpec, g: GpuSpec, quant: QuantKey, kvBytes = 2): number {
  return maxContextTokens(m, quant, budgetGb(g), kvBytes, Math.min(MAX_CONTEXT, m.ctx));
}

/** Models within this share of the biggest candidate count as the same class. */
const SAME_CLASS = 0.8;

/**
 * The biggest class that qualifies, and within it the most recent release.
 * General-purpose models only: a coding or reasoning specialist is a deliberate
 * choice, not a default, so it is recommended only when nothing else qualifies.
 */
export function pickBest<T extends { m: ModelSpec }>(all: T[]): T | undefined {
  const general = all.filter((c) => !c.m.role);
  const candidates = general.length > 0 ? general : all;
  if (candidates.length === 0) return undefined;
  const top = Math.max(...candidates.map((c) => denseEquivalentB(c.m)));
  return candidates
    .filter((c) => denseEquivalentB(c.m) >= top * SAME_CLASS)
    .sort((a, b) => b.m.released.localeCompare(a.m.released) || denseEquivalentB(b.m) - denseEquivalentB(a.m))[0];
}

export function fitModel(m: ModelSpec, g: GpuSpec, quant: QuantKey, context: number): ModelFit {
  const q = quants.find((x) => x.key === quant)!;
  const e = estimate({ ...m, quant, context });
  const usable = usableVramGb(g);
  const fits = e.totalGb <= usable * HEADROOM;
  const tps = tokensPerSecond(m.active ?? m.params, q.bytes, g.bandwidthGBs);
  return {
    m,
    needGb: round1(e.totalGb),
    fits,
    tight: fits && e.totalGb > usable * TIGHT,
    tps: Math.round(tps),
    feels: describeSpeed(tps),
    maxContext: maxContextFor(m, g, quant, 2),
  };
}

/** Every tracked model against one card, in the data's own order (smallest first). */
export function fitsForGpu(g: GpuSpec, quant: QuantKey = 'q4', context = 8192): ModelFit[] {
  return models.map((m) => fitModel(m, g, quant, context));
}

export interface GpuSummary {
  fits: ModelFit[];
  misses: ModelFit[];
  /** Largest model that fits, by parameter count. */
  largest?: ModelFit;
  /**
   * The model actually worth running: the biggest class that fits with room left
   * for context and generates at conversational speed, and within that class the
   * newest release. A model that only fits at 95% of memory is a worse daily
   * driver than a slightly smaller one with somewhere to put the conversation.
   */
  sweetSpot?: ModelFit;
  /** Largest model that fits at all, when that is not the sweet spot. */
  maxCapacity?: ModelFit;
  /** Best quality the card can hold: the same choice, made among models that fit at Q8. */
  bestQuality?: { m: ModelSpec; needGb: number };
  /** Smallest model that does not fit — the first thing out of reach. */
  firstMiss?: ModelFit;
}

export function summarise(g: GpuSpec, quant: QuantKey = 'q4', context = 8192): GpuSummary {
  const all = fitsForGpu(g, quant, context);
  const fits = all.filter((f) => f.fits);
  const misses = all.filter((f) => !f.fits);
  const byParams = [...fits].sort((a, b) => b.m.params - a.m.params);
  const comfortable = byParams.filter((f) => f.tps >= 25);
  const roomy = comfortable.filter((f) => !f.tight);
  const q8 = pickBest(
    models
      .map((m) => ({ m, e: estimate({ ...m, quant: 'q8', context }) }))
      .filter((x) => x.e.totalGb <= usableVramGb(g) * HEADROOM),
  );
  return {
    fits,
    misses,
    largest: byParams[0],
    sweetSpot: pickBest(roomy) ?? pickBest(comfortable) ?? pickBest(byParams),
    maxCapacity: byParams[0],
    bestQuality: q8 ? { m: q8.m, needGb: round1(q8.e.totalGb) } : undefined,
    firstMiss: misses.sort((a, b) => a.m.params - b.m.params)[0],
  };
}

export const fmtTokens = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}k` : `${n}`);
