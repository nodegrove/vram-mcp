/**
 * "Can this card run this model, and if not, what would?" The checker's answer as data.
 *
 * nodegrove.io's checker renders it in the browser and the MCP server returns it to an AI
 * client, so both give the same verdict, the same alternatives and the same sentences.
 * Every alternative is computed with the formulas in vram.ts and speed.ts and the fit
 * rule in gpu-fit.ts: nothing is suggested that the arithmetic has not checked.
 *
 * Suggestion text is plain sentences with two marks: **bold** and [label](link). The page
 * turns them into HTML; an AI client reads them as Markdown.
 */
import { estimate, quants, quantOf, maxContextTokens, denseEquivalentB, round1, type KvShape, type QuantKey, type Estimate } from './vram.ts';
import { tokensPerSecond, describeSpeed, isCeiling } from './speed.ts';
import { budgetOf, fitVerdict, MAX_CONTEXT, TIGHT, type Verdict } from './gpu-fit.ts';
import type { CheckCard } from './gpus.ts';
export { cardOf, type CheckCard } from './gpus.ts';

/** What the check needs to know about a model. Every ModelSpec row qualifies, and so does a custom shape. */
export interface CheckModel extends KvShape {
  id: string;
  name: string;
  /** Total parameters, billions. */
  params: number;
  /** Active parameters per token, billions, for a mixture-of-experts model; null when nobody stated them, and then no speed is given. */
  active?: number | null;
  /** Native context window, tokens. Absent when unknown: then no window caps the search, and none is exceeded. */
  ctx?: number;
  /** Set for a coding or reasoning-distilled specialist: the tips offer one only to someone asking about the same kind of model. */
  role?: 'code' | 'reasoning';
  /** Id of the newer model in the same family: when both run on the card, the tips name the newer one. */
  successor?: string;
}

/**
 * Out of the models that run on a card, the ones worth offering as an alternative to the one
 * asked about: not a specialist unless the question was about the same kind of model, and not
 * one whose newer successor also runs there (Qwen3 32B fits a 24 GB card, and so does
 * Qwen3.8 27B, which replaced it). check() names its alternatives from this list.
 */
export function worthNaming<T extends Pick<CheckModel, 'id' | 'role' | 'successor'>>(runs: readonly T[], asked: Pick<CheckModel, 'role'>): T[] {
  return runs.filter((x) => (!x.role || x.role === asked.role) && !(x.successor && runs.some((y) => y.id === x.successor)));
}

export type SuggestionKind =
  | 'lower-quant' | 'kv-q8' | 'shorter-context' | 'no-context' | 'near-miss-card' | 'smallest-card' | 'biggest-model'
  | 'higher-quant' | 'larger-model' | 'tight' | 'longer-context';

export interface Suggestion {
  kind: SuggestionKind;
  /** One sentence, with **bold** and [label](link) marks. */
  text: string;
  quant?: QuantKey;
  context?: number;
  cardId?: string;
  modelId?: string;
  /** Memory the suggested setup needs, GB. */
  needGb?: number;
  /** Speed ceiling of the suggested model on this card, when the bandwidth is known. */
  tokensPerSecond?: number;
}

export interface CheckResult {
  verdict: Verdict;
  need: Estimate;
  /** The same total with the KV cache at Q8. */
  needQ8KvGb: number;
  /** The line a model must fit under: usable memory × HEADROOM. */
  budgetGb: number;
  /** Budget minus need: spare when positive, short by when negative. */
  marginGb: number;
  /** Single-stream decode ceiling when it fits and the speed is knowable. */
  tokensPerSecond: number | null;
  feels: string | null;
  /** Longest context that fits at these settings, tokens. 0 when the weights alone do not fit. */
  maxContext: number;
  /** The context asked for is longer than the model's native window: the memory figure is hypothetical. */
  beyondNativeWindow: boolean;
  suggestions: Suggestion[];
  /** On a "no": the smallest of `groveGb` that holds the model exactly as asked, and the sentence that says so. */
  groveGb: number | null;
  groveText: string | null;
}

export interface CheckOptions {
  /** Where a model or card name links to; null or absent means no link. */
  links?: { model?: (id: string) => string | null; card?: (id: string) => string | null };
  /** Memory sizes on offer for the "or skip the card" answer, GB. */
  groveGb?: readonly number[];
}

