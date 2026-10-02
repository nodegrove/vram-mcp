/**
 * What each tool answers, as plain functions over @nodegrove/llm-math. server.ts wires
 * them to MCP; the tests and nodegrove.io/mcp call them directly. Every figure and every
 * shared sentence comes from the package: this file finds the model and the card, and
 * words and links the answer.
 */
import {
  models, gpus, quants, licenses, sourceLinks, gpuTiers, kvCaches, MODELS_UPDATED, METHOD, GROVE_GB, NODEGROVE_URL,
  check, cardOf, queryName, summarise, estimate, fitsTier, kvGroups, kvGbPer1kTokens, attentionOf, budgetOf, usableVramGb,
  gb, tok, quantOf, speedText, verdictLabel, settingsPhrase, beyondWindowNote, round1, modelPage, gpuPage, checkerUrl, calculatorUrl, modelByRepo,
  type ModelSpec, type GpuSpec, type CheckModel, type CheckCard, type KvGroup, type ModelFit, type QuantKey, type KvCacheKey,
} from '../../llm-math/src/index.ts';
import { findModel, findGpu, customCard, hfRepoOf, settle, words } from './catalog.ts';
import { loadHfModel, type HfModel } from './hf.ts';
import { ToolInputError } from './errors.ts';
import type { CanIRunInput, WhatFitsInput, EstimateInput, HfRepoInput, ListInput, ModelInput, GpuInput, ArchitectureInput } from './schemas.ts';

export { ToolInputError };

/** What a tool assumes when a field is left out. The input schemas advertise the same values. */
export const DEFAULTS = { quant: 'q4', context: 8192, kv_cache: 'fp16' } as const;

const ATTRIBUTION = 'Nodegrove (nodegrove.io), CC BY 4.0';
const EARLY_ACCESS = `${NODEGROVE_URL}/#early-access`;
const APPLE_NOTE = "Apple silicon: generation runs at the bandwidth ceiling's pace, but long prompts take a visible pause before the first token.";
const r2 = (n: number) => Math.round(n * 100) / 100;
const kvOf = (key: KvCacheKey | undefined) => kvCaches.find((k) => k.key === (key ?? DEFAULTS.kv_cache))!;
/** "an 8 GB card", "a 24 GB card": the article as the number is spoken. */
const article = (label: string) => (/^(8|11|18)\b|^8/.test(label) ? 'an' : 'a');
const capitalised = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;

// --- Models --------------------------------------------------------------------------

interface ResolvedModel {
  spec: CheckModel & { note?: string };
  source: 'nodegrove' | 'huggingface' | 'architecture';
  row?: ModelSpec;
  hf?: HfModel;
  notes: string[];
}

function architectureModel(a: ArchitectureInput): ResolvedModel {
  const kv: KvGroup[] | undefined = a.kv_groups?.length
    ? a.kv_groups.map((g) => ({ layers: g.layers, width: g.values_per_token, ...(g.window_tokens ? { window: g.window_tokens } : {}) }))
    : undefined;
  return {
    spec: {
      id: 'custom',
      name: `the ${round1(a.params_b)}B-parameter model`,
      params: a.params_b,
      active: a.active_params_b,
      layers: a.layers,
      kvHeads: a.kv_heads,
      headDim: a.head_dim,
      kv,
      stateGb: a.fixed_state_gb,
      ctx: a.native_context,
    },
    source: 'architecture',
    notes: [],
  };
}

const MOE_NOTE = 'Mixture of experts: no speed is given without active_params_b (the parameters read per token, from the model card).';
/** What a reading of a Hugging Face repo should tell the reader, beyond the figures. */
const hfWarnings = (hf: HfModel, active?: number) => [...hf.warnings, ...(hf.shape.moe && !active ? [MOE_NOTE] : [])];

function hfModel(hf: HfModel, active?: number): ResolvedModel {
  const s = hf.shape;
  return {
    spec: {
      id: hf.repo,
      name: hf.repo,
      params: hf.params,
      // A mixture-of-experts model whose active parameters nobody stated gets no speed, not a dense one.
      active: s.moe && !active ? null : active,
      layers: s.layers,
      kvHeads: s.kvHeads,
      headDim: s.headDim,
      kv: s.kv,
      stateGb: s.stateGb,
      ctx: s.ctx,
    },
    source: 'huggingface',
    hf,
    notes: [`Read live from ${hf.configFrom}'s config.json; nodegrove.io has not reviewed this model.`, ...hfWarnings(hf, active)],
  };
}

