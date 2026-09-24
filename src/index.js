import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDependencyTree, attachReleaseAges } from './model.js';
import { renderFrame } from './render.js';

export { renderFrame };

const LOCKFILE_NAMES = ['package-lock.json', 'npm-shrinkwrap.json'];

/**
 * Load package.json and whichever supported lockfile is present in `dir`.
 *
 * @param {string} dir project directory
 * @returns {Promise<{pkgJson: object, lockfile: object, lockfileName: string}>}
 */
export async function loadProject(dir) {
  const pkgJson = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));

  let lastError;
  for (const name of LOCKFILE_NAMES) {
    try {
      const lockfile = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      return { pkgJson, lockfile, lockfileName: name };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `no supported lockfile found in ${dir} (looked for ${LOCKFILE_NAMES.join(', ')}): ${lastError?.message}`
  );
}

/**
 * Build the full dependency model for a project directory: the depth-ranked
 * tree, optionally enriched with per-package release age.
 *
 * @param {string} dir project directory
 * @param {object} [options]
 * @param {boolean} [options.offline] skip the registry lookups entirely
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.now]
 * @returns {Promise<{tree: object, warnings: string[], lockfileName: string}>}
 */
export async function loadDependencyModel(dir, { offline = false, fetchImpl, now } = {}) {
  const { pkgJson, lockfile, lockfileName } = await loadProject(dir);
  const tree = buildDependencyTree(pkgJson, lockfile);

  let warnings = [];
  if (!offline) {
    ({ warnings } = await attachReleaseAges(tree, { fetchImpl, now }));
  }

  return { tree, warnings, lockfileName };
}