/** "45.8 GB": one decimal, as every page shows memory. */
export const gb = (n: number) => `${round1(n)} GB`;
/** "8,192": token counts as the pages print them. */
export const tok = (n: number) => n.toLocaleString('en-US');
/** "~42 tokens/s", or "at most 369 tokens/s" where the figure is only a ceiling. */
export const speedText = (tps: number) => `${isCeiling(tps) ? 'at most ' : '~'}${Math.round(tps)} tokens/s`;
/** The verdict as the checker's badge and the MCP server's summary say it. */
export const verdictLabel = (v: Verdict) => (v === 'fits' ? 'Yes' : v === 'tight' ? 'Yes, but tight' : 'No');
/** "Llama 3.3 70B at Q4_K_M with 8,192 tokens of context". */
export const settingsPhrase = (model: string, quant: QuantKey, context: number) => `${model} at ${quantOf(quant).label} with ${tok(context)} tokens of context`;
export const beyondWindowNote = (context: number, nativeCtx: number) =>
  `${tok(context)} tokens is beyond this model's native ${tok(nativeCtx)}-token window, so the memory figure is hypothetical`;

const link = (name: string, href: string | null | undefined) => (href ? `[${name}](${href})` : name);

export function check(
  input: { model: CheckModel; card: CheckCard; quant: QuantKey; context: number; kvBytes?: number },
  catalog: { models: readonly CheckModel[]; cards: readonly CheckCard[] },
  options: CheckOptions = {},
): CheckResult {
  const { model: m, card: g, context } = input;
  const q = quantOf(input.quant);
  const kvBytes = input.kvBytes ?? 2;
  const need = (x: CheckModel, quant: QuantKey, kv: number) => estimate({ ...x, quant, context, kvBytes: kv });
  const budget = (c: CheckCard) => budgetOf(c.usableGb);
  const tps = (x: CheckModel, c: CheckCard) => (c.bandwidthGBs && x.active !== null ? tokensPerSecond(x.active ?? x.params, q.bytes, c.bandwidthGBs) : null);
  const withSpeed = (t: number | null) => (t === null ? '' : ` at ${speedText(t)}`);
  // The checker offers contexts up to MAX_CONTEXT; a longer one asked for is searched up to itself.
  const searchCap = Math.max(MAX_CONTEXT, context);
  const maxCtx = (x: CheckModel, quant: QuantKey, kv: number) =>
    maxContextTokens(x, quant, budget(g), kv, x.ctx === undefined ? searchCap : Math.min(searchCap, x.ctx));
  const modelLink = (x: CheckModel) => link(x.name, options.links?.model?.(x.id));
  const cardLink = (c: CheckCard) => link(c.name, options.links?.card?.(c.id));

  const e = need(m, q.key, kvBytes);
  const q8 = need(m, q.key, 1).totalGb;
  const verdict = fitVerdict(e.totalGb, g.usableGb);
  const fits = verdict !== 'no';
  const mc = maxCtx(m, q.key, kvBytes);
  const speed = fits ? tps(m, g) : null;
  const tips: Suggestion[] = [];

  if (!fits) {
    const lower = quants.filter((x) => need(m, x.key, kvBytes).totalGb <= budget(g)).sort((a, b) => b.bytes - a.bytes)[0];
    if (lower) {
      const n = need(m, lower.key, kvBytes).totalGb;
      tips.push({ kind: 'lower-quant', quant: lower.key, needGb: n, text: `Switch to **${lower.label}**: ${gb(n)}, which fits. Smaller quantisations cost accuracy; ${lower.key === 'q3' ? 'Q3 costs enough that a smaller model at Q4 is usually the better trade' : 'this one is a mild step'}.` });
    }
    if (kvBytes === 2 && q8 <= budget(g)) tips.push({ kind: 'kv-q8', needGb: q8, text: `Quantise the **KV cache to Q8**: ${gb(q8)}, which fits. Most people never notice the difference.` });
    if (mc >= 1024) tips.push({ kind: 'shorter-context', context: mc, text: `Keep ${q.label} but drop the context to **${tok(mc)} tokens**, the most this card holds for this model.` });
    else tips.push({ kind: 'no-context', needGb: e.weightsGb + e.overheadGb, text: `No context length helps: the weights alone are ${gb(e.weightsGb + e.overheadGb)} before a single token of conversation.` });

    const smallest = catalog.cards.filter((c) => e.totalGb <= budget(c)).sort((a, b) => a.usableGb - b.usableGb)[0];
    // A card that clears the raw memory but not the headroom is worth naming: headless,
    // or with a Q8 KV cache, it genuinely runs.
    const nearMiss = catalog.cards
      .filter((c) => c.usableGb > g.usableGb && e.totalGb > budget(c) && q8 <= budget(c))
      .sort((a, b) => a.usableGb - b.usableGb)[0];
    if (nearMiss && (!smallest || nearMiss.usableGb < smallest.usableGb)) {
      tips.push({ kind: 'near-miss-card', cardId: nearMiss.id, needGb: q8, text: `**${cardLink(nearMiss)}** (${gb(nearMiss.usableGb)}) is within a whisker: ${gb(e.totalGb)} against ${gb(budget(nearMiss))} after headroom. With the KV cache at Q8 it needs ${gb(q8)} and fits.` });
    }
    if (smallest) tips.push({ kind: 'smallest-card', cardId: smallest.id, needGb: e.totalGb, text: `The smallest card here that runs it exactly as asked: **${cardLink(smallest)}**, ${gb(smallest.usableGb)} usable.` });

    const runnable = worthNaming(catalog.models.filter((x) => need(x, q.key, kvBytes).totalGb <= budget(g)), m);
    const biggest = [...runnable].sort((a, b) => denseEquivalentB(b) - denseEquivalentB(a))[0];
    if (biggest) {
      const n = need(biggest, q.key, kvBytes).totalGb;
      const t = tps(biggest, g);
      const byDense = [...runnable].sort((a, b) => b.params - a.params)[0]!.id !== biggest.id;
      tips.push({ kind: 'biggest-model', modelId: biggest.id, needGb: n, tokensPerSecond: t ?? undefined, text: `The biggest model your card does run at these settings${byDense ? ', counting mixture-of-experts models at their dense equivalent' : ''}: **${modelLink(biggest)}**, ${gb(n)}${withSpeed(t)}.` });
    }
  } else {
    const higher = quants.filter((x) => x.bytes > q.bytes && need(m, x.key, kvBytes).totalGb <= budget(g)).sort((a, b) => b.bytes - a.bytes)[0];
    if (higher) {
      const n = need(m, higher.key, kvBytes).totalGb;
      tips.push({ kind: 'higher-quant', quant: higher.key, needGb: n, text: `You have room for **${higher.label}**: ${gb(n)}. Higher precision is free quality when the memory is there.` });
    }
    const larger = worthNaming(catalog.models.filter((x) => need(x, q.key, kvBytes).totalGb <= budget(g)), m)
      .filter((x) => denseEquivalentB(x) > denseEquivalentB(m))
      .sort((a, b) => denseEquivalentB(b) - denseEquivalentB(a))[0];
    if (larger) {
      const n = need(larger, q.key, kvBytes).totalGb;
      const t = tps(larger, g);
      tips.push({ kind: 'larger-model', modelId: larger.id, needGb: n, tokensPerSecond: t ?? undefined, text: `You could run a larger model: **${modelLink(larger)}** at ${gb(n)}${t === null ? '' : `, ${speedText(t)}`}.` });
    }
    if (verdict === 'tight') tips.push({ kind: 'tight', text: `It fits, but above ${Math.round(TIGHT * 100)}% of memory. On a card with a display attached, treat this as a maybe: the desktop wants 0.5 to 2 GB of the same memory.` });
    if (mc > context) tips.push({ kind: 'longer-context', context: mc, text: `You can push the context to **${tok(mc)} tokens** before it stops fitting.` });
  }

  const groveGb = fits ? null : (options.groveGb?.find((x) => e.totalGb <= budgetOf(x)) ?? null);
  return {
    verdict,
    need: e,
    needQ8KvGb: q8,
    budgetGb: budget(g),
    marginGb: budget(g) - e.totalGb,
    tokensPerSecond: speed,
    feels: speed === null ? null : describeSpeed(speed),
    maxContext: mc,
    beyondNativeWindow: m.ctx !== undefined && context > m.ctx,
    suggestions: tips,
    groveGb,
    groveText:
      groveGb === null ? null : `${settingsPhrase(m.name, q.key, context)} needs ${gb(e.totalGb)}, which fits the ${groveGb} GB GPU a Nodegrove workspace attaches.`,
  };
}
