/**
 * Single-stream decode speed estimate.
 *
 * Generating one token means reading every active weight once from memory, so
 * the ceiling is memory bandwidth divided by the bytes of active weights:
 *
 *   tokens/s ≈ efficiency × bandwidth (GB/s) ÷ active-weight bytes (GB)
 *
 * Real runtimes reach 60–80% of that ceiling on a good day (kernel overhead,
 * KV cache reads, sampling). We use 0.7 and say so. For mixture-of-experts models
 * only the active parameters are read per token, which is why they are fast.
 * This ignores prompt processing (which is compute-bound and much faster per token)
 * and batching (which multiplies throughput for servers, not for one chat).
 */
export const EFFICIENCY = 0.7;

/**
 * The figure is a ceiling, not a prediction, and nothing on the site has been measured
 * against it, so no page states an error margin. The formula only counts weight reads.
 * Once those are small (a small model, or a mixture-of-experts model with few active
 * parameters) the per-token costs it leaves out take a growing share of the time, so
 * the faster the estimate, the further real runtimes fall below it. Above this many
 * tokens per second the pages say so next to the number.
 */
export const CEILING_TPS = 100;
export const isCeiling = (tps: number) => tps >= CEILING_TPS;

/** Said wherever speeds are explained. One copy, so the pages cannot disagree. */
export const SPEED_CAVEAT =
  'These are ceilings worked out from memory bandwidth, not measurements, and we do not state an error margin we have not measured. The faster the figure, the further real runtimes fall below it: when few weights are read per token, as with small models and mixture-of-experts models, the costs the formula leaves out (kernel launches, expert routing, KV cache reads, sampling) take a growing share of each token.';

export function tokensPerSecond(activeParamsB: number, bytesPerParam: number, bandwidthGBs: number, efficiency = EFFICIENCY): number {
  const activeGb = activeParamsB * bytesPerParam;
  if (activeGb <= 0) return 0;
  return (efficiency * bandwidthGBs) / activeGb;
}

export function describeSpeed(tps: number): string {
  if (tps >= 60) return 'faster than you can read';
  if (tps >= 25) return 'comfortable for chat';
  if (tps >= 12) return 'usable, a little slow';
  if (tps >= 5) return 'slow; fine for batch jobs';
  return 'too slow for interactive use';
}
