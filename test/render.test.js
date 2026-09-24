import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFrame, decayFraction } from '../src/render.js';

function makeTree() {
  return {
    name: 'root-app',
    version: '1.0.0',
    depth: 0,
    path: '',
    children: [
      { name: 'fresh-dep', version: '1.0.0', depth: 1, path: 'node_modules/fresh-dep', ageDays: 10, children: [] },
      { name: 'stale-dep', version: '1.0.0', depth: 1, path: 'node_modules/stale-dep', ageDays: 5000, children: [] },
      { name: 'ghost-dep', version: null, depth: 1, path: null, unresolved: true, children: [] },
    ],
  };
}

test('decayFraction is 0 for unknown age and clamps to 1 at the horizon', () => {
  assert.equal(decayFraction(null, 1000), 0);
  assert.equal(decayFraction(undefined, 1000), 0);
  assert.equal(decayFraction(0, 1000), 0);
  assert.equal(decayFraction(500, 1000), 0.5);
  assert.equal(decayFraction(5000, 1000), 1);
});

test('renderFrame returns exactly `height` lines of exactly `width` characters', () => {
  const frame = renderFrame(makeTree(), { width: 41, height: 21 });
  const lines = frame.split('\n');
  assert.equal(lines.length, 21);
  for (const line of lines) {
    assert.equal(line.length, 41);
  }
});

test('renderFrame places the root at the exact centre of the canvas', () => {
  const frame = renderFrame(makeTree(), { width: 41, height: 21 });
  const lines = frame.split('\n');
  assert.equal(lines[10][20], '@');
});

test('renderFrame marks an unresolved dependency distinctly from resolved ones', () => {
  const frame = renderFrame(makeTree(), { width: 41, height: 21 });
  assert.ok(frame.includes('?'), 'expected the unresolved-dependency glyph to appear');
});

test('renderFrame pulls a heavily-aged package closer to the sun than a fresh one at the same depth', () => {
  const tree = {
    name: 'root-app',
    version: '1.0.0',
    depth: 0,
    path: '',
    children: [
      { name: 'a-fresh', version: '1.0.0', depth: 1, path: 'node_modules/a-fresh', ageDays: 0, children: [] },
      { name: 'b-stale', version: '1.0.0', depth: 1, path: 'node_modules/b-stale', ageDays: 5000, children: [] },
    ],
  };

  // Both land on the same angle (index 0 and 1 of a 2-node ring share the
  // x axis at angle 0 and pi, i.e. opposite sides) so compare distance from
  // centre along that axis instead of raw coordinates.
  const frame = renderFrame(tree, { width: 61, height: 23, horizonDays: 1000 });
  const lines = frame.split('\n');
  const centerY = 11;
  const centerX = 30;

  const freshX = lines[centerY].indexOf('*');
  const staleX = lines[centerY].indexOf('.', 0) === -1 ? undefined : lines[centerY].lastIndexOf('.');

  assert.ok(freshX !== -1, 'expected the fresh dependency to render on the centre row');
  assert.ok(staleX !== undefined && staleX !== -1, 'expected the stale dependency to render on the centre row');
  assert.ok(Math.abs(staleX - centerX) < Math.abs(freshX - centerX));
});

test('renderFrame rejects a canvas smaller than 3x3', () => {
  assert.throws(() => renderFrame(makeTree(), { width: 2, height: 2 }), /at least 3x3/);
});
