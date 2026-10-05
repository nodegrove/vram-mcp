/**
 * Architecture facts for popular open models, taken from their public model cards / config.json.
 * These drive the VRAM estimates. They are architecture numbers, not benchmarks.
 *
 * params: total parameters in billions, as Hugging Face reports the checkpoint. MoE = all
 *   experts (they all sit in memory). Multimodal checkpoints include the vision encoder.
 * layers, kvHeads, headDim: the attention layers' shape. For a plain transformer this is
 *   all the KV cache depends on.
 * kv, stateGb: set when it is not a plain transformer. See vram.ts for the three cases.
 *   Every value is read from config.json: layer_types gives the group sizes, sliding_window
 *   the window, kv_lora_rank + qk_rope_head_dim the MLA latent. stateGb is the recurrent
 *   state of the linear layers: layers × value heads × key dim × value dim × 4 bytes (FP32).
 * arch: one sentence for the model page when the default sentence would be wrong.
 * released: the month the weights were published: the vendor's own version stamp where the
 *   name carries one (Mistral's 2512, 2603), otherwise the month the Hugging Face repo was created.
 * ctx: the context window the model supports natively (max_position_embeddings, or the model
 *   card where the two differ). No page credits a model with more context than this, however
 *   much memory is free. Some families stretch further with RoPE scaling; that is not native.
 * license: from the model card metadata.
 *   (Devstral Small 2 and Mistral Small 4 allow more positions in config.json than their
 *   cards claim; both use the card's 256k.)
 * role: set for specialists. A coding or reasoning-distilled model is never the general
 *   "model to run on this card" recommendation, however well it fits.
 * successor: id of the newer model in the same family and role, when there is one.
 *
 * Adding a model: read config.json, do not copy another site's table. Then build nodegrove.io
 * and open one GPU page — the hand-written claims in its editorial notes must still agree
 * with the computed rows. Verify against the model card before relying on a number for a purchase.
 */
import type { KvGroup } from './vram.ts';

export type LicenseKey = 'apache' | 'mit' | 'llama' | 'gemma' | 'openmdw';

/** permissive = no field-of-use or scale conditions. The custom licences carry conditions worth reading. */
export const licenses: Record<LicenseKey, { name: string; permissive: boolean }> = {
  apache: { name: 'Apache 2.0', permissive: true },
  mit: { name: 'MIT', permissive: true },
  llama: { name: 'Llama Community License', permissive: false },
  gemma: { name: 'Gemma Terms of Use', permissive: false },
  openmdw: { name: 'OpenMDW 1.1', permissive: false },
};

export interface ModelSpec {
  id: string;
  name: string;
  family: string;
  params: number;      // billions, total
  active?: number;     // billions, active per token (MoE only)
  layers: number;
  kvHeads: number;
  headDim: number;
  kv?: KvGroup[];
  stateGb?: number;
  arch?: string;
  released: string;    // YYYY-MM
  ctx: number;         // native context window, tokens
  license: LicenseKey;
  role?: 'code' | 'reasoning';
  successor?: string;
  note?: string;
  source: string;
}

/**
 * Where a model's numbers can be checked. `source` always opens with the Hugging Face
 * repo id, so the links are derived from it rather than typed a second time. Gated repos
 * (Llama) show the card to everyone and config.json once the licence is accepted.
 */
const GATED = /^(meta-llama\/|google\/gemma-3-)/;

/** A Hugging Face repo's model card and config.json, as pages link them. */
export const hfLinks = (repo: string) => ({
  card: `https://huggingface.co/${repo}`,
  config: `https://huggingface.co/${repo}/blob/main/config.json`,
});

export function sourceLinks(m: ModelSpec) {
  const repo = m.source.split(' ')[0];
  return {
    repo,
    ...hfLinks(repo),
    gated: GATED.test(repo),
    usesCard: m.source.includes('model card'),
  };
}

