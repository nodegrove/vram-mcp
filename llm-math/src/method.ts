/**
 * The method in sentences, built from the constants it describes, so the words cannot
 * drift from the arithmetic. The MCP server attaches these to every answer.
 */
import { overheadGb, quants } from './vram.ts';
import { EFFICIENCY, SPEED_CAVEAT } from './speed.ts';
import { HEADROOM, TIGHT } from './gpu-fit.ts';
import { APPLE_GPU_SHARE } from './gpus.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Read off overheadGb() rather than typed a second time. */
const OVERHEAD_FIXED_GB = overheadGb(0);
const OVERHEAD_SHARE = (overheadGb(100) - overheadGb(0)) / 100;

export const METHOD = {
  memory:
    `Memory = weights + KV cache + overhead. Weights = parameters × bytes per parameter (${quants.map((q) => `${q.label} ${q.bytes.toFixed(2)}`).join(', ')}; ` +
    'effective averages including scales and unquantised embeddings). KV cache = for each group of attention layers: layers × values cached per token × tokens held ' +
    `(sliding-window layers stop at their window) × 2 bytes at FP16 or 1 at Q8, plus any fixed recurrent state. Overhead = ${OVERHEAD_FIXED_GB} GB + ${pct(OVERHEAD_SHARE)} of weights.`,
  fit:
    `Fits = total at or under ${pct(HEADROOM)} of the memory a runtime can address; "tight" above ${pct(TIGHT)}. ` +
    `Apple silicon gives the GPU about ${pct(APPLE_GPU_SHARE)} of unified memory by default.`,
  speed: `Speed = ${EFFICIENCY} × memory bandwidth ÷ bytes of active weights read per token, single stream, decode only. ${SPEED_CAVEAT}`,
  estimate:
    'Estimates from stated formulas over each model\'s config.json and the makers\' specs, never benchmarks. Real usage moves with the runtime, ' +
    'batch size, flash attention and KV quantisation: read "fits" as "worth trying", not "guaranteed".',
} as const;
