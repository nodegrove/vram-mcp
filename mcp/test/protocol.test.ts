/**
 * The Worker as MCP clients meet it: real JSON-RPC over HTTP through its fetch handler,
 * once with a client on the 2025 handshake and once on the stateless 2026-07-28 revision.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import worker from '../src/worker.ts';

const ENDPOINT = new URL('https://mcp.nodegrove.io/mcp');
const viaWorker = (url: string | URL, init?: RequestInit) => worker.fetch(new Request(url, init), {});

async function connect(modern: boolean) {
  const client = new Client(
    { name: 'protocol-test', version: '1.0.0' },
    modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  );
  await client.connect(new StreamableHTTPClientTransport(ENDPOINT, { fetch: viaWorker }));
  return client;
}

for (const [label, modern] of [['2025 handshake', false], ['2026-07-28, stateless', true]] as const) {
  test(`${label}: six read-only tools, and an answer`, async () => {
    const client = await connect(modern);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['can_i_run', 'estimate_from_hf_repo', 'estimate_vram', 'list_gpus', 'list_models', 'what_fits']);
    for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true, t.name);

    const r = await client.callTool({ name: 'can_i_run', arguments: { model: 'llama-3.3-70b', gpu: 'rtx-4090' } });
    assert.equal(r.isError, undefined);
    const s = r.structuredContent as { verdict: string; memory_gb: { total: number } };
    assert.equal(s.verdict, 'no');
    assert.equal(s.memory_gb.total, 45.8);

    const bad = await client.callTool({ name: 'can_i_run', arguments: { model: 'no such model', gpu: 'rtx-4090' } });
    assert.equal(bad.isError, true);
    await client.close();
  });
}

test('the root sends people to the documentation, and /health answers', async () => {
  const root = await worker.fetch(new Request('https://mcp.nodegrove.io/'), {});
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), 'https://nodegrove.io/mcp');
  const health = await worker.fetch(new Request('https://mcp.nodegrove.io/health'), {});
  assert.equal(((await health.json()) as { ok: boolean }).ok, true);
});

test('over the rate limit, the endpoint says so with a 429', async () => {
  const limited = { LIMITER: { limit: async () => ({ success: false }) } };
  const r = await worker.fetch(new Request(ENDPOINT, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), limited);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});
