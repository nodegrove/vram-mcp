/**
 * The checker's answers. Each case was compared with nodegrove.io's checker before the logic
 * moved into this package (27,144 combinations, no differences beyond the speed label).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, cardOf, models, gpus, modelById, speedText, checkerUrl, calculatorUrl, worthNaming, GROVE_GB, type QuantKey } from '../src/index.ts';

const cards = gpus.map(cardOf);
const run = (gpu: string, model: string, quant: QuantKey, context: number, kvBytes = 2) =>
  check(
    { model: modelById(model)!, card: cards.find((c) => c.id === gpu)!, quant, context, kvBytes },
    { models, cards },
    { links: { model: (id) => `/models/${id}`, card: (id) => `/gpus/${id}` }, groveGb: GROVE_GB },
  );
const kinds = (r: ReturnType<typeof check>) => r.suggestions.map((s) => s.kind);

test('a 70B model on a 24 GB card: no, and what would work', () => {
  const r = run('rtx-4090', 'llama-3.3-70b', 'q4', 8192);
  assert.equal(r.verdict, 'no');
  assert.equal(Math.round(r.need.totalGb * 10) / 10, 45.8);
  assert.deepEqual(kinds(r), ['no-context', 'near-miss-card', 'smallest-card', 'biggest-model']);
  assert.equal(r.suggestions[1]!.cardId, 'rtx-6000-ada');
  assert.equal(r.suggestions[2]!.cardId, 'a100-80');
  // Not Qwen3 32B: its successor Qwen3.8 27B runs here too. Not the 32B coding or reasoning
  // specialists either: the question was about a general model.
  assert.equal(r.suggestions[3]!.modelId, 'gemma-4-31b');
  assert.equal(r.tokensPerSecond, null);
  assert.equal(r.groveGb, 96);
  assert.equal(
    r.suggestions[1]!.text,
    '**[RTX 6000 Ada 48 GB](/gpus/rtx-6000-ada)** (48 GB) is within a whisker: 45.8 GB against 45.6 GB after headroom. With the KV cache at Q8 it needs 44.4 GB and fits.',
  );
});

test('alternatives: no superseded model, and specialists only for the same kind of question', () => {
  const byId = (id: string) => modelById(id)!;
  // Both run: the older one is dropped in favour of its successor.
  assert.deepEqual(worthNaming([byId('qwen3-32b'), byId('qwen3.8-27b')], byId('llama-3.3-70b')).map((m) => m.id), ['qwen3.8-27b']);
  // The successor does not run: the older one stays.
  assert.deepEqual(worthNaming([byId('qwen3-32b')], byId('llama-3.3-70b')).map((m) => m.id), ['qwen3-32b']);
  // A coding model is offered to someone asking about a coding model, not to someone asking about a general one.
  assert.deepEqual(worthNaming([byId('qwen2.5-coder-32b'), byId('gemma-4-31b')], byId('llama-3.3-70b')).map((m) => m.id), ['gemma-4-31b']);
  const coder = run('rtx-4090', 'qwen3-coder-next', 'q4', 8192);
  assert.equal(coder.verdict, 'no');
  assert.equal(coder.suggestions.find((s) => s.kind === 'biggest-model')!.modelId, 'qwen2.5-coder-32b');
});

test('a near miss: every way to make it fit, in order', () => {
  const r = run('rtx-6000-ada', 'llama-3.3-70b', 'q4', 8192);
  assert.equal(r.verdict, 'no');
  assert.deepEqual(kinds(r), ['lower-quant', 'kv-q8', 'shorter-context', 'smallest-card', 'biggest-model']);
  assert.equal(r.suggestions[0]!.quant, 'q3');
  assert.equal(r.suggestions[2]!.context, 7168);
});

test('a fit: room for more, and speeds over 100 tokens/s read as ceilings', () => {
  const r = run('rtx-5090', 'gpt-oss-20b', 'q4', 131072);
  assert.equal(r.verdict, 'fits');
  assert.deepEqual(kinds(r), ['higher-quant', 'larger-model']);
  assert.equal(speedText(r.tokensPerSecond!), 'at most 601 tokens/s');
  assert.equal(r.groveGb, null);
});

test('tight above 85% of usable memory', () => {
  const r = run('rtx-4090', 'qwen3-32b', 'q4', 8192);
  assert.equal(r.verdict, 'tight');
  assert.deepEqual(kinds(r), ['tight', 'longer-context']);
  assert.equal(r.maxContext, 9216);
});

test('a card described only by its memory gets a verdict but no speed', () => {
  const card = { id: 'custom', name: 'Your GPU', vramGb: 16, usableGb: 16, bandwidthGBs: null };
  const r = check({ model: modelById('qwen3-14b')!, card, quant: 'q4', context: 8192 }, { models, cards });
  assert.equal(r.verdict, 'fits');
  assert.equal(r.tokensPerSecond, null);
  assert.ok(r.suggestions.every((s) => !/tokens\/s/.test(s.text)));
});

test('checker links only for states the checker can show', () => {
  assert.equal(
    checkerUrl({ gpu: 'rtx-4090', model: 'llama-3.3-70b', quant: 'q4', kvBytes: 2, context: 8192 }),
    'https://nodegrove.io/tools/can-i-run-it?gpu=rtx-4090&model=llama-3.3-70b&quant=q4&kv=2&ctx=8192',
  );
  assert.equal(checkerUrl({ gpu: 'rtx-4090', model: 'llama-3.3-70b', quant: 'q4', kvBytes: 2, context: 5000 }), null);
  assert.equal(checkerUrl({ gpu: 'rtx-4090', model: 'llama-3.3-70b', quant: 'q4', kvBytes: 2, context: 262144 }), null);
  assert.equal(checkerUrl({ gpu: 'rtx-4080', model: 'llama-3.3-70b', quant: 'q4', kvBytes: 2, context: 8192 }), null);
  assert.equal(
    calculatorUrl({ model: { params: 8, layers: 32, kvHeads: 8, headDim: 128 }, quant: 'q4', kvBytes: 2, context: 8192 }),
    'https://nodegrove.io/tools/llm-vram-calculator?model=custom&p=8&l=32&kvh=8&hd=128&quant=q4&kv=2&ctx=8192',
  );
  assert.equal(calculatorUrl({ model: 'qwen3-32b', quant: 'q4', kvBytes: 2, context: 1024 }), null);
  // The calculator's custom fields describe a plain transformer only.
  const hybrid = { params: 27.8, layers: 64, kvHeads: 4, headDim: 256, kv: [{ layers: 16, width: 2048 }], stateGb: 0.15 };
  assert.equal(calculatorUrl({ model: hybrid, quant: 'q4', kvBytes: 2, context: 8192 }), null);
});