/**
 * Last time the model data was changed or re-verified against source: the open dataset's
 * version. It is not a page date: pages show the last time their own content changed
 * (src/data/page-dates.json), so a re-check that moves no number re-dates no page. Bump it only after
 * `node scripts/hf-verify.mjs` passes. 2026-09-25: every row re-read from config.json
 * (29 of 29 unchanged), every model card and GPU spec page resolves; no new model from
 * the tracked labs fits a single card this week (DeepSeek V4.1 Flash and GLM-5.3 are
 * rack-class, Qwen-Image 2.1 is for the create cluster). 2026-10-06: Muse Glimmer 30B added
 * from its config.json; hf-verify 30 of 30, 52 links. Qwen3.8-Flash-Next is left out: its
 * 51B n-gram embedding is meant to sit in system memory, which this math does not model.
 */
export const MODELS_UPDATED = '2026-10-06';

const VISION = 'The parameter count includes the vision encoder; a text-only GGUF is slightly smaller.';

export const models: ModelSpec[] = [
  { id: 'llama-3.2-3b', name: 'Llama 3.2 3B', family: 'Llama', params: 3.2, layers: 28, kvHeads: 8, headDim: 128, released: '2024-09', ctx: 131072, license: 'llama', source: 'meta-llama/Llama-3.2-3B config.json' },
  {
    id: 'qwen3.5-4b', name: 'Qwen3.5 4B', family: 'Qwen', params: 4.7, layers: 32, kvHeads: 4, headDim: 256,
    kv: [{ layers: 8, width: 2048 }], stateGb: 0.05,
    arch: '32 layers, of which only 8 are full attention (4 KV heads of dimension 256) and keep a cache that grows with the conversation; the other 24 are Gated DeltaNet linear-attention layers with a small fixed state',
    released: '2026-02', ctx: 262144, license: 'apache', note: VISION, source: 'Qwen/Qwen3.5-4B config.json',
  },
  { id: 'llama-3.1-8b', name: 'Llama 3.1 8B', family: 'Llama', params: 8.0, layers: 32, kvHeads: 8, headDim: 128, released: '2024-07', ctx: 131072, license: 'llama', source: 'meta-llama/Llama-3.1-8B config.json' },
  { id: 'qwen3-8b', name: 'Qwen3 8B', family: 'Qwen', params: 8.2, layers: 36, kvHeads: 8, headDim: 128, released: '2025-04', ctx: 40960, license: 'apache', successor: 'qwen3.5-9b', source: 'Qwen/Qwen3-8B config.json' },
  {
    id: 'qwen3.5-9b', name: 'Qwen3.5 9B', family: 'Qwen', params: 9.7, layers: 32, kvHeads: 4, headDim: 256,
    kv: [{ layers: 8, width: 2048 }], stateGb: 0.05,
    arch: '32 layers, of which only 8 are full attention (4 KV heads of dimension 256) and keep a cache that grows with the conversation; the other 24 are Gated DeltaNet linear-attention layers with a small fixed state',
    released: '2026-02', ctx: 262144, license: 'apache', note: VISION, source: 'Qwen/Qwen3.5-9B config.json',
  },
  {
    id: 'gemma-4-12b', name: 'Gemma 4 12B', family: 'Gemma', params: 12.0, layers: 48, kvHeads: 8, headDim: 256,
    kv: [{ layers: 8, width: 1024 }, { layers: 40, width: 4096, window: 1024 }],
    arch: '48 layers: 40 use sliding-window attention and only remember the last 1,024 tokens (8 KV heads of dimension 256), and 8 are global layers with a single KV head of dimension 512',
    released: '2026-05', ctx: 262144, license: 'apache', note: 'A runtime without a sliding-window cache stores every layer at full length and needs far more than this at long context.', source: 'google/gemma-4-12B-it config.json',
  },
  {
    id: 'gemma-3-12b', name: 'Gemma 3 12B', family: 'Gemma', params: 12.2, layers: 48, kvHeads: 8, headDim: 256,
    kv: [{ layers: 8, width: 4096 }, { layers: 40, width: 4096, window: 1024 }],
    arch: '48 layers with 8 KV heads of dimension 256; five in every six use sliding-window attention and only remember the last 1,024 tokens, so 8 global layers carry the long context',
    released: '2025-03', ctx: 131072, license: 'gemma', successor: 'gemma-4-12b', note: 'A runtime without a sliding-window cache stores every layer at full length and needs far more than this at long context.', source: 'google/gemma-3-12b-it config.json',
  },
  { id: 'ministral-3-14b', name: 'Ministral 3 14B', family: 'Mistral', params: 14.0, layers: 40, kvHeads: 8, headDim: 128, released: '2025-12', ctx: 262144, license: 'apache', note: VISION, source: 'mistralai/Ministral-3-14B-Instruct-2512 config.json' },
  { id: 'qwen3-14b', name: 'Qwen3 14B', family: 'Qwen', params: 14.8, layers: 40, kvHeads: 8, headDim: 128, released: '2025-04', ctx: 40960, license: 'apache', source: 'Qwen/Qwen3-14B config.json' },
  { id: 'phi-4', name: 'Phi-4 14B', family: 'Phi', params: 14.7, layers: 40, kvHeads: 10, headDim: 128, released: '2024-12', ctx: 16384, license: 'mit', source: 'microsoft/phi-4 config.json' },
  {
    id: 'gpt-oss-20b', name: 'gpt-oss 20B', family: 'gpt-oss', params: 21, active: 3.6, layers: 24, kvHeads: 8, headDim: 64,
    kv: [{ layers: 12, width: 1024 }, { layers: 12, width: 1024, window: 128 }],
    arch: '24 layers with 8 KV heads of dimension 64, alternating full attention with a 128-token sliding window, so only half the layers keep a cache that grows',
    released: '2025-08', ctx: 131072, license: 'apache', note: 'Ships in MXFP4; roughly 4.25 bits per expert weight. Choose the 4-bit row.', source: 'openai/gpt-oss-20b config.json',
  },
  { id: 'devstral-small-2-24b', name: 'Devstral Small 2 24B', family: 'Mistral', params: 24.0, layers: 40, kvHeads: 8, headDim: 128, released: '2025-12', ctx: 262144, license: 'apache', role: 'code', note: 'Mistral\'s coding model. ' + VISION, source: 'mistralai/Devstral-Small-2-24B-Instruct-2512 config.json' },
  { id: 'mistral-small-3.1-24b', name: 'Mistral Small 3.1 24B', family: 'Mistral', params: 24, layers: 40, kvHeads: 8, headDim: 128, released: '2025-03', ctx: 131072, license: 'apache', successor: 'mistral-small-4-119b', source: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503 config.json' },
  {
    id: 'gemma-4-26b-a4b', name: 'Gemma 4 26B-A4B (MoE)', family: 'Gemma', params: 25.8, active: 3.8, layers: 30, kvHeads: 8, headDim: 256,
    kv: [{ layers: 5, width: 2048 }, { layers: 25, width: 4096, window: 1024 }],
    arch: '30 layers: 25 use sliding-window attention over the last 1,024 tokens (8 KV heads of dimension 256), and 5 are global layers with 2 KV heads of dimension 512',
    released: '2026-03', ctx: 262144, license: 'apache', note: 'All 128 experts stay in memory; 3.8B are active per token. ' + VISION, source: 'google/gemma-4-26B-A4B-it config.json and model card',
  },
  {
    id: 'gemma-3-27b', name: 'Gemma 3 27B', family: 'Gemma', params: 27.4, layers: 62, kvHeads: 16, headDim: 128,
    kv: [{ layers: 10, width: 4096 }, { layers: 52, width: 4096, window: 1024 }],
    arch: '62 layers with 16 KV heads of dimension 128; five in every six use sliding-window attention and only remember the last 1,024 tokens, so 10 global layers carry the long context',
    released: '2025-03', ctx: 131072, license: 'gemma', successor: 'gemma-4-31b', note: 'A runtime without a sliding-window cache stores every layer at full length and needs far more than this at long context.', source: 'google/gemma-3-27b-it config.json',
  },
  {
    id: 'qwen3.8-27b', name: 'Qwen3.8 27B', family: 'Qwen', params: 27.8, layers: 64, kvHeads: 4, headDim: 256,
    kv: [{ layers: 16, width: 2048 }], stateGb: 0.15,
    arch: '64 layers, of which only 16 are full attention (4 KV heads of dimension 256) and keep a cache that grows with the conversation; the other 48 are Gated DeltaNet linear-attention layers with a fixed state of about 0.15 GB',
    released: '2026-08', ctx: 262144, license: 'apache', note: VISION, source: 'Qwen/Qwen3.8-27B config.json',
  },
  {
    id: 'muse-glimmer-30b', name: 'Muse Glimmer 30B', family: 'Muse', params: 29.8, layers: 52, kvHeads: 2, headDim: 128,
    kv: [{ layers: 13, width: 512 }, { layers: 39, width: 512, window: 2048 }],
    arch: '52 layers: 39 use sliding-window attention over the last 2,048 tokens and 13 are full attention, all with 2 KV heads of dimension 128',
    released: '2026-08', ctx: 131072, license: 'apache', note: VISION, source: 'meta-models/Muse-Glimmer-30B config.json',
  },
  { id: 'qwen3-30b-a3b', name: 'Qwen3 30B-A3B (MoE)', family: 'Qwen', params: 30.5, active: 3.3, layers: 48, kvHeads: 4, headDim: 128, released: '2025-04', ctx: 40960, license: 'apache', successor: 'qwen3.6-35b-a3b', note: 'All experts stay in memory; only 3.3B are active per token, so it is fast for its size.', source: 'Qwen/Qwen3-30B-A3B config.json' },
  {
    id: 'glm-4.7-flash', name: 'GLM-4.7 Flash 30B-A3B (MoE)', family: 'GLM', params: 31.2, active: 3, layers: 47, kvHeads: 20, headDim: 256,
    kv: [{ layers: 47, width: 576 }],
    arch: '47 layers using multi-head latent attention: instead of keys and values for each of its 20 heads, every layer caches one compressed vector of 576 values per token',
    released: '2026-01', ctx: 202752, license: 'mit', note: 'A runtime that does not implement the latent cache stores full keys and values and needs several times more context memory.', source: 'zai-org/GLM-4.7-Flash config.json and model card',
  },
  {
    id: 'gemma-4-31b', name: 'Gemma 4 31B', family: 'Gemma', params: 31.3, layers: 60, kvHeads: 16, headDim: 256,
    kv: [{ layers: 10, width: 4096 }, { layers: 50, width: 8192, window: 1024 }],
    arch: '60 layers: 50 use sliding-window attention over the last 1,024 tokens (16 KV heads of dimension 256), and 10 are global layers with 4 KV heads of dimension 512',
    released: '2026-03', ctx: 262144, license: 'apache', note: 'A runtime without a sliding-window cache stores every layer at full length and needs far more than this at long context. ' + VISION, source: 'google/gemma-4-31B-it config.json',
  },
  {
    id: 'nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning 30B-A3B (MoE)', family: 'Nemotron', params: 31.6, active: 3, layers: 52, kvHeads: 2, headDim: 128,
    kv: [{ layers: 6, width: 512 }], stateGb: 0.05,
    arch: '52 blocks, of which only 6 are attention layers (2 KV heads of dimension 128); 23 are Mamba-2 layers with a small fixed state and 23 are mixture-of-experts layers with no cache at all',
    released: '2026-08', ctx: 262144, license: 'openmdw', source: 'nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16 config.json and model card',
  },
  { id: 'qwen3-32b', name: 'Qwen3 32B', family: 'Qwen', params: 32.8, layers: 64, kvHeads: 8, headDim: 128, released: '2025-04', ctx: 40960, license: 'apache', successor: 'qwen3.8-27b', source: 'Qwen/Qwen3-32B config.json' },
  { id: 'qwen2.5-coder-32b', name: 'Qwen2.5 Coder 32B', family: 'Qwen', params: 32.8, layers: 64, kvHeads: 8, headDim: 128, released: '2024-11', ctx: 32768, license: 'apache', role: 'code', successor: 'qwen3-coder-next', source: 'Qwen/Qwen2.5-Coder-32B-Instruct config.json' },
  { id: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek-R1 Distill Qwen 32B', family: 'DeepSeek', params: 32.8, layers: 64, kvHeads: 8, headDim: 128, released: '2025-01', ctx: 131072, license: 'mit', role: 'reasoning', source: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B config.json' },
  {
    id: 'qwen3.6-35b-a3b', name: 'Qwen3.6 35B-A3B (MoE)', family: 'Qwen', params: 36.0, active: 3, layers: 40, kvHeads: 2, headDim: 256,
    kv: [{ layers: 10, width: 1024 }], stateGb: 0.06,
    arch: '40 layers, of which only 10 are full attention (2 KV heads of dimension 256) and keep a cache that grows with the conversation; the other 30 are Gated DeltaNet linear-attention layers with a small fixed state',
    released: '2026-04', ctx: 262144, license: 'apache', note: 'All 256 experts stay in memory; 3B are active per token. ' + VISION, source: 'Qwen/Qwen3.6-35B-A3B config.json and model card',
  },
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', family: 'Llama', params: 70.6, layers: 80, kvHeads: 8, headDim: 128, released: '2024-12', ctx: 131072, license: 'llama', source: 'meta-llama/Llama-3.3-70B-Instruct config.json' },
  { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek-R1 Distill Llama 70B', family: 'DeepSeek', params: 70.6, layers: 80, kvHeads: 8, headDim: 128, released: '2025-01', ctx: 131072, license: 'mit', role: 'reasoning', source: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B config.json' },
  {
    id: 'qwen3-coder-next', name: 'Qwen3-Coder-Next 80B-A3B (MoE)', family: 'Qwen', params: 79.7, active: 3, layers: 48, kvHeads: 2, headDim: 256,
    kv: [{ layers: 12, width: 1024 }], stateGb: 0.08,
    arch: '48 layers, of which only 12 are full attention (2 KV heads of dimension 256) and keep a cache that grows with the conversation; the other 36 are Gated DeltaNet linear-attention layers with a small fixed state',
    released: '2026-01', ctx: 262144, license: 'apache', role: 'code', note: 'All 512 experts stay in memory; 3B are active per token, so it answers like a small model once it is loaded.', source: 'Qwen/Qwen3-Coder-Next config.json and model card',
  },
  {
    id: 'gpt-oss-120b', name: 'gpt-oss 120B', family: 'gpt-oss', params: 117, active: 5.1, layers: 36, kvHeads: 8, headDim: 64,
    kv: [{ layers: 18, width: 1024 }, { layers: 18, width: 1024, window: 128 }],
    arch: '36 layers with 8 KV heads of dimension 64, alternating full attention with a 128-token sliding window, so only half the layers keep a cache that grows',
    released: '2025-08', ctx: 131072, license: 'apache', note: 'Ships in MXFP4; OpenAI states it runs on a single 80 GB GPU. Choose the 4-bit row.', source: 'openai/gpt-oss-120b config.json',
  },
  {
    id: 'mistral-small-4-119b', name: 'Mistral Small 4 119B (MoE)', family: 'Mistral', params: 119, active: 6.5, layers: 36, kvHeads: 32, headDim: 128,
    kv: [{ layers: 36, width: 320 }],
    arch: '36 layers using multi-head latent attention: instead of keys and values for each of its 32 heads, every layer caches one compressed vector of 320 values per token',
    released: '2026-03', ctx: 262144, license: 'apache', note: 'Small in name only: all 128 experts stay in memory. A runtime that does not implement the latent cache needs several times more context memory. ' + VISION, source: 'mistralai/Mistral-Small-4-119B-2603 config.json and model card',
  },
];

export const modelById = (id: string) => models.find((m) => m.id === id);
/** The row read from this Hugging Face repo, if any; repo ids are case-insensitive on the Hub. */
export const modelByRepo = (repo: string) => models.find((m) => sourceLinks(m).repo.toLowerCase() === repo.toLowerCase());

export const gpuTiers = [
  { label: '8 GB', gb: 8, examples: 'RTX 3070, 4060, most gaming laptops' },
  { label: '12 GB', gb: 12, examples: 'RTX 3060 12 GB, 4070' },
  { label: '16 GB', gb: 16, examples: 'RTX 4060 Ti 16 GB, RTX 5060 Ti 16 GB' },
  { label: '24 GB', gb: 24, examples: 'RTX 3090, RTX 4090' },
  { label: '32 GB', gb: 32, examples: 'RTX 5090' },
  { label: '48 GB', gb: 48, examples: 'RTX 6000 Ada, L40S, A6000' },
  { label: '80 GB', gb: 80, examples: 'A100 80 GB, H100' },
  { label: '96 GB', gb: 96, examples: 'RTX PRO 6000 Blackwell' },
] as const;