export async function resolveModel(input: ModelInput): Promise<ResolvedModel> {
  if (input.model && input.architecture) throw new ToolInputError('Give either model or architecture, not both.');
  if (input.architecture) return architectureModel(input.architecture);
  if (!input.model) throw new ToolInputError('Say which model: model (a name or id from list_models, or a Hugging Face repo id) or architecture (params_b, layers, kv_heads, head_dim).');
  const found = findModel(input.model);
  if (found.ok === 'hf') return hfModel(await loadHfModel(found.repo), input.active_params_b);
  const { item: m, notes } = settle(
    found,
    input.model,
    'model',
    `No model matches "${input.model}". Use a name or id from list_models, any Hugging Face repo id such as "Qwen/Qwen3-8B" (read live from its config.json), or architecture (params_b, layers, kv_heads, head_dim).`,
  );
  return { spec: { ...m, active: input.active_params_b ?? m.active }, source: 'nodegrove', row: m, notes };
}

function modelBlock(r: ResolvedModel) {
  const m = r.spec;
  const base = {
    name: m.name,
    params_b: m.params,
    active_params_b: m.active ?? null,
    attention: attentionOf(m),
    native_context_tokens: m.ctx ?? null,
    source: r.source,
  };
  if (r.row) {
    const src = sourceLinks(r.row);
    return {
      id: r.row.id,
      ...base,
      license: licenses[r.row.license].name,
      role: r.row.role ?? null,
      page_url: modelPage(r.row.id),
      hf_repo: src.repo,
      config_url: src.config,
      ...(src.gated ? { hf_gated: true } : {}),
    };
  }
  if (r.hf) return { id: r.hf.repo, ...base, license: r.hf.license, card_url: r.hf.cardUrl, config_url: r.hf.configUrl };
  return { id: null, ...base };
}

// --- Cards ---------------------------------------------------------------------------

interface ResolvedCard {
  /** As the sentences name it: a listed card by its spoken name, "RTX 4090". */
  card: CheckCard;
  /** The listed card's row; absent for a card described by its memory. */
  spec?: GpuSpec;
  apple: boolean;
  notes: string[];
}

const spokenCard = (g: GpuSpec): CheckCard => ({ ...cardOf(g), name: queryName(g.name) });
const cards = gpus.map(spokenCard);
const links = { model: modelPage, card: gpuPage };
/** A listed card is "the RTX 4090"; one described by its memory is already "your GPU (16 GB)". */
const cardRef = (r: ResolvedCard) => (r.spec ? `the ${r.card.name}` : r.card.name);

export function resolveCard(input: GpuInput): ResolvedCard {
  if (input.gpu && input.vram_gb) throw new ToolInputError('Give either gpu or vram_gb, not both.');
  if (input.vram_gb) {
    const card = customCard(input.vram_gb, input.bandwidth_gb_s, !!input.apple_silicon);
    const notes = input.bandwidth_gb_s ? [] : ["No bandwidth given, so no speed: pass bandwidth_gb_s from the maker's spec for a speed ceiling."];
    if (input.apple_silicon) notes.push(`Apple silicon: the GPU can use about ${gb(card.usableGb)} of the ${input.vram_gb} GB by default.`);
    return { card, apple: !!input.apple_silicon, notes };
  }
  if (!input.gpu) throw new ToolInputError('Say which GPU: gpu (a name or id from list_gpus) or vram_gb (and bandwidth_gb_s) for any other card.');
  const { item: g, notes } = settle(
    findGpu(input.gpu),
    input.gpu,
    'GPU',
    `No GPU matches "${input.gpu}". Use a name or id from list_gpus, or pass vram_gb (and bandwidth_gb_s for a speed ceiling) for any other card.`,
  );
  return { card: spokenCard(g), spec: g, apple: g.kind === 'apple', notes };
}

function gpuBlock(r: ResolvedCard) {
  const c = r.card;
  return {
    id: r.spec?.id ?? null,
    name: r.spec?.name ?? c.name,
    memory_gb: c.vramGb,
    usable_gb: r2(c.usableGb),
    budget_gb: r2(budgetOf(c.usableGb)),
    bandwidth_gb_s: c.bandwidthGBs,
    ...(r.spec ? { page_url: gpuPage(r.spec.id), spec_url: r.spec.spec } : {}),
  };
}

function assumptions(withSpeed: boolean) {
  return { memory: METHOD.memory, fit: METHOD.fit, ...(withSpeed ? { speed: METHOD.speed } : {}), caveat: METHOD.estimate };
}

// --- can_i_run -----------------------------------------------------------------------

