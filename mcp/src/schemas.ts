/**
 * The tools' inputs: one contract for validation, for the JSON Schema clients see, and for
 * the types tools.ts accepts. Built once per process, not per request.
 */
import * as z from 'zod';
import { QUANT_KEYS, quants, kvCaches, APPLE_GPU_SHARE, pct } from '../../llm-math/src/index.ts';
import { DEFAULTS } from './tools.ts';

/**
 * The SDK asks each schema for its JSON Schema whenever a server is created and on every
 * tools/list, and the Worker creates a server per request. Converting once here keeps that
 * off every request; validation still runs through zod.
 */
function convertOnce<T extends z.ZodType>(schema: T): T {
  const std = schema['~standard'];
  const json = std.jsonSchema;
  const memo = new Map<string, unknown>();
  const cached = (kind: 'input' | 'output') => (options?: unknown) => {
    const key = `${kind} ${JSON.stringify(options ?? null)}`;
    if (!memo.has(key)) memo.set(key, json[kind](options as Parameters<typeof json.input>[0]));
    return memo.get(key);
  };
  Object.defineProperty(schema, '~standard', { value: { ...std, jsonSchema: { input: cached('input'), output: cached('output') } }, configurable: true });
  return schema;
}

const QUANT_HELP = quants.map((q) => `${q.key} (${q.label})`).join(', ');
const quant = z.enum(QUANT_KEYS).default(DEFAULTS.quant).describe(`Weight quantisation: ${QUANT_HELP}. ${DEFAULTS.quant} is the common default.`);
const eachQuant = z.enum(QUANT_KEYS).describe(`Weight quantisation: ${QUANT_HELP}. Omit it for all ${quants.length}.`);
const context = z.number().int().min(1).max(10_000_000).default(DEFAULTS.context).describe('Tokens held in context: prompt plus conversation.');
const kvCache = z
  .enum(kvCaches.map((k) => k.key) as [(typeof kvCaches)[number]['key'], ...(typeof kvCaches)[number]['key'][]])
  .default(DEFAULTS.kv_cache)
  .describe('KV cache precision. fp16 is what most runtimes use; q8 halves the cache.');

const model = {
  model: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('A model from list_models (id or name, e.g. "llama-3.3-70b" or "Llama 3.3 70B"), or any Hugging Face repo id (e.g. "Qwen/Qwen3-8B"), read live from its config.json.'),
  architecture: z
    .object({
      params_b: z.number().positive().max(10_000).describe('Total parameters, billions; all experts for a mixture-of-experts model.'),
      layers: z.number().int().positive().max(1000).describe('num_hidden_layers'),
      kv_heads: z.number().int().positive().max(1024).describe('num_key_value_heads'),
      head_dim: z.number().int().positive().max(4096).describe('head_dim, or hidden_size ÷ num_attention_heads'),
      active_params_b: z.number().positive().max(10_000).optional().describe('Parameters read per token, billions (mixture-of-experts only).'),
      native_context: z.number().int().positive().optional().describe('The context window the model supports, tokens.'),
      kv_groups: z
        .array(
          z.object({
            layers: z.number().int().positive(),
            values_per_token: z.number().positive().describe('Values each layer caches per token: 2 × KV heads × head dim, or the latent width for MLA.'),
            window_tokens: z.number().int().positive().optional().describe('Sliding window: these layers keep only this many tokens.'),
          }),
        )
        .max(8)
        .optional()
        .describe('Only for non-standard attention: one entry per group of layers that cache the same way. Replaces layers × kv_heads × head_dim.'),
      fixed_state_gb: z.number().min(0).max(100).optional().describe('Fixed recurrent state of linear-attention or Mamba layers, GB.'),
    })
    .optional()
    .describe('A model described by its config.json values instead of a name.'),
  active_params_b: z
    .number()
    .positive()
    .max(10_000)
    .optional()
    .describe('Parameters read per token, billions, for a mixture-of-experts model read from Hugging Face (from its model card). Sets the speed ceiling.'),
};

const gpu = {
  gpu: z.string().min(1).max(100).optional().describe('A GPU from list_gpus (id or name, e.g. "rtx-4090", "4090" or "M4 Max").'),
  vram_gb: z.number().positive().max(4096).optional().describe('Memory of a card not in list_gpus, GB. For a Mac, its unified memory with apple_silicon: true.'),
  bandwidth_gb_s: z.number().positive().max(100_000).optional().describe("Memory bandwidth from the maker's spec, GB/s, for a speed ceiling."),
  apple_silicon: z.boolean().optional().describe(`vram_gb is Apple unified memory; the GPU can use about ${pct(APPLE_GPU_SHARE)} of it by default.`),
};

const search = { search: z.string().max(100).optional().describe('Words to filter by, e.g. "qwen" or "24 GB".') };

export const canIRunInput = convertOnce(z.object({ ...model, ...gpu, quant, context, kv_cache: kvCache }));
export const whatFitsInput = convertOnce(z.object({ ...gpu, quant, context }));
export const estimateVramInput = convertOnce(z.object({ ...model, quant: eachQuant.optional(), context, kv_cache: kvCache }));
export const hfRepoInput = convertOnce(
  z.object({
    repo: z.string().min(3).max(200).describe('Hugging Face repo id, e.g. "Qwen/Qwen3-8B", or its huggingface.co URL.'),
    active_params_b: model.active_params_b,
    context,
    kv_cache: kvCache,
  }),
);
export const listInput = convertOnce(z.object(search));

export type CanIRunInput = z.input<typeof canIRunInput>;
export type WhatFitsInput = z.input<typeof whatFitsInput>;
export type EstimateInput = z.input<typeof estimateVramInput>;
export type HfRepoInput = z.input<typeof hfRepoInput>;
export type ListInput = z.input<typeof listInput>;
export type ModelInput = Pick<CanIRunInput, 'model' | 'architecture' | 'active_params_b'>;
export type GpuInput = Pick<CanIRunInput, 'gpu' | 'vram_gb' | 'bandwidth_gb_s' | 'apple_silicon'>;
export type ArchitectureInput = NonNullable<CanIRunInput['architecture']>;
