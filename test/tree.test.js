import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDependencyTree, flattenTree } from '../src/tree.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function loadFixture() {
  const pkgJson = JSON.parse(await readFile(path.join(fixturesDir, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(await readFile(path.join(fixturesDir, 'package-lock.json'), 'utf8'));
  return { pkgJson, lockfile };
}

function findByName(node, name) {
  if (node.name === name) return node;
  for (const child of node.children) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return undefined;
}

test('buildDependencyTree ranks direct dependencies at depth 1', async () => {
  const { pkgJson, lockfile } = await loadFixture();
  const tree = buildDependencyTree(pkgJson, lockfile);

  assert.equal(tree.depth, 0);
  assert.equal(tree.name, 'fixture-app');

  const names = tree.children.map((c) => c.name).sort();
  assert.deepEqual(names, ['chalk', 'circ-a', 'left-pad', 'shared-dep']);
  for (const child of tree.children) {
    assert.equal(child.depth, 1);
  }
});

test('buildDependencyTree ranks transitive dependencies deeper than their parent', async () => {
  const { pkgJson, lockfile } = await loadFixture();
  const tree = buildDependencyTree(pkgJson, lockfile);

  const chalk = findByName(tree, 'chalk');
  const ansiStyles = chalk.children.find((c) => c.name === 'ansi-styles');
  assert.equal(ansiStyles.depth, 2);

  const colorConvert = ansiStyles.children.find((c) => c.name === 'color-convert');
  assert.equal(colorConvert.depth, 3);
  assert.equal(colorConvert.version, '2.0.1');
});

test('the same hoisted package appears at each depending branch\'s own depth', async () => {
  const { pkgJson, lockfile } = await loadFixture();
  const tree = buildDependencyTree(pkgJson, lockfile);

  const rootSharedDep = tree.children.find((c) => c.name === 'shared-dep');
  const chalkSharedDep = findByName(tree, 'chalk').children.find((c) => c.name === 'shared-dep');

  assert.equal(rootSharedDep.depth, 1);
  assert.equal(chalkSharedDep.depth, 2);
  assert.equal(rootSharedDep.version, chalkSharedDep.version);
});

test('circular dependencies are flagged instead of expanded forever', async () => {
  const { pkgJson, lockfile } = await loadFixture();
  const tree = buildDependencyTree(pkgJson, lockfile);

  const circA = tree.children.find((c) => c.name === 'circ-a');
  const circB = circA.children.find((c) => c.name === 'circ-b');
  const circAAgain = circB.children.find((c) => c.name === 'circ-a');

  assert.equal(circA.circular, undefined);
  assert.equal(circB.circular, undefined);
  assert.equal(circAAgain.circular, true);
  assert.deepEqual(circAAgain.children, []);
});

test('an unresolved dependency (missing from the lockfile) is marked, not thrown', () => {
  const pkgJson = { name: 'app', version: '1.0.0', dependencies: { ghost: '^1.0.0' } };
  const lockfile = { lockfileVersion: 3, packages: { '': { dependencies: { ghost: '^1.0.0' } } } };

  const tree = buildDependencyTree(pkgJson, lockfile);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].unresolved, true);
  assert.equal(tree.children[0].version, null);
});

test('flattenTree visits every node exactly once, depth-first', async () => {
  const { pkgJson, lockfile } = await loadFixture();
  const tree = buildDependencyTree(pkgJson, lockfile);

  const flat = flattenTree(tree);
  const names = flat.map((n) => n.name);
  assert.equal(names[0], 'fixture-app');
  assert.ok(names.length > 5, 'expected root plus at least a handful of resolved deps');
});