export async function canIRun(input: CanIRunInput) {
  const model = await resolveModel(input);
  const gpu = resolveCard(input);
  const quant = input.quant ?? DEFAULTS.quant;
  const context = input.context ?? DEFAULTS.context;
  const kv = kvOf(input.kv_cache);
  const m = model.spec;
  const r = check({ model: m, card: gpu.card, quant, context, kvBytes: kv.bytes }, { models, cards }, { links, groveGb: GROVE_GB });

  const speed = r.tokensPerSecond;
  const settings = settingsPhrase(m.name, quant, context);
  const summary =
    r.verdict === 'no'
      ? `${verdictLabel(r.verdict)}: ${settings} needs ${gb(r.need.totalGb)}, and ${cardRef(gpu)} holds ${gb(r.budgetGb)} after headroom. Short by ${gb(-r.marginGb)}.`
      : `${verdictLabel(r.verdict)}: ${settings} needs ${gb(r.need.totalGb)} of the ${gb(r.budgetGb)} ${cardRef(gpu)} holds after headroom` +
        `${speed !== null ? `, generating ${speedText(speed)}` : ''}.`;

  const notes = [...model.notes, ...gpu.notes];
  if (r.beyondNativeWindow) notes.unshift(`${beyondWindowNote(context, m.ctx!)}.`);
  if (gpu.apple && r.verdict !== 'no') notes.push(APPLE_NOTE);

  return {
    summary,
    verdict: r.verdict,
    model: modelBlock(model),
    gpu: gpuBlock(gpu),
    settings: { quant: quantOf(quant).label, bytes_per_param: quantOf(quant).bytes, context_tokens: context, kv_cache: kv.label },
    memory_gb: {
      weights: round1(r.need.weightsGb),
      kv_cache: round1(r.need.kvGb),
      overhead: round1(r.need.overheadGb),
      total: round1(r.need.totalGb),
      total_with_q8_kv_cache: round1(r.needQ8KvGb),
    },
    spare_gb: r.marginGb >= 0 ? round1(r.marginGb) : null,
    short_by_gb: r.marginGb < 0 ? round1(-r.marginGb) : null,
    speed: speed === null ? null : { tokens_per_second_ceiling: Math.round(speed), reads: speedText(speed), feels: r.feels },
    max_context_tokens: r.maxContext,
    what_would_work: r.suggestions.map((s) => ({
      kind: s.kind,
      text: s.text,
      ...(s.quant ? { quant: quantOf(s.quant).label } : {}),
      ...(s.context ? { context_tokens: s.context } : {}),
      ...(s.cardId ? { gpu_id: s.cardId } : {}),
      ...(s.modelId ? { model_id: s.modelId } : {}),
      ...(s.needGb !== undefined ? { need_gb: round1(s.needGb) } : {}),
      ...(s.tokensPerSecond !== undefined ? { tokens_per_second_ceiling: Math.round(s.tokensPerSecond) } : {}),
    })),
    ...(r.groveText
      ? {
          hosted_option: {
            fits: r.groveText,
            what: 'Nodegrove: a private AI workspace in the cloud that stays saved between sessions, with the GPU attached while you use it.',
            status: 'Early access, not open yet.',
            url: EARLY_ACCESS,
          },
        }
      : {}),
    check_url: model.row && gpu.spec ? checkerUrl({ gpu: gpu.spec.id, model: model.row.id, quant, kvBytes: kv.bytes, context }) : null,
    notes,
    assumptions: assumptions(speed !== null),
    data_updated: MODELS_UPDATED,
    attribution: ATTRIBUTION,
  };
}

// --- what_fits -----------------------------------------------------------------------

