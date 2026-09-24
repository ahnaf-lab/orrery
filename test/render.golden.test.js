import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDependencyModel } from '../src/index.js';
import { renderFrame } from '../src/render.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

// One publish date per package in the fixture tree, chosen to spread the
// resulting ages across "fresh", "aging" and "stale" so the golden frame
// exercises all three glyphs, not just one.
const PUBLISH_TIMES = {
  'left-pad': { '1.3.0': '2025-12-20T00:00:00.000Z' }, // ~fresh
  chalk: { '4.1.2': '2021-01-01T00:00:00.000Z' }, // ~stale
  'ansi-styles': { '4.3.0': '2023-06-01T00:00:00.000Z' }, // ~aging
  'color-convert': { '2.0.1': '2018-01-01T00:00:00.000Z' }, // ~stale
  'color-name': { '1.1.4': '2017-01-01T00:00:00.000Z' }, // ~stale
  'shared-dep': { '1.2.0': '2026-08-01T00:00:00.000Z' }, // ~fresh
  'circ-a': { '1.0.0': '2024-01-01T00:00:00.000Z' }, // ~aging
  'circ-b': { '1.0.0': '2024-01-01T00:00:00.000Z' }, // ~aging
};

async function fetchImpl(url) {
  const name = decodeURIComponent(new URL(url).pathname.slice(1)).replace('%40', '@');
  const time = PUBLISH_TIMES[name];
  if (!time) return { ok: false, status: 404 };
  return { ok: true, json: async () => ({ time }) };
}

test('renderFrame golden: fixture tree at a fixed size and fixed ages', async () => {
  const { tree } = await loadDependencyModel(fixturesDir, {
    fetchImpl,
    now: new Date('2026-09-25T00:00:00.000Z'),
  });

  const frame = renderFrame(tree, { width: 41, height: 21 });
  const golden = (await readFile(path.join(fixturesDir, 'frame.golden.txt'), 'utf8')).replace(/\n$/, '');

  assert.equal(frame, golden);
});
