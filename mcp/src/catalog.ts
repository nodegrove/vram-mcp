/**
 * Finding the model or card a person means. Names arrive the way people type them
 * ("4090", "Llama-3.3-70B-Instruct", "M4 Max 128GB"), so matching is by words, and a
 * question that fits two entries is answered with both names rather than a guess.
 */
import { models, gpus, cardOf, modelByRepo, type ModelSpec, type GpuSpec, type CheckCard } from '../../llm-math/src/index.ts';
import { ToolInputError } from './errors.ts';

/** Lowercase words, split at letter/digit boundaries: "RTX 4090 24GB" → rtx 4090 24 gb. */
export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\(moe\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .flatMap((w) => w.match(/[a-z]+|\d+/g) ?? [])
    .filter(Boolean);
}

const MODEL_NOISE = new Set(['instruct', 'it', 'chat', 'base', 'model', 'hf', 'the', 'a', 'llm', 'bf16', 'fp16', 'gguf']);
const GPU_NOISE = new Set(['nvidia', 'geforce', 'amd', 'radeon', 'apple', 'intel', 'gpu', 'card', 'graphics', 'the', 'my', 'a', 'an', 'with', 'of', 'vram', 'memory', 'ram']);

/** Each entry's words, worked out once per process rather than on every lookup. */
const indexOf = <T>(items: readonly T[], names: (t: T) => string[]) => items.map((item) => ({ item, words: new Set(names(item).flatMap(words)) }));
const MODEL_INDEX = indexOf(models, (m) => [m.name, m.id]);
const GPU_INDEX = indexOf(gpus, (g) => [g.name, g.id, `${g.vramGb} gb`]);

export type Match<T> = { ok: true; item: T; alsoMatched: T[] } | { ok: false; candidates: T[] };

function matchBy<T>(query: string, index: { item: T; words: Set<string> }[], noise: Set<string>): Match<T> {
  const q = words(query).filter((w) => !noise.has(w));
  if (q.length === 0) return { ok: false, candidates: [] };
  const scored = index
    .filter((e) => q.every((w) => e.words.has(w)))
    .map((e) => ({ item: e.item, extra: [...e.words].filter((w) => !q.includes(w) && !noise.has(w)).length }))
    .sort((a, b) => a.extra - b.extra);
  if (scored.length === 0) return { ok: false, candidates: [] };
  // One clearly closest entry wins; a tie is a question back, not a guess.
  if (scored.length === 1 || scored[0]!.extra < scored[1]!.extra) {
    return { ok: true, item: scored[0]!.item, alsoMatched: scored.slice(1, 4).map((s) => s.item) };
  }
  return { ok: false, candidates: scored.slice(0, 8).map((s) => s.item) };
}

/** A Hugging Face repo id ("org/name") or a huggingface.co URL, or null. */
export function hfRepoOf(query: string): string | null {
  const s = query.trim();
  const url = s.match(/^https?:\/\/(?:www\.)?huggingface\.co\/([\w.-]+\/[\w.-]+)/i);
  if (url) return url[1]!;
  return /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(s) ? s : null;
}

export function findModel(query: string): Match<ModelSpec> | { ok: 'hf'; repo: string } {
  const s = query.trim();
  const byId = models.find((m) => m.id.toLowerCase() === s.toLowerCase());
  if (byId) return { ok: true, item: byId, alsoMatched: [] };
  const repo = hfRepoOf(s);
  if (repo) {
    // A repo id maps to a row only when it is that row's own source; anything else is read live.
    const row = modelByRepo(repo);
    return row ? { ok: true, item: row, alsoMatched: [] } : { ok: 'hf', repo };
  }
  return matchBy(s, MODEL_INDEX, MODEL_NOISE);
}

export function findGpu(query: string): Match<GpuSpec> {
  const s = query.trim();
  const byId = gpus.find((g) => g.id.toLowerCase() === s.toLowerCase());
  if (byId) return { ok: true, item: byId, alsoMatched: [] };
  return matchBy(s, GPU_INDEX, GPU_NOISE);
}

const listOf = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);
const named = (x: { id: string; name: string }) => `${x.name} (${x.id})`;

/** The entry a lookup settled on, with notes on any near-match and the entry's own note; or the question back. */
export function settle<T extends { id: string; name: string; note?: string }>(found: Match<T>, query: string, noun: string, noMatch: string): { item: T; notes: string[] } {
  if (!found.ok) {
    if (found.candidates.length) throw new ToolInputError(`"${query}" matches several ${noun}s: ${found.candidates.map(named).join(', ')}. Pass one id.`);
    throw new ToolInputError(noMatch);
  }
  const notes: string[] = [];
  if (found.alsoMatched.length) notes.push(`Read "${query}" as ${found.item.name}; it could also mean ${listOf(found.alsoMatched.map(named))}.`);
  if (found.item.note) notes.push(found.item.note);
  return { item: found.item, notes };
}

/**
 * A card described by its memory. Apple silicon gives the GPU a share of unified memory,
 * by the same rule as the listed Macs; any other figure is taken as the memory the GPU has.
 */
export function customCard(vramGb: number, bandwidthGBs: number | undefined, appleSilicon: boolean): CheckCard {
  return cardOf({
    id: 'custom',
    name: appleSilicon ? `your Mac (${vramGb} GB unified memory)` : `your GPU (${vramGb} GB)`,
    kind: appleSilicon ? 'apple' : 'consumer',
    vramGb,
    bandwidthGBs: bandwidthGBs ?? null,
  });
}