export function whatFits(input: WhatFitsInput) {
  const gpu = resolveCard(input);
  const quant = input.quant ?? DEFAULTS.quant;
  const context = input.context ?? DEFAULTS.context;
  const hasSpeed = gpu.card.bandwidthGBs !== null;
  const sum = summarise(gpu.spec ?? gpu.card, quant, context);
  const pick = (f: ModelFit | undefined) =>
    f && {
      model_id: f.m.id,
      model: f.m.name,
      need_gb: f.needGb,
      verdict: f.verdict,
      tokens_per_second_ceiling: hasSpeed && f.fits ? f.tps : null,
      max_context_tokens: f.maxContext,
      role: f.m.role ?? null,
      page_url: modelPage(f.m.id),
    };
  const label = quantOf(quant).label;
  const s = sum.sweetSpot, big = sum.largest, miss = sum.firstMiss;
  const parts = [`${capitalised(cardRef(gpu))} fits ${sum.fits.length} of ${models.length} models at ${label} with ${tok(context)} tokens of context.`];
  if (s) parts.push(`Recommended: ${s.m.name}, ${gb(s.needGb)}${hasSpeed ? ` at ${speedText(s.tps)}` : ''}.`);
  if (big && big.m.id !== s?.m.id) parts.push(`Largest that fits: ${big.m.name}, ${gb(big.needGb)}.`);
  if (sum.bestQuality) parts.push(`Best at Q8: ${sum.bestQuality.m.name}.`);
  if (miss) parts.push(`First out of reach: ${miss.m.name}, ${gb(miss.needGb)}.`);

  return {
    summary: parts.join(' '),
    gpu: gpuBlock(gpu),
    settings: { quant: label, context_tokens: context, kv_cache: kvOf('fp16').label },
    recommended: pick(s) ?? null,
    recommended_means: hasSpeed ? METHOD.recommended : 'The biggest class of general-purpose model that fits; no bandwidth was given, so speed is not part of the choice.',
    largest_that_fits: pick(big) ?? null,
    best_quality_at_q8: sum.bestQuality ? { model_id: sum.bestQuality.m.id, model: sum.bestQuality.m.name, need_gb: sum.bestQuality.needGb, page_url: modelPage(sum.bestQuality.m.id) } : null,
    first_out_of_reach: pick(miss) ?? null,
    fits: [...sum.fits].sort((a, b) => b.needGb - a.needGb).map((f) => pick(f)!),
    does_not_fit: sum.misses.length,
    page_url: gpu.spec ? gpuPage(gpu.spec.id) : null,
    notes: gpu.notes,
    assumptions: assumptions(hasSpeed),
    data_updated: MODELS_UPDATED,
    attribution: ATTRIBUTION,
  };
}

// --- estimate_vram / estimate_from_hf_repo -------------------------------------------

/** Memory at each quantisation (or one), with the smallest common card that holds each, and the sentence that leads with Q4. */
function memoryAnswer(m: CheckModel, context: number, kvKey: KvCacheKey | undefined, only?: QuantKey) {
  const kv = kvOf(kvKey);
  const rows = quants
    .filter((q) => !only || q.key === only)
    .map((q) => {
      const e = estimate({ ...m, quant: q.key, context, kvBytes: kv.bytes });
      const tier = fitsTier(e.totalGb, gpuTiers);
      return {
        quant: q.label,
        quant_key: q.key,
        bytes_per_param: q.bytes,
        weights_gb: round1(e.weightsGb),
        kv_cache_gb: round1(e.kvGb),
        overhead_gb: round1(e.overheadGb),
        total_gb: round1(e.totalGb),
        smallest_card_class: tier ? { memory: tier.label, examples: tier.examples } : null,
      };
    });
  const lead = rows.find((x) => x.quant_key === DEFAULTS.quant) ?? rows[0]!;
  const fits = lead.smallest_card_class
    ? `fits ${article(lead.smallest_card_class.memory)} ${lead.smallest_card_class.memory} card`
    : `needs more than one ${gpuTiers.at(-1)!.label} card`;
  return { rows, lead, fits, kv, per1k: kvGbPer1kTokens(m, kv.bytes) };
}

export async function estimateVram(input: EstimateInput) {
  const model = await resolveModel(input);
  const context = input.context ?? DEFAULTS.context;
  const m = model.spec;
  const a = memoryAnswer(m, context, input.kv_cache, input.quant);
  const others = a.rows.filter((x) => x !== a.lead && (x.quant_key === 'q8' || x.quant_key === 'fp16'));
  return {
    summary:
      `${capitalised(m.name)} with ${tok(context)} tokens of context needs ${gb(a.lead.total_gb)} at ${a.lead.quant} (${a.fits})` +
      (others.length ? `; ${others.map((x) => `${gb(x.total_gb)} at ${x.quant}`).join(', ')}.` : '.'),
    model: modelBlock(model),
    context_tokens: context,
    kv_cache: a.kv.label,
    kv_cache_gb_per_1k_tokens: a.per1k,
    estimates: a.rows,
    page_url: model.row ? modelPage(model.row.id) : null,
    calculator_url: calculatorUrl({ model: model.row?.id ?? m, quant: input.quant ?? DEFAULTS.quant, kvBytes: a.kv.bytes, context }),
    notes: model.notes,
    assumptions: assumptions(false),
    data_updated: MODELS_UPDATED,
    attribution: ATTRIBUTION,
  };
}

