/**
 * Where nodegrove.io shows each answer, and the GPU sizes a Nodegrove workspace attaches.
 * The site and the MCP server build their links here, so a link cannot ask a page for a
 * state its controls cannot show.
 */
import { MAX_CONTEXT } from './gpu-fit.ts';
import { models } from './models.ts';
import { gpus } from './gpus.ts';
import { quants, type QuantKey } from './vram.ts';

export const NODEGROVE_URL = 'https://nodegrove.io';

/** GPU memory a Nodegrove workspace attaches, GB. */
export const GROVE_GB: readonly number[] = [24, 48, 96];

/** The context sliders: the checker (/tools/can-i-run-it) and the VRAM calculator. */
export const CHECKER_CONTEXT = { min: 1024, max: MAX_CONTEXT, step: 1024 } as const;
export const CALCULATOR_CONTEXT = { min: 2048, max: MAX_CONTEXT, step: 2048 } as const;

export const modelPage = (id: string) => `${NODEGROVE_URL}/models/${id}`;
export const gpuPage = (id: string) => `${NODEGROVE_URL}/gpus/${id}`;

const onSlider = (n: number, s: { min: number; max: number; step: number }) =>
  Number.isInteger(n) && n >= s.min && n <= s.max && (n - s.min) % s.step === 0;
const known = (quant: QuantKey, kvBytes: number) => quants.some((q) => q.key === quant) && (kvBytes === 1 || kvBytes === 2);

/**
 * The checker opened on these exact settings, or null when it cannot show them (an unlisted
 * model or card, or a context off its slider). The page falls back to its defaults for any
 * value it does not offer, which would show a different answer, so this never guesses.
 */
export function checkerUrl(p: { gpu: string; model: string; quant: QuantKey; kvBytes: number; context: number }): string | null {
  if (!models.some((m) => m.id === p.model) || !gpus.some((g) => g.id === p.gpu)) return null;
  if (!onSlider(p.context, CHECKER_CONTEXT) || !known(p.quant, p.kvBytes)) return null;
  const qs = new URLSearchParams({ gpu: p.gpu, model: p.model, quant: p.quant, kv: String(p.kvBytes), ctx: String(p.context) });
  return `${NODEGROVE_URL}/tools/can-i-run-it?${qs}`;
}

/** The VRAM calculator on these settings: a listed model by id, or a plain transformer by its shape. */
export function calculatorUrl(p: {
  model: string | { params: number; layers: number; kvHeads: number; headDim: number };
  quant: QuantKey;
  kvBytes: number;
  context: number;
}): string | null {
  if (!onSlider(p.context, CALCULATOR_CONTEXT) || !known(p.quant, p.kvBytes)) return null;
  const qs = new URLSearchParams();
  if (typeof p.model === 'string') {
    if (!models.some((m) => m.id === p.model)) return null;
    qs.set('model', p.model);
  } else {
    const s = p.model;
    if (!(s.params >= 0.1 && s.layers >= 1 && s.kvHeads >= 1 && s.headDim >= 16)) return null;
    qs.set('model', 'custom');
    qs.set('p', String(s.params));
    qs.set('l', String(s.layers));
    qs.set('kvh', String(s.kvHeads));
    qs.set('hd', String(s.headDim));
  }
  qs.set('quant', p.quant);
  qs.set('kv', String(p.kvBytes));
  qs.set('ctx', String(p.context));
  return `${NODEGROVE_URL}/tools/llm-vram-calculator?${qs}`;
}
