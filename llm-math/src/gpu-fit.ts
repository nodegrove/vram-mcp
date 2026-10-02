/**
 * "What can this card run?" — the same arithmetic as the VRAM calculator and the
 * speed estimator, turned around to start from a GPU instead of a model.
 *
 * Nothing here is measured. Memory comes from the stated VRAM formula in vram.ts,
 * speed from the stated bandwidth formula in speed.ts, and both are labelled as
 * estimates wherever they are shown.
 */
import { cardOf, type GpuSpec, type CheckCard } from './gpus.ts';
import { models, type ModelSpec } from './models.ts';
import { estimate, quantOf, maxContextTokens, denseEquivalentB, round1, HEADROOM, TIGHT, type QuantKey } from './vram.ts';
export { denseEquivalentB, HEADROOM, TIGHT };
import { tokensPerSecond, describeSpeed, CHAT_TPS } from './speed.ts';

/** The longest context the tools offer. A model's own window (ModelSpec.ctx) caps lower where it is smaller. */
export const MAX_CONTEXT = 131072;

export type Verdict = 'fits' | 'tight' | 'no';

export interface ModelFit {
  m: ModelSpec;
  needGb: number;
  fits: boolean;
  tight: boolean;
  verdict: Verdict;
  /** Estimated single-stream tokens per second on this card at this quant. */
  tps: number;
  feels: string;
  /** Largest context this card can hold for this model at this quant, in tokens. */
  maxContext: number;
}

/** A listed card, or one described only by its memory: the fit checks read nothing else. */
const asCard = (g: GpuSpec | CheckCard): CheckCard => ('usableGb' in g ? g : cardOf(g));

/** The line a model must fit under: usable memory less the headroom every fit check uses. */
export const budgetOf = (usableGb: number) => usableGb * HEADROOM;

/** Memory the runtime can address, minus the headroom every fit check uses. */
export function budgetGb(g: GpuSpec | CheckCard): number {
  return budgetOf(asCard(g).usableGb);
}

/** The one fit rule: a model fits at or under the budget, and is tight above TIGHT of usable memory. */
export function fitVerdict(totalGb: number, usableGb: number): Verdict {
  if (totalGb > budgetOf(usableGb)) return 'no';
  return totalGb > usableGb * TIGHT ? 'tight' : 'fits';
}

/**
 * Largest context that still fits, in tokens. Returns 0 when the weights alone
 * do not fit, so callers can tell "no context" from "no room at all".
 */
export function maxContextFor(m: ModelSpec, g: GpuSpec | CheckCard, quant: QuantKey, kvBytes = 2): number {
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

export function fitModel(m: ModelSpec, g: GpuSpec | CheckCard, quant: QuantKey, context: number): ModelFit {
  const card = asCard(g);
  const e = estimate({ ...m, quant, context });
  const verdict = fitVerdict(e.totalGb, card.usableGb);
  // A card described without its bandwidth gets no speed; 0 keeps it out of every speed-based pick.
  const tps = tokensPerSecond(m.active ?? m.params, quantOf(quant).bytes, card.bandwidthGBs ?? 0);
  return {
    m,
    needGb: round1(e.totalGb),
    fits: verdict !== 'no',
    tight: verdict === 'tight',
    verdict,
    tps: Math.round(tps),
    feels: describeSpeed(tps),
    maxContext: maxContextFor(m, card, quant, 2),
  };
}

/** Every tracked model against one card, in the data's own order (smallest first). */
export function fitsForGpu(g: GpuSpec | CheckCard, quant: QuantKey = 'q4', context = 8192): ModelFit[] {
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

export function summarise(g: GpuSpec | CheckCard, quant: QuantKey = 'q4', context = 8192): GpuSummary {
  const card = asCard(g);
  const all = fitsForGpu(card, quant, context);
  const fits = all.filter((f) => f.fits);
  const misses = all.filter((f) => !f.fits);
  const byParams = [...fits].sort((a, b) => b.m.params - a.m.params);
  const comfortable = byParams.filter((f) => f.tps >= CHAT_TPS);
  const roomy = comfortable.filter((f) => !f.tight);
  const q8 = pickBest(
    models
      .map((m) => ({ m, e: estimate({ ...m, quant: 'q8', context }) }))
      .filter((x) => x.e.totalGb <= budgetOf(card.usableGb)),
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
