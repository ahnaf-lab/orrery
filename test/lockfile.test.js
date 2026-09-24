import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLockfile, resolveDependency, resolutionCandidates } from '../src/lockfile.js';

test('normalizeLockfile parses a v3 lockfile into a flat path map', () => {
  const lockfile = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'app', dependencies: { foo: '^1.0.0' } },
      'node_modules/foo': { version: '1.2.3', dependencies: { bar: '^2.0.0' } },
      'node_modules/foo/node_modules/bar': { version: '2.0.0' },
    },
  };

  const map = normalizeLockfile(lockfile);

  assert.equal(map.get('node_modules/foo').version, '1.2.3');
  assert.deepEqual(map.get('node_modules/foo').dependencies, { bar: '^2.0.0' });
  assert.equal(map.get('node_modules/foo/node_modules/bar').version, '2.0.0');
});

test('normalizeLockfile parses a v1 lockfile with nested overrides', () => {
  const lockfile = {
    version: 'app-1.0.0',
    dependencies: {
      foo: {
        version: '1.2.3',
        requires: { bar: '^1.0.0' },
        dependencies: {
          bar: { version: '1.5.0' },
        },
      },
    },
  };

  const map = normalizeLockfile(lockfile);

  assert.equal(map.get('node_modules/foo').version, '1.2.3');
  assert.equal(map.get('node_modules/foo/node_modules/bar').version, '1.5.0');
});

test('normalizeLockfile rejects an unrecognised shape', () => {
  assert.throws(() => normalizeLockfile({ nothingUseful: true }), /unrecognised lockfile shape/);
});

test('resolutionCandidates walks up node_modules ancestors, closest first', () => {
  const candidates = resolutionCandidates('node_modules/a/node_modules/b', 'c');
  assert.deepEqual(candidates, [
    'node_modules/a/node_modules/b/node_modules/c',
    'node_modules/a/node_modules/c',
    'node_modules/c',
  ]);
});

test('resolveDependency finds a hoisted (top-level) package from a nested path', () => {
  const packages = new Map([
    ['', { version: '.', dependencies: {} }],
    ['node_modules/a', { version: '1.0.0', dependencies: {} }],
    ['node_modules/shared', { version: '1.0.0', dependencies: {} }],
  ]);

  const resolved = resolveDependency(packages, 'node_modules/a', 'shared');
  assert.equal(resolved, 'node_modules/shared');
});

test('resolveDependency returns undefined for a package missing from the lockfile', () => {
  const packages = new Map([['', { version: '.', dependencies: {} }]]);
  assert.equal(resolveDependency(packages, '', 'ghost'), undefined);
});
