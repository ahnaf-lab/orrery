import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject, loadDependencyModel } from '../src/index.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('loadProject reads package.json and package-lock.json from a directory', async () => {
  const { pkgJson, lockfile, lockfileName } = await loadProject(fixturesDir);
  assert.equal(pkgJson.name, 'fixture-app');
  assert.equal(lockfile.lockfileVersion, 3);
  assert.equal(lockfileName, 'package-lock.json');
});

test('loadProject reports a clear error when no lockfile is present', async () => {
  const dir = path.join(fixturesDir, 'no-lockfile');
  await assert.rejects(() => loadProject(dir), /no supported lockfile found/);
});

test('loadDependencyModel in offline mode builds a tree without any network calls', async () => {
  const { tree, warnings, lockfileName } = await loadDependencyModel(fixturesDir, { offline: true });

  assert.equal(lockfileName, 'package-lock.json');
  assert.equal(tree.name, 'fixture-app');
  assert.deepEqual(warnings, []);

  const leftPad = tree.children.find((c) => c.name === 'left-pad');
  assert.equal(leftPad.releaseDate, undefined);
});

test('loadDependencyModel attaches ages when a fetchImpl is provided', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ time: { '1.3.0': '2015-08-15T00:00:00.000Z' } }) });
  const { tree } = await loadDependencyModel(fixturesDir, { fetchImpl, now: new Date('2026-01-01T00:00:00Z') });

  const leftPad = tree.children.find((c) => c.name === 'left-pad');
  assert.equal(leftPad.releaseDate, '2015-08-15T00:00:00.000Z');
  assert.ok(typeof leftPad.ageDays === 'number');
});
