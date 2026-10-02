/**
 * Figures nodegrove.io prints. If one of these moves, a page, the dataset and every MCP
 * answer move with it: change the data on purpose, then change the figure here.
 * Run: node --test test/*.test.ts (Node 22.18+ runs TypeScript directly).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, modelById, gpus, usableVramGb, fitModel, round1, type QuantKey } from '../src/index.ts';

const totalGb = (id: string, quant: QuantKey, context: number) => {
  const m = modelById(id);
  assert.ok(m, `no model ${id}`);
  return round1(estimate({ ...m, quant, context }).totalGb);
};

test('memory figures on the model pages', () => {
  assert.equal(totalGb('llama-3.3-70b', 'q4', 8192), 45.8);
  assert.equal(totalGb('qwen3-32b', 'q4', 8192), 22.4);
  assert.equal(totalGb('gemma-3-27b', 'q4', 32768), 20.1);
});

test('Apple machines plan around 75% of unified memory', () => {
  const m2 = gpus.find((g) => g.id === 'm2-ultra');
  assert.ok(m2);
  assert.equal(usableVramGb(m2), 144);
});

test('Llama 3.3 70B at Q4 with 8k: 45.8 GB misses a 48 GB card by a whisker, fits 80 GB', () => {
  const llama = modelById('llama-3.3-70b')!;
  const card = (id: string) => gpus.find((g) => g.id === id)!;
  assert.equal(fitModel(llama, card('rtx-4090'), 'q4', 8192).fits, false);
  // 48 GB × 0.95 headroom = 45.6 GB, just under 45.8: the checker's "near miss" case.
  assert.equal(fitModel(llama, card('rtx-6000-ada'), 'q4', 8192).fits, false);
  assert.equal(fitModel(llama, card('a100-80'), 'q4', 8192).fits, true);
});
