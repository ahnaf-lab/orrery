import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDependencyTree, flattenTree } from '../src/tree.js';
import { attachReleaseAges } from '../src/model.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function loadFixtureTree() {
  const pkgJson = JSON.parse(await readFile(path.join(fixturesDir, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(await readFile(path.join(fixturesDir, 'package-lock.json'), 'utf8'));
  return buildDependencyTree(pkgJson, lockfile);
}

function fakeFetch(publishDates) {
  return async (url) => {
    const name = decodeURIComponent(url.replace('https://registry.npmjs.org/', ''));
    if (!(name in publishDates)) return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ time: publishDates[name] }) };
  };
}

test('attachReleaseAges annotates resolved nodes with releaseDate and ageDays', async () => {
  const tree = await loadFixtureTree();
  const now = new Date('2026-09-25T00:00:00Z');
  const fetchImpl = fakeFetch({
    'left-pad': { '1.3.0': '2015-08-15T00:00:00.000Z' },
    chalk: { '4.1.2': '2020-11-11T00:00:00.000Z' },
    'shared-dep': { '1.2.0': '2024-09-25T00:00:00.000Z' },
    'circ-a': { '1.0.0': '2024-01-01T00:00:00.000Z' },
    'circ-b': { '1.0.0': '2024-01-01T00:00:00.000Z' },
    'ansi-styles': { '4.3.0': '2020-01-01T00:00:00.000Z' },
    'color-convert': { '2.0.1': '2018-01-01T00:00:00.000Z' },
    'color-name': { '1.1.4': '2017-01-01T00:00:00.000Z' },
  });

  const { warnings } = await attachReleaseAges(tree, { fetchImpl, now });

  const leftPad = tree.children.find((c) => c.name === 'left-pad');
  assert.equal(leftPad.releaseDate, '2015-08-15T00:00:00.000Z');
  assert.equal(leftPad.ageDays, ageDaysBetween('2015-08-15T00:00:00.000Z', now));
  assert.deepEqual(warnings, []);
});

test('attachReleaseAges reports a per-package warning without throwing', async () => {
  const tree = await loadFixtureTree();
  const fetchImpl = async () => ({ ok: false, status: 500 });

  const { warnings } = await attachReleaseAges(tree, { fetchImpl });

  const leftPad = tree.children.find((c) => c.name === 'left-pad');
  assert.equal(leftPad.releaseDate, null);
  assert.equal(leftPad.ageDays, null);
  assert.ok(warnings.length > 0);
  assert.ok(warnings.some((w) => w.includes('left-pad')));
});

test('attachReleaseAges makes exactly one lookup per distinct package name', async () => {
  const tree = await loadFixtureTree();
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: true, json: async () => ({ time: {} }) };
  };

  await attachReleaseAges(tree, { fetchImpl });

  const uniqueNames = flattenTree(tree)
    .filter((n) => n.version && !n.circular && n.path !== '')
    .map((n) => n.name);
  const distinctCount = new Set(uniqueNames).size;

  assert.equal(requested.length, distinctCount);
  assert.equal(new Set(requested).size, requested.length);
});

function ageDaysBetween(iso, now) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}
