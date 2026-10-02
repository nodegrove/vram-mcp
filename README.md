<p align="center">
  <a href="https://nodegrove.io/mcp">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/nodegrove-on-dark.png">
      <img src="assets/nodegrove-on-light.png" alt="nodegrove" width="300">
    </picture>
  </a>
</p>

<h1 align="center">Can I run it?</h1>

<p align="center">
  An MCP server that tells your AI assistant whether an open-weight LLM fits your GPU, and what would fit instead.<br>
  The arithmetic behind <a href="https://nodegrove.io">nodegrove.io</a>, for any model on Hugging Face and any card.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nodegrove/vram-mcp"><img src="https://img.shields.io/npm/v/@nodegrove/vram-mcp?label=npm" alt="npm"></a>
  <a href="https://github.com/nodegrove/vram-mcp/actions/workflows/ci.yml"><img src="https://github.com/nodegrove/vram-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

---

> **Can my RTX 4090 run Llama 3.3 70B?**
>
> No: Llama 3.3 70B at Q4_K_M with 8,192 tokens of context needs 45.8 GB, and the RTX 4090 holds 22.8 GB after headroom. Short by 23 GB. What would work instead:
>
> - No context length helps: the weights alone are 43.1 GB before a single token of conversation.
> - **RTX 6000 Ada** (48 GB) is within a whisker: 45.8 GB against 45.6 GB after headroom. With the KV cache at Q8 it needs 44.4 GB and fits.
> - The smallest card here that runs it exactly as asked: **A100**, 80 GB usable.
> - The biggest model your card does run at these settings, counting mixture-of-experts models at their dense equivalent: **Qwen3 32B**, 22.4 GB at ~37 tokens/s.

That is the server's own answer, word for word. Every figure is a stated formula over the model's `config.json` and the card's published specs: no benchmarks, no guesses. It is free, read-only, and needs no account or key.

## Connect

### Remote: nothing to install

