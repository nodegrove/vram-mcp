/**
 * Where nodegrove.io shows each answer, and the GPU sizes a Nodegrove workspace attaches.
 * The site's controls and the MCP server's links read the same names and bounds here, so a
 * link cannot ask a page for a state its controls cannot show.
 */
import { MAX_CONTEXT } from './gpu-fit.ts';
import { models } from './models.ts';
import { gpus } from './gpus.ts';
import { quants, kvCaches, type KvShape, type QuantKey } from './vram.ts';

export const NODEGROVE_URL = 'https://nodegrove.io';

/** GPU memory a Nodegrove workspace attaches, GB. */
export const GROVE_GB: readonly number[] = [24, 48, 96];

/** The context sliders: the checker (/tools/can-i-run-it) and the VRAM calculator. */
export const CHECKER_CONTEXT = { min: 1024, max: MAX_CONTEXT, step: 1024 } as const;
export const CALCULATOR_CONTEXT = { min: 2048, max: MAX_CONTEXT, step: 2048 } as const;

/** Query parameters each tool page reads its state from. */
export const CHECKER_PARAMS = { gpu: 'gpu', model: 'model', quant: 'quant', kv: 'kv', ctx: 'ctx' } as const;
export const CALCULATOR_PARAMS = { model: 'model', quant: 'quant', ctx: 'ctx', kv: 'kv', params: 'p', layers: 'l', kvHeads: 'kvh', headDim: 'hd' } as const;

export const modelPage = (id: string) => `${NODEGROVE_URL}/models/${id}`;
export const gpuPage = (id: string) => `${NODEGROVE_URL}/gpus/${id}`;

const onSlider = (n: number, s: { min: number; max: number; step: number }) =>
  Number.isInteger(n) && n >= s.min && n <= s.max && (n - s.min) % s.step === 0;
const known = (quant: QuantKey, kvBytes: number) => quants.some((q) => q.key === quant) && kvCaches.some((k) => k.bytes === kvBytes);

/**
 * The checker opened on these exact settings, or null when it cannot show them (an unlisted
 * model or card, or a context off its slider). The page falls back to its defaults for any
 * value it does not offer, which would show a different answer, so this never guesses.
 */
export function checkerUrl(p: { gpu: string; model: string; quant: QuantKey; kvBytes: number; context: number }): string | null {
  if (!models.some((m) => m.id === p.model) || !gpus.some((g) => g.id === p.gpu)) return null;
  if (!onSlider(p.context, CHECKER_CONTEXT) || !known(p.quant, p.kvBytes)) return null;
  const P = CHECKER_PARAMS;
  const qs = new URLSearchParams({ [P.gpu]: p.gpu, [P.model]: p.model, [P.quant]: p.quant, [P.kv]: String(p.kvBytes), [P.ctx]: String(p.context) });
  return `${NODEGROVE_URL}/tools/can-i-run-it?${qs}`;
}

/**
 * The VRAM calculator on these settings: a listed model by id, or a model by its shape. The
 * calculator's custom fields describe a plain transformer only, so a model with grouped,
 * windowed or recurrent caching gets no link rather than a wrong one.
 */
export function calculatorUrl(p: { model: string | (KvShape & { params: number }); quant: QuantKey; kvBytes: number; context: number }): string | null {
  if (!onSlider(p.context, CALCULATOR_CONTEXT) || !known(p.quant, p.kvBytes)) return null;
  const P = CALCULATOR_PARAMS;
  const qs = new URLSearchParams();
  if (typeof p.model === 'string') {
    if (!models.some((m) => m.id === p.model)) return null;
    qs.set(P.model, p.model);
  } else {
    const s = p.model;
    if (s.kv || s.stateGb || !(s.params >= 0.1 && s.layers >= 1 && s.kvHeads >= 1 && s.headDim >= 16)) return null;
    qs.set(P.model, 'custom');
    qs.set(P.params, String(s.params));
    qs.set(P.layers, String(s.layers));
    qs.set(P.kvHeads, String(s.kvHeads));
    qs.set(P.headDim, String(s.headDim));
  }
  qs.set(P.quant, p.quant);
  qs.set(P.kv, String(p.kvBytes));
  qs.set(P.ctx, String(p.context));
  return `${NODEGROVE_URL}/tools/llm-vram-calculator?${qs}`;
}
