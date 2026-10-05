# @nodegrove/llm-math

How much memory an open-weight LLM needs on a GPU, how fast it can generate, and what to change when it does not fit.

This is the arithmetic behind every figure on [nodegrove.io](https://nodegrove.io). Its model and GPU pages, its calculators, its [open dataset](https://nodegrove.io/data) and its [MCP server](https://github.com/nodegrove/vram-mcp) all import this package, so they cannot disagree. Nothing in it is measured: memory is a stated formula over each model's `config.json`, speed is a stated bandwidth ceiling, and GPU figures are the makers' specifications.

```sh
npm install @nodegrove/llm-math
```

## Use

```ts
import { modelById, gpus, models, estimate, check, cardOf } from '@nodegrove/llm-math';

const llama = modelById('llama-3.3-70b')!;

estimate({ ...llama, quant: 'q4', context: 8192 });
// { weightsGb: 40.95, kvGb: 2.68, overheadGb: 2.14, totalGb: 45.77 }

const rtx4090 = cardOf(gpus.find((g) => g.id === 'rtx-4090')!);
const answer = check({ model: llama, card: rtx4090, quant: 'q4', context: 8192 }, { models, cards: gpus.map(cardOf) });

answer.verdict;                          // 'no'
answer.suggestions.map((s) => s.kind);   // ['no-context', 'near-miss-card', 'smallest-card', 'biggest-model']
```

Any model, described by its shape:

```ts
estimate({ params: 8, layers: 32, kvHeads: 8, headDim: 128, quant: 'q4', context: 32768 }).totalGb; // 9.6
```

Any Hugging Face model, read from its `config.json` by the same rules as the built-in table:

```ts
import { shapeFromConfig } from '@nodegrove/llm-math';

const config = await (await fetch('https://huggingface.co/Qwen/Qwen3-8B/resolve/main/config.json')).json();
const shape = shapeFromConfig(config); // layers, KV heads, cache groups, attention kind, warnings
```

## The method

- **Memory** = weights + KV cache + overhead. Weights are parameters × bytes per parameter at the quantisation (FP16 2.00, Q8_0 1.06, Q6_K 0.82, Q5_K_M 0.71, Q4_K_M 0.58, Q3_K_M 0.47; effective averages that include scales and unquantised embeddings). Overhead is 0.5 GB plus 4% of the weights.
- **KV cache** is counted the way each architecture actually caches. A standard transformer stores keys and values for every layer and every token. Sliding-window layers (Gemma, gpt-oss) stop growing at their window. Hybrid models (Qwen3.5 and later, Nemotron, Granite 4) keep a cache only on their few full-attention layers and a small fixed state on the rest. Latent attention (DeepSeek, GLM, Mistral Small 4) caches one compressed vector per layer.
- **Fit**: a model fits when its total is at most 95% of the memory a runtime can address, and is tight above 85%. Apple silicon gives the GPU about 75% of unified memory by default.
- **Speed** is 0.7 × memory bandwidth ÷ bytes of active weights read per token: a single-stream decode ceiling, not a measurement. The faster the figure, the further real runtimes fall below it, so speeds of 100 tokens/s or more are labelled "at most".

## What is in it

| Export | Answers |
|---|---|
| `estimate`, `kvCacheGb`, `kvPerTokenGb`, `maxContextTokens` | Memory at a quantisation and context, and the longest context a budget holds |
| `tokensPerSecond`, `isCeiling`, `describeSpeed` | The decode-speed ceiling, and how it reads |
| `fitModel`, `summarise` | One model on one card; every model on one card, with a recommendation |
| `check` | The verdict on a model and a card, and every computed alternative when it does not fit |
| `shapeFromConfig`, `attentionOf` | A Hugging Face `config.json` read into the shape the formulas need |
| `models`, `gpus`, `MODELS_UPDATED` | The data: the open-weight models and the GPUs and machines nodegrove.io covers, each with its source |

## Licence

The code is [MIT](LICENSE). The model and GPU tables, `src/models.ts` and `src/gpus.ts`, are [CC BY 4.0](LICENSE-DATA.md): use them for anything, and credit Nodegrove ([nodegrove.io](https://nodegrove.io)).