export async function estimateFromHfRepo(input: HfRepoInput) {
  const repo = hfRepoOf(input.repo);
  if (!repo) throw new ToolInputError(`"${input.repo}" is not a Hugging Face repo id. Use organisation/name, e.g. "Qwen/Qwen3-8B", or its huggingface.co URL.`);
  const hf = await loadHfModel(repo);
  const s = hf.shape;
  const m = hfModel(hf, input.active_params_b).spec;
  const context = input.context ?? DEFAULTS.context;
  const a = memoryAnswer(m, context, input.kv_cache);
  const row = modelByRepo(hf.repo);
  return {
    summary:
      `${hf.repo}: ${hf.params}B parameters, ${s.attention} attention (${s.detail}). With ${tok(context)} tokens of context it needs ${gb(a.lead.total_gb)} at ${a.lead.quant} ` +
      `(${a.fits}); the KV cache grows ${a.per1k} GB per 1,000 tokens.`,
    repo: hf.repo,
    read_from: hf.configFrom,
    card_url: hf.cardUrl,
    config_url: hf.configUrl,
    license: hf.license,
    gated: hf.gated,
    architecture: {
      params_b: hf.params,
      active_params_b: input.active_params_b ?? null,
      layers: s.layers,
      kv_heads: s.kvHeads,
      head_dim: s.headDim,
      attention: s.attention,
      kv_groups: kvGroups(m).map((g) => ({ layers: g.layers, values_per_token: g.width, window_tokens: g.window ?? null })),
      fixed_state_gb: s.stateGb ?? null,
      native_context_tokens: s.ctx ?? null,
      mixture_of_experts: s.moe ? { experts: s.moe.experts, experts_per_token: s.moe.perToken } : null,
      detail: s.detail,
      checkpoint_dtypes: hf.dtypes,
    },
    context_tokens: context,
    kv_cache: a.kv.label,
    kv_cache_gb_per_1k_tokens: a.per1k,
    estimates: a.rows,
    ...(row ? { reviewed_row: { model_id: row.id, page_url: modelPage(row.id), note: 'nodegrove.io keeps a reviewed row for this repo; its figures match this reading.' } } : {}),
    warnings: hfWarnings(hf, input.active_params_b),
    assumptions: assumptions(false),
    attribution: ATTRIBUTION,
  };
}

// --- list_models / list_gpus ---------------------------------------------------------

/** Search words per entry, worked out once. */
const MODEL_WORDS = models.map((m) => new Set([m.name, m.id, m.family, m.role ?? ''].flatMap(words)));
const GPU_WORDS = gpus.map((g) => new Set([g.name, g.id, g.maker, g.kind].flatMap(words)));
const matching = (query: string | undefined, index: Set<string>[]) => {
  const q = query?.trim() ? words(query) : [];
  return (i: number) => q.every((w) => index[i]!.has(w));
};

export function listModels(input: ListInput) {
  const keep = matching(input.search, MODEL_WORDS);
  const rows = models
    .filter((_, i) => keep(i))
    .map((m) => ({
      id: m.id,
      name: m.name,
      family: m.family,
      params_b: m.params,
      active_params_b: m.active ?? null,
      attention: attentionOf(m),
      native_context_tokens: m.ctx,
      released: m.released,
      license: licenses[m.license].name,
      role: m.role ?? null,
      memory_q4_8k_gb: round1(estimate({ ...m, quant: 'q4', context: 8192 }).totalGb),
      page_url: modelPage(m.id),
    }));
  return {
    summary: `${rows.length} of ${models.length} open-weight models${input.search ? ` match "${input.search}"` : ''}, each verified against its config.json. For any other model, pass its Hugging Face repo id to the other tools.`,
    models: rows,
    data_updated: MODELS_UPDATED,
    attribution: ATTRIBUTION,
  };
}

export function listGpus(input: ListInput) {
  const keep = matching(input.search, GPU_WORDS);
  const rows = gpus
    .filter((_, i) => keep(i))
    .map((g) => ({
      id: g.id,
      name: g.name,
      maker: g.maker,
      kind: g.kind,
      memory_gb: g.vramGb,
      usable_gb: r2(usableVramGb(g)),
      bandwidth_gb_s: g.bandwidthGBs,
      page_url: gpuPage(g.id),
      spec_url: g.spec,
    }));
  return {
    summary: `${rows.length} of ${gpus.length} GPUs and machines${input.search ? ` match "${input.search}"` : ''}, with the makers' memory and bandwidth figures. For any other card, pass vram_gb (and bandwidth_gb_s) to the other tools.`,
    gpus: rows,
    data_updated: MODELS_UPDATED,
    attribution: ATTRIBUTION,
  };
}
