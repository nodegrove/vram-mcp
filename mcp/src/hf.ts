/**
 * Reading a model straight from Hugging Face: the parameter count from the Hub's
 * safetensors metadata and the architecture from config.json, by the same rules as the
 * model table (shapeFromConfig in @nodegrove/llm-math). Only public metadata is read,
 * never weights, and nothing is sent but the repo id.
 */
import { shapeFromConfig, hfLinks, ConfigError, type ConfigShape } from '../../llm-math/src/index.ts';

const HF = 'https://huggingface.co';
/** How long one lookup may wait for Hugging Face, all requests included. */
export const TIMEOUT_MS = 8000;

export class HfError extends Error {}

export interface HfModel {
  /** The repo as the Hub spells it. */
  repo: string;
  /** Where config.json was read: the repo itself, or an ungated copy of a gated one. */
  configFrom: string;
  params: number;
  shape: ConfigShape;
  gated: boolean;
  license: string | null;
  dtypes: string[];
  /** What the reading could not model, and anything about the checkpoint worth knowing. */
  warnings: string[];
  cardUrl: string;
  configUrl: string;
}

// On Cloudflare the Hub's answers are cached at the edge for an hour, and the Worker itself
// keeps nothing between requests. The local server keeps recent lookups in memory instead.
const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
const CACHE_MS = 3_600_000;
const recent = new Map<string, { at: number; model: Promise<HfModel> }>();

type Json = Record<string, unknown>;

async function getJson(url: string, signal: AbortSignal): Promise<{ status: number; body: Json | null }> {
  const init: RequestInit & { cf?: unknown } = {
    headers: { accept: 'application/json', 'user-agent': 'nodegrove-vram-mcp (+https://nodegrove.io/mcp)' },
    signal,
  };
  if (onWorkers) init.cf = { cacheTtl: 3600, cacheEverything: true };
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new HfError(`Hugging Face did not answer within ${TIMEOUT_MS / 1000} seconds. Try again, or describe the model with its architecture instead.`);
  }
  if (!r.ok) return { status: r.status, body: null };
  try {
    return { status: r.status, body: (await r.json()) as Json };
  } catch {
    return { status: 502, body: null };
  }
}

/** Packed integer dtypes hold several weights per element, so the Hub's count can understate them. */
const PACKED = /^(I32|I16|I8|U8|U4|I4)$/;

export function loadHfModel(repo: string): Promise<HfModel> {
  if (onWorkers) return read(repo);
  const key = repo.toLowerCase();
  const hit = recent.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.model;
  const model = read(repo);
  recent.set(key, { at: Date.now(), model });
  model.catch(() => recent.delete(key));
  return model;
}

async function read(repo: string): Promise<HfModel> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  // The Hub redirects any casing of a repo id to the canonical one, so both can go at once.
  let [info, config] = await Promise.all([getJson(`${HF}/api/models/${repo}`, signal), getJson(`${HF}/${repo}/resolve/main/config.json`, signal)]);
  if (!info.body) {
    throw new HfError(
      info.status === 404 || info.status === 401
        ? `There is no public Hugging Face repo "${repo}". Check the spelling (organisation/name), or use list_models.`
        : `Hugging Face answered ${info.status} for "${repo}". Try again in a moment.`,
    );
  }
  const meta = info.body;
  const canonical = typeof meta.id === 'string' ? meta.id : repo;
  const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];
  const card = (meta.cardData ?? {}) as Json;
  const base = Array.isArray(card.base_model) ? card.base_model[0] : card.base_model;
  const st = meta.safetensors as { total?: number; parameters?: Record<string, number> } | undefined;

  if (!st?.total) {
    if (tags.includes('gguf')) {
      throw new HfError(`${canonical} holds GGUF files, which carry no config.json to read. Ask about the original model instead${base ? `: ${String(base)}` : ''}.`);
    }
    throw new HfError(`${canonical} publishes no parameter count (no safetensors metadata). Describe it with its architecture instead (params_b, layers, kv_heads, head_dim from its config.json).`);
  }

  const gated = Boolean(meta.gated);
  let configFrom = canonical;
  if (!config.body && gated && (config.status === 401 || config.status === 403)) {
    // Gated repos only open config.json after a login. Unsloth keeps exact ungated copies of most.
    const mirror = `unsloth/${canonical.split('/')[1]}`;
    const copy = await getJson(`${HF}/${mirror}/resolve/main/config.json`, signal);
    if (copy.body) [config, configFrom] = [copy, mirror];
  }
  if (!config.body) {
    throw new HfError(
      gated
        ? `${canonical} is gated: its config.json needs a Hugging Face login, and no ungated copy was found. Describe it with its architecture instead.`
        : `${canonical} has no readable config.json (${config.status}).`,
    );
  }

  let shape: ConfigShape;
  try {
    shape = shapeFromConfig(config.body);
  } catch (e) {
    if (e instanceof ConfigError) throw new HfError(`${canonical}: ${e.message} Describe it with its architecture instead.`);
    throw e;
  }

  const dtypes = Object.keys(st.parameters ?? {});
  const warnings = [...shape.warnings];
  if (configFrom !== canonical) warnings.push(`${canonical} is gated, so config.json was read from its ungated copy ${configFrom}.`);
  if (dtypes.some((d) => PACKED.test(d))) {
    warnings.push(`This checkpoint stores packed quantised weights (${dtypes.join(', ')}), so the Hub's parameter count may understate the model. If it looks low, ask about the original repo${base ? ` (${String(base)})` : ''}.`);
  }
  if (shape.shippedQuantisation) warnings.push(`The checkpoint ships quantised (${shape.shippedQuantisation}); the estimate uses the quantisation you choose.`);

  return {
    repo: canonical,
    configFrom,
    params: Math.round((st.total / 1e9) * 100) / 100,
    shape,
    gated,
    license: typeof card.license === 'string' ? card.license : null,
    dtypes,
    warnings,
    cardUrl: hfLinks(canonical).card,
    configUrl: hfLinks(configFrom).config,
  };
}
