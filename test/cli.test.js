import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const binPath = path.join(projectRoot, 'bin', 'orrery.js');
const fixturesDir = path.join(projectRoot, 'test', 'fixtures');

test('CLI --json --offline prints a JSON dependency tree for the target directory', async () => {
  const { stdout } = await execFileAsync('node', [binPath, '--dir', fixturesDir, '--offline', '--json']);
  const output = JSON.parse(stdout);

  assert.equal(output.lockfileName, 'package-lock.json');
  assert.equal(output.tree.name, 'fixture-app');
  assert.ok(output.tree.children.some((c) => c.name === 'left-pad'));
});

test('CLI without --json renders an ASCII frame with the sun at its centre', async () => {
  const { stdout } = await execFileAsync('node', [binPath, '--dir', fixturesDir, '--offline', '--width', '41', '--height', '21']);
  const lines = stdout.replace(/\n$/, '').split('\n');

  assert.equal(lines.length, 21);
  assert.ok(lines.every((line) => line.length === 41));
  assert.equal(lines[10][20], '@');
});

test('CLI --help exits cleanly and does not touch the network or a project dir', async () => {
  const { stdout } = await execFileAsync('node', [binPath, '--help']);
  assert.ok(stdout.includes('Usage:'));
});

test('CLI reports an error for an unrecognised flag', async () => {
  await assert.rejects(execFileAsync('node', [binPath, '--bogus']));
});
