# @nodegrove/vram-mcp

An MCP server that tells your AI assistant whether an open-weight LLM fits your GPU, and what would fit instead. The arithmetic behind [nodegrove.io](https://nodegrove.io), for any model on Hugging Face and any card. Free, read-only, no account or key.

> **Can my RTX 4090 run Llama 3.3 70B?**
>
> No: Llama 3.3 70B at Q4_K_M with 8,192 tokens of context needs 45.8 GB, and the RTX 4090 holds 22.8 GB after headroom. Short by 23 GB. The RTX 6000 Ada (48 GB) is within a whisker: with the KV cache at Q8 it needs 44.4 GB and fits.

## Use it

Over stdio, with Node.js 20 or newer:

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

Or remotely, with nothing to install: `https://mcp.nodegrove.io/mcp` (Streamable HTTP, no authentication). Setup for Claude, Cursor, VS Code, ChatGPT and other clients: [nodegrove.io/mcp](https://nodegrove.io/mcp#connect).

## Tools

| Tool | Answers |
|---|---|
| `can_i_run` | Fits, tight or no, the memory split, a speed ceiling, the longest context that fits, and on a no every change that would make it fit |
| `what_fits` | Every model checked on one card, with a recommended pick, the largest that fits and the best at Q8 |
| `estimate_vram` | Weights, KV cache and overhead at each quantisation, and the smallest common card that holds each |
| `estimate_from_hf_repo` | Any Hugging Face repo, read from its `config.json`, with memory at every quantisation |
| `list_models`, `list_gpus` | The models and cards, with their specs and pages |

Every figure is a stated formula over `config.json` values and the makers' specs, never a benchmark; speeds are ceilings. The method is at [nodegrove.io/data](https://nodegrove.io/data#method).

## Privacy

The local server sends nothing to Nodegrove. It contacts huggingface.co, and only when you ask about a repo there, to read that repo's public `config.json`.

## Licence

MIT for the code; the bundled model and GPU data is [CC BY 4.0](LICENSE-DATA.md). Credit Nodegrove ([nodegrove.io](https://nodegrove.io)).
