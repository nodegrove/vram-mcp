/**
 * The MCP server: six read-only tools over @nodegrove/llm-math. One factory serves both
 * entry points, the stdio binary (stdio.ts) and the Cloudflare Worker (worker.ts).
 */
import { McpServer } from '@modelcontextprotocol/server';
import pkg from '../package.json' with { type: 'json' };
import { MODELS_UPDATED } from '../../llm-math/src/index.ts';
import { canIRun, whatFits, estimateVram, estimateFromHfRepo, listModels, listGpus } from './tools.ts';
import { canIRunInput, whatFitsInput, estimateVramInput, hfRepoInput, listInput } from './schemas.ts';
import { ToolInputError } from './errors.ts';
import { HfError } from './hf.ts';

export const VERSION: string = pkg.version;

const INSTRUCTIONS = [
  'Answers whether an open-weight LLM fits a GPU, with the formulas nodegrove.io publishes.',
  'Use can_i_run for "can my GPU run this model", what_fits for "what can my GPU run", estimate_vram for memory at each quantisation,',
  'estimate_from_hf_repo to read any Hugging Face repo, and list_models / list_gpus to find ids.',
  "Figures are estimates from stated formulas over config.json values and makers' specs, never benchmarks, and speeds are upper bounds:",
  'say so when you quote them, and give the page link from the result. The data is CC BY 4.0: credit Nodegrove (nodegrove.io).',
].join(' ');

type Result = Record<string, unknown>;

/** Compact JSON in the text block, which most clients put in the model's context, and the same object as structured content. */
const ok = (result: Result) => ({ content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result });

/** A question the tool cannot answer as asked comes back as a tool error that says what would work. */
async function answer(run: () => Result | Promise<Result>) {
  try {
    return ok(await run());
  } catch (e) {
    if (e instanceof ToolInputError || e instanceof HfError) return { content: [{ type: 'text' as const, text: e.message }], isError: true };
    throw e;
  }
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'nodegrove-vram',
      title: 'Nodegrove VRAM: can I run it?',
      version: VERSION,
      websiteUrl: 'https://nodegrove.io/mcp',
      icons: [{ src: 'https://nodegrove.io/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] }],
    },
    {
      instructions: INSTRUCTIONS,
      // The tool list only changes with a release.
      cacheHints: { 'tools/list': { ttlMs: 3_600_000, cacheScope: 'public' }, 'server/discover': { ttlMs: 3_600_000, cacheScope: 'public' } },
    },
  );

  server.registerTool(
    'can_i_run',
    {
      title: 'Can I run it?',
      description:
        'Can this GPU run this open-weight LLM? Returns fits, tight or no, the memory split (weights, KV cache, overhead), a decode-speed ceiling, ' +
        'the longest context that fits and, on a no, every change that would make it fit: quantisation, KV cache, context, another card or a smaller model. ' +
        'Model: a name or id from list_models, any Hugging Face repo id, or its architecture. GPU: a name or id from list_gpus, or vram_gb for any other card.',
      inputSchema: canIRunInput,
      annotations: { ...readOnly, openWorldHint: true },
    },
    (args) => answer(() => canIRun(args)),
  );

  server.registerTool(
    'what_fits',
    {
      title: 'What fits my GPU?',
      description:
        'Which open-weight LLMs fit this GPU: every model in list_models checked at one quantisation and context, with a recommended everyday model ' +
        '(the biggest class that fits with room for context at conversational speed), the largest that fits, the best at Q8 and the first out of reach. ' +
        'GPU: a name or id from list_gpus, or vram_gb for any other card.',
      inputSchema: whatFitsInput,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (args) => answer(() => whatFits(args)),
  );

  server.registerTool(
    'estimate_vram',
    {
      title: 'Estimate VRAM',
      description:
        'How much memory an LLM needs: weights + KV cache + overhead at each quantisation (or one), at a given context, and the smallest common card class that holds each. ' +
        'Model: a name or id from list_models, any Hugging Face repo id, or its architecture (params_b, layers, kv_heads, head_dim).',
      inputSchema: estimateVramInput,
      annotations: { ...readOnly, openWorldHint: true },
    },
    (args) => answer(() => estimateVram(args)),
  );

  server.registerTool(
    'estimate_from_hf_repo',
    {
      title: 'Estimate VRAM from a Hugging Face repo',
      description:
        "Reads any Hugging Face model repo's config.json and parameter count and estimates its memory: the attention layout found (standard, sliding-window, " +
        'hybrid or latent), how much each 1,000 tokens of context costs, and weights + KV cache + overhead at every quantisation. ' +
        'For models nodegrove.io has not reviewed; anything the reader cannot model is listed in warnings.',
      inputSchema: hfRepoInput,
      annotations: { ...readOnly, openWorldHint: true },
    },
    (args) => answer(() => estimateFromHfRepo(args)),
  );

  server.registerTool(
    'list_models',
    {
      title: 'List models',
      description:
        `The open-weight LLMs nodegrove.io has verified against their config.json (data version ${MODELS_UPDATED}): id, size, attention design, native context, ` +
        "licence, memory at Q4 with 8k context and each model's page.",
      inputSchema: listInput,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (args) => answer(() => listModels(args)),
  );

  server.registerTool(
    'list_gpus',
    {
      title: 'List GPUs',
      description: "The GPUs and machines nodegrove.io covers: memory, the memory a runtime can use and bandwidth, from the makers' specs, with each one's page.",
      inputSchema: listInput,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (args) => answer(() => listGpus(args)),
  );

  return server;
}
