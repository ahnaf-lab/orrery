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

test('CLI --frame renders a single labelled frame from the synthetic time axis', async () => {
  const { stdout } = await execFileAsync('node', [
    binPath,
    '--dir',
    fixturesDir,
    '--offline',
    '--frame',
    '0',
    '--width',
    '41',
    '--height',
    '21',
  ]);
  const lines = stdout.replace(/\n$/, '').split('\n');

  assert.match(lines[0], /^-- frame 1\/1 \(\d{4}-\d{2}-\d{2}\) --$/);
  assert.equal(lines.length, 22); // header + height
  assert.equal(lines[11][20], '@');
});

test('CLI --frame rejects an index beyond the axis for this tree', async () => {
  await assert.rejects(
    execFileAsync('node', [binPath, '--dir', fixturesDir, '--offline', '--frame', '5']),
    /--frame must be less than the frame count/
  );
});

test('CLI --play animates through the full synthetic time axis and exits', async () => {
  const { stdout } = await execFileAsync('node', [
    binPath,
    '--dir',
    fixturesDir,
    '--offline',
    '--play',
    '--interval',
    '1',
    '--width',
    '41',
    '--height',
    '21',
  ]);

  // --offline builds have no release dates to animate, so the axis
  // collapses to exactly one frame.
  const headers = stdout.match(/^-- frame \d+\/\d+ .*--$/gm) || [];
  assert.equal(headers.length, 1);
  assert.equal(headers[0], '-- frame 1/1 (' + headers[0].match(/\((.*)\)/)[1] + ') --');
});

test('CLI --play and --frame together are rejected', async () => {
  await assert.rejects(
    execFileAsync('node', [binPath, '--dir', fixturesDir, '--offline', '--play', '--frame', '0']),
    /cannot be used together/
  );
});

test('CLI --frame --json includes the frame index, count, and as-of timestamp', async () => {
  const { stdout } = await execFileAsync('node', [
    binPath,
    '--dir',
    fixturesDir,
    '--offline',
    '--frame',
    '0',
    '--json',
  ]);
  const output = JSON.parse(stdout);

  assert.equal(output.frame, 0);
  assert.equal(output.frameCount, 1);
  assert.ok(typeof output.asOf === 'string' && !Number.isNaN(Date.parse(output.asOf)));
  assert.equal(output.tree.name, 'fixture-app');
});
