/**
 * Reading config.json must reproduce the model table, row for row. The fixtures are the
 * cache-relevant keys of each model's real config.json (fetched 2026-10-02); all 29 rows
 * were checked against their live configs the same way before this reader shipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shapeFromConfig, modelById, kvGroups, ConfigError, attentionOf } from '../src/index.ts';

const fixtures: Record<string, { repo: string; config: Record<string, unknown> }> = JSON.parse(
  readFileSync(new URL('./fixtures/configs.json', import.meta.url), 'utf8'),
);
const groups = (g: { layers: number; width: number; window?: number }[]) =>
  g.map((x) => [x.layers, x.width, x.window ?? 0]).sort((a, b) => a[0]! - b[0]!);

for (const [id, { repo, config }] of Object.entries(fixtures)) {
  test(`${repo} reads as the ${id} row`, () => {
    const row = modelById(id)!;
    const s = shapeFromConfig(config);
    assert.deepEqual(groups(kvGroups(s)), groups(kvGroups(row)));
    assert.equal(s.stateGb ?? 0, row.stateGb ?? 0);
    assert.equal(s.kvHeads, row.kvHeads);
    assert.equal(s.headDim, row.headDim);
    assert.equal(s.attention, attentionOf(row));
    assert.deepEqual(s.warnings, []);
  });
}

test('a sliding window with no layer map is counted at full length, and says so', () => {
  const s = shapeFromConfig({ num_hidden_layers: 32, num_attention_heads: 32, num_key_value_heads: 8, hidden_size: 4096, sliding_window: 4096 });
  assert.equal(s.attention, 'standard');
  assert.match(s.warnings[0]!, /upper bound/);
});

test('Qwen-style configs that switch the window off are plain transformers', () => {
  const s = shapeFromConfig({ num_hidden_layers: 64, num_attention_heads: 40, num_key_value_heads: 8, hidden_size: 5120, sliding_window: 131072, use_sliding_window: false });
  assert.equal(s.attention, 'standard');
  assert.deepEqual(s.warnings, []);
});

test('a config without the basics is refused, not guessed', () => {
  assert.throws(() => shapeFromConfig({ model_type: 'something' }), ConfigError);
});
