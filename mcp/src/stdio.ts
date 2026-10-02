/**
 * The server over stdin/stdout, for an MCP client on your own machine:
 *   npx -y @nodegrove/vram-mcp
 * It sends nothing anywhere, except to huggingface.co when you ask about a repo there.
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.ts';

const handle = serveStdio(() => createServer());
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void handle.close());
