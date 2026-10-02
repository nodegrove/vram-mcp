# Installing the Nodegrove VRAM MCP server

No API key, no account and no environment variables are needed. Pick one of the two ways.

## Remote (recommended)

A server named `nodegrove-vram` with the Streamable HTTP transport and this URL:

```
https://mcp.nodegrove.io/mcp
```

In Cline's `cline_mcp_settings.json` the type must be stated, or the URL is treated as the older SSE transport:

```json
{
  "mcpServers": {
    "nodegrove-vram": {
      "type": "streamableHttp",
      "url": "https://mcp.nodegrove.io/mcp"
    }
  }
}
```

## Local (stdio)

Needs Node.js 20 or newer. Nothing to clone or build:

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

## Check it works

Call `list_models`: it returns the models with their ids. Then call `can_i_run` with `{"model": "llama-3.3-70b", "gpu": "rtx-4090"}`: the verdict is `no`, with 45.8 GB needed and a list of what would work instead.