```
https://mcp.nodegrove.io/mcp
```

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=nodegrove-vram&config=eyJ1cmwiOiJodHRwczovL21jcC5ub2RlZ3JvdmUuaW8vbWNwIn0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=nodegrove-vram&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.nodegrove.io%2Fmcp%22%7D)
[![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=nodegrove-vram&config=eyJ1cmwiOiJodHRwczovL21jcC5ub2RlZ3JvdmUuaW8vbWNwIn0%3D)

<details>
<summary><b>Claude</b> (claude.ai and the desktop app)</summary>

Customize → Connectors → Add → Add custom connector. Name it `Nodegrove VRAM`, paste the URL, choose **No sign-in**, then turn it on in a chat from **+ → Connectors**.
</details>

<details>
<summary><b>Claude Code</b></summary>

```sh
claude mcp add --transport http nodegrove-vram https://mcp.nodegrove.io/mcp
```

Add `--scope user` to have it in every project.
</details>

<details>
<summary><b>Cursor</b></summary>

`~/.cursor/mcp.json`:

```json
{ "mcpServers": { "nodegrove-vram": { "url": "https://mcp.nodegrove.io/mcp" } } }
```
</details>

<details>
<summary><b>VS Code</b></summary>

`.vscode/mcp.json`:

```json
{ "servers": { "nodegrove-vram": { "type": "http", "url": "https://mcp.nodegrove.io/mcp" } } }
```
</details>

<details>
<summary><b>Devin Desktop</b> (formerly Windsurf)</summary>

```sh
devin mcp add -s user nodegrove-vram https://mcp.nodegrove.io/mcp
```
</details>

<details>
<summary><b>LM Studio</b></summary>

Program → Install → Edit `mcp.json`:

```json
{ "mcpServers": { "nodegrove-vram": { "url": "https://mcp.nodegrove.io/mcp" } } }
```
</details>

<details>
<summary><b>Open WebUI</b></summary>

Admin Settings → Integrations → External Tool Servers → Add Connection. Type **MCP (Streamable HTTP)**, the URL above, authentication **None**.
</details>

<details>
<summary><b>Cline</b></summary>

The type must be stated, or Cline treats a URL as the older SSE transport:

```json
{ "mcpServers": { "nodegrove-vram": { "type": "streamableHttp", "url": "https://mcp.nodegrove.io/mcp" } } }
```
</details>

<details>
<summary><b>Codex CLI</b></summary>

```sh
codex mcp add nodegrove-vram --url https://mcp.nodegrove.io/mcp
```
</details>

<details>
<summary><b>Gemini CLI</b></summary>

```sh
gemini mcp add -s user --transport http nodegrove-vram https://mcp.nodegrove.io/mcp
```
</details>

<details>
<summary><b>Zed</b></summary>

`settings.json`:

```json
{ "context_servers": { "nodegrove-vram": { "url": "https://mcp.nodegrove.io/mcp" } } }
```
</details>

<details>
<summary><b>ChatGPT</b></summary>

Settings → Security and login → turn on **Developer mode**. At chatgpt.com/plugins, add one with the URL and **No Authentication**, then pick it in a chat from **+ → Developer mode**.
</details>

### Local: over stdio

Needs Node.js 20 or newer:

```json
{
  "mcpServers": {
    "nodegrove-vram": {
      "command": "npx",
      "args": ["-y", "@nodegrove/vram-mcp"]
    }
  }
}
```

## Tools

| Tool | Ask it | It answers with |
|---|---|---|
| `can_i_run` | Can my RTX 4090 run Llama 3.3 70B with 32k of context? | Fits, tight or no; the memory split; a speed ceiling; the longest context that fits; and on a no, every change that would make it fit |
| `what_fits` | What is the best model for my 16 GB card? | Every model checked on one card, with a recommended everyday pick, the largest that fits, the best at Q8 and the first out of reach |
| `estimate_vram` | How much VRAM does Qwen3 32B need at 64k? | Weights, KV cache and overhead at each quantisation, and the smallest common card that holds each |
| `estimate_from_hf_repo` | How much memory does `Qwen/Qwen3-Next-80B-A3B-Instruct` need? | Any Hugging Face repo, read from its `config.json`: the attention layout, the cost of each 1,000 tokens of context, and memory at every quantisation |
| `list_models`, `list_gpus` | Which GPUs do you know? | The models and cards with their specs, ids and pages |

Models can be named the way people type them ("llama 3.3 70b", `Llama-3.3-70B-Instruct`) or given as any Hugging Face repo id. Cards can be named ("4090", "M4 Max") or described by their memory and bandwidth. Every answer carries the numbers as fields, links to the model and card pages on nodegrove.io, and the assumptions behind each figure. All six tools are read-only.

## How the numbers are made

- **Memory** is weights + KV cache + overhead. Weights are parameters × bytes per parameter at the quantisation: FP16 2.00, Q8_0 1.06, Q6_K 0.82, Q5_K_M 0.71, Q4_K_M 0.58, Q3_K_M 0.47. Overhead is 0.5 GB plus 4% of the weights.
- **The KV cache is counted the way each model caches.** Sliding-window layers stop at their window, hybrid models (linear attention or Mamba) grow a cache only on their few full-attention layers, and latent attention stores one compressed vector per layer. A standard-transformer formula would overstate these models several times over at long context.
- **Fit** means at most 95% of the memory a runtime can address; above 85% it is tight. Apple silicon gives the GPU about 75% of unified memory.
- **Speed** is 0.7 × memory bandwidth ÷ bytes of active weights read per token. It is a single-stream ceiling, not a measurement, and the faster the figure, the further real runtimes fall below it.
- **The model table** was read from each model's `config.json` and checked against Hugging Face. **Any other repo** is read live by the same rules, which reproduce every row of the table; anything the reader cannot model is named in the answer, never guessed.

The full method, with every constant, is at [nodegrove.io/data](https://nodegrove.io/data#method). The same figures are an open dataset under CC BY 4.0, [DOI 10.5281/zenodo.22966137](https://doi.org/10.5281/zenodo.22966137).

## The math as a library

The server is a thin layer over [`@nodegrove/llm-math`](llm-math), the package nodegrove.io's pages and calculators are built on:

```sh
npm install @nodegrove/llm-math
```

```ts
import { modelById, estimate } from '@nodegrove/llm-math';

estimate({ ...modelById('llama-3.3-70b')!, quant: 'q4', context: 8192 }).totalGb; // 45.77
```

## Privacy

The remote server runs on Cloudflare Workers. Nodegrove keeps no request logs and no record of what you ask: each request is answered by a fresh, stateless instance and forgotten. Cloudflare keeps standard edge logs for a short period, as for any website. Requests are rate-limited to 120 a minute per address. When you ask about a Hugging Face repo, the server fetches that repo's public `config.json` and metadata; only the repo name is sent. The local version contacts nothing but huggingface.co, and only when you ask about a repo there. Details: [nodegrove.io/privacy](https://nodegrove.io/privacy#mcp).

## Run your own

The remote endpoint is [`mcp/src/worker.ts`](mcp/src/worker.ts). To deploy a copy to your Cloudflare account, change the route in [`mcp/wrangler.jsonc`](mcp/wrangler.jsonc), then:

```sh
cd mcp && npm install && npx wrangler deploy
```

## Development

```sh
cd llm-math && npm install && npm test
cd mcp && npm install && npm test && npm run build
```

`llm-math/` is the package of formulas and data; `mcp/` is the server, with the stdio entry (`src/stdio.ts`), the Worker (`src/worker.ts`) and the tools (`src/tools.ts`). This repository is published from Nodegrove's main repository, where the site uses the same package. Issues and pull requests are welcome here; accepted changes are applied upstream and credited.

Found a figure that disagrees with its source? [Open an issue](https://github.com/nodegrove/vram-mcp/issues) with the model or card and the link. To report a security problem, see [SECURITY.md](SECURITY.md).

## Licence

The code is [MIT](LICENSE). The model and GPU data, `llm-math/src/models.ts` and `llm-math/src/gpus.ts`, is [CC BY 4.0](LICENSE-DATA.md): use it for anything, and credit Nodegrove (nodegrove.io).

Model and GPU names are trademarks of their owners.
