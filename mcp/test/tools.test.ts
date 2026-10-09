/**
 * The answers, called directly. Hugging Face is replaced by a stub that serves a real
 * config.json from the llm-math fixtures, so these tests never touch the network.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canIRun, whatFits, estimateVram, estimateFromHfRepo, listModels, listGpus, resolveCard, ToolInputError } from '../src/tools.ts';
import { HfError } from '../src/hf.ts';

const fixtures = JSON.parse(readFileSync(new URL('../../llm-math/test/fixtures/configs.json', import.meta.url), 'utf8'));
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  // A repo the table does not list, with Qwen3.8 27B's real config and the row's parameter count.
  if (url.endsWith('/api/models/test-org/hybrid-27b')) {
    return Response.json({ id: 'test-org/hybrid-27b', safetensors: { total: 27_800_000_000, parameters: { BF16: 27_800_000_000 } }, cardData: { license: 'apache-2.0' }, tags: [] });
  }
  if (url.endsWith('/test-org/hybrid-27b/resolve/main/config.json')) return Response.json(fixtures['qwen3.8-27b'].config);
  if (url.endsWith('/api/models/test-org/only-gguf')) return Response.json({ id: 'test-org/only-gguf', tags: ['gguf'], cardData: { base_model: 'Qwen/Qwen3-8B' } });
  return new Response('not found', { status: 404 });
}) as typeof fetch;
after(() => void (globalThis.fetch = realFetch));

test('can_i_run: a 70B model on a 24 GB card says no, why, and what would work', async () => {
  const r = await canIRun({ model: 'Llama 3.3 70B', gpu: '4090' });
  assert.equal(r.verdict, 'no');
  assert.equal(r.memory_gb.total, 45.8);
  assert.equal(r.short_by_gb, 23);
  assert.equal(r.gpu.id, 'rtx-4090');
  assert.deepEqual(r.what_would_work.map((s) => s.kind), ['no-context', 'near-miss-card', 'smallest-card', 'biggest-model']);
  assert.equal(r.hosted_option?.url, 'https://nodegrove.io/#early-access');
  assert.equal(r.check_url, 'https://nodegrove.io/tools/can-i-run-it?gpu=rtx-4090&model=llama-3.3-70b&quant=q4&kv=2&ctx=8192');
  assert.equal(r.speed, null);
});

test('can_i_run: a yes carries a speed ceiling and no hosted option', async () => {
  const r = await canIRun({ model: 'qwen3-32b', gpu: 'rtx-4090' });
  assert.equal(r.verdict, 'tight');
  assert.equal(r.memory_gb.total, 22.4);
  assert.ok(r.speed && r.speed.tokens_per_second_ceiling > 0);
  assert.equal('hosted_option' in r, false);
});

test('can_i_run: any card by its memory, Apple unified memory at 75%', async () => {
  const r = await canIRun({ model: 'llama-3.3-70b', vram_gb: 64, apple_silicon: true });
  assert.equal(r.gpu.usable_gb, 48);
  assert.equal(r.gpu.id, null);
  assert.equal(r.check_url, null);
  assert.match(r.summary, /your Mac \(64 GB unified memory\)/);
});

test('names resolve the way people type them, and ties are asked back', () => {
  assert.equal(resolveCard({ gpu: '4090' }).card.id, 'rtx-4090');
  assert.equal(resolveCard({ gpu: 'M4 Max 128GB' }).card.id, 'm4-max');
  assert.equal(resolveCard({ gpu: 'NVIDIA A100' }).card.id, 'a100-80');
  assert.throws(() => resolveCard({ gpu: '24 GB' }), (e: Error) => e instanceof ToolInputError && /rtx-3090.*rtx-4090/.test(e.message));
  assert.throws(() => resolveCard({ gpu: 'RTX 4080' }), /vram_gb/);
  // A variant suffix is a different card: it matches only when the query says it.
  assert.equal(resolveCard({ gpu: 'RTX 4080 SUPER' }).card.id, 'rtx-4080-super');
  assert.equal(resolveCard({ gpu: 'RTX 5070' }).card.id, 'rtx-5070');
  assert.equal(resolveCard({ gpu: 'RTX 5070 Ti' }).card.id, 'rtx-5070-ti');
  assert.equal(resolveCard({ gpu: 'RTX PRO 4000' }).card.id, 'rtx-pro-4000');
  assert.equal(resolveCard({ gpu: '7900 XT' }).card.id, 'rx-7900-xt');
  assert.throws(() => resolveCard({ gpu: 'RX 9070' }), /vram_gb/);
});

test('a model name that fits two rows picks the closer one and names the other', async () => {
  const r = await canIRun({ model: 'llama 70b', gpu: 'rtx-3090' });
  assert.equal(r.model.id, 'llama-3.3-70b');
  assert.match(r.notes[0]!, /DeepSeek-R1 Distill Llama 70B/);
});

test('what_fits matches the GPU pages: same picks at Q4 with 8k context', () => {
  const r = whatFits({ gpu: 'rtx-4090' });
  assert.ok(r.recommended);
  assert.equal(r.first_out_of_reach?.model_id, 'llama-3.3-70b');
  assert.equal(r.page_url, 'https://nodegrove.io/gpus/rtx-4090');
  assert.ok(r.fits.every((f, i, all) => i === 0 || all[i - 1]!.need_gb >= f.need_gb));
});

test('estimate_vram: every quantisation, and the published figure', async () => {
  const r = await estimateVram({ model: 'gemma-3-27b', context: 32768 });
  assert.equal(r.estimates.length, 6);
  assert.equal(r.estimates.find((x) => x.quant_key === 'q4')?.total_gb, 20.1);
  const one = await estimateVram({ architecture: { params_b: 8, layers: 32, kv_heads: 8, head_dim: 128 }, quant: 'q4' });
  assert.equal(one.estimates.length, 1);
  assert.match(one.calculator_url ?? '', /model=custom&p=8&l=32&kvh=8&hd=128/);
});

test('a Hugging Face repo outside the table is read from its config.json', async () => {
  const r = await estimateFromHfRepo({ repo: 'https://huggingface.co/test-org/hybrid-27b' });
  assert.equal(r.repo, 'test-org/hybrid-27b');
  assert.equal(r.architecture.attention, 'hybrid');
  assert.equal(r.architecture.fixed_state_gb, 0.15);
  assert.deepEqual(r.architecture.kv_groups, [{ layers: 16, values_per_token: 2048, window_tokens: null }]);
  // Same shape and size as the Qwen3.8 27B row, so the same memory.
  const row = await estimateVram({ model: 'qwen3.8-27b' });
  assert.deepEqual(r.estimates.map((x) => x.total_gb), row.estimates.map((x) => x.total_gb));
});

test('can_i_run reads a repo id it does not list, and gives no MoE-blind speed', async () => {
  const r = await canIRun({ model: 'test-org/hybrid-27b', gpu: 'rtx-5090' });
  assert.equal(r.model.source, 'huggingface');
  assert.ok(r.speed);
  assert.match(r.notes[0]!, /has not reviewed this model/);
});

test('GGUF-only and missing repos explain what to ask instead', async () => {
  await assert.rejects(estimateFromHfRepo({ repo: 'test-org/only-gguf' }), (e: Error) => e instanceof HfError && /Qwen\/Qwen3-8B/.test(e.message));
  await assert.rejects(estimateFromHfRepo({ repo: 'test-org/missing' }), /no public Hugging Face repo/);
  await assert.rejects(estimateFromHfRepo({ repo: 'not a repo' }), ToolInputError);
});

test('list_models and list_gpus filter by words', () => {
  assert.ok(listModels({ search: 'gemma' }).models.every((m) => m.family === 'Gemma'));
  assert.equal(listModels({}).models.find((m) => m.id === 'qwen3-32b')?.memory_q4_8k_gb, 22.4);
  assert.ok(listGpus({ search: 'apple' }).gpus.every((g) => g.kind === 'apple'));
});
