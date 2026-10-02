/**
 * The same server over Streamable HTTP on Cloudflare Workers: https://mcp.nodegrove.io/mcp
 *
 * Stateless: every request is answered by a fresh server, clients on the 2025 protocol
 * revisions and on 2026-07-28 alike. Nothing is stored and tool arguments are never logged.
 * A per-address rate limit keeps the free endpoint free.
 */
import { createMcpHandler } from '@modelcontextprotocol/server';
import { MODELS_UPDATED } from '../../llm-math/src/index.ts';
import { createServer, VERSION } from './server.ts';

/** Cloudflare's rate-limiting binding (wrangler.jsonc: ratelimits). */
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
interface Env {
  LIMITER?: RateLimit;
}

const DOCS = 'https://nodegrove.io/mcp';
const handler = createMcpHandler(() => createServer(), { responseMode: 'json' });

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
  'access-control-max-age': '86400',
};

function withCors(response: Response): Response {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (pathname === '/mcp') {
      if (env.LIMITER) {
        const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
        if (!success) {
          return withCors(
            Response.json(
              { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests from this address: the limit is 120 a minute. Try again shortly.' } },
              { status: 429, headers: { 'retry-after': '60' } },
            ),
          );
        }
      }
      return withCors(await handler.fetch(request));
    }

    if (pathname === '/health') return withCors(Response.json({ ok: true, version: VERSION, data_updated: MODELS_UPDATED }));
    if (pathname === '/' && request.method === 'GET') return Response.redirect(DOCS, 302);
    return withCors(new Response(`Not found. The MCP endpoint is /mcp; documentation: ${DOCS}\n`, { status: 404 }));
  },
};
