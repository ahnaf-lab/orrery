import { buildDependencyTree, flattenTree } from './tree.js';
import { fetchPublishTimes } from './registry.js';
import { ageDays } from './age.js';

export { buildDependencyTree, flattenTree };

/**
 * Attach release date / age-in-days to every resolved node in a tree,
 * in place. One registry request is made per distinct package name
 * (not per node, and not per version) and reused for every occurrence.
 *
 * Lookup failures are non-fatal: the offending node gets
 * `releaseDate: null` and its name is added to the returned warnings list,
 * so one unreachable package can't take down the whole run.
 *
 * @param {object} root tree root from buildDependencyTree()
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.now]
 * @returns {Promise<{warnings: string[]}>}
 */
export async function attachReleaseAges(root, { fetchImpl, now = new Date() } = {}) {
  const nodes = flattenTree(root).filter((n) => n.version && !n.circular && n.path !== '');
  const byName = new Map();
  for (const node of nodes) {
    if (!byName.has(node.name)) byName.set(node.name, []);
    byName.get(node.name).push(node);
  }

  const warnings = [];

  await Promise.all(
    Array.from(byName.entries()).map(async ([name, nodesForName]) => {
      let times;
      try {
        times = await fetchPublishTimes(name, { fetchImpl });
      } catch (err) {
        warnings.push(`${name}: ${err.message}`);
        for (const node of nodesForName) {
          node.releaseDate = null;
          node.ageDays = null;
        }
        return;
      }
      for (const node of nodesForName) {
        const releaseDate = times[node.version] || null;
        node.releaseDate = releaseDate;
        node.ageDays = releaseDate ? ageDays(releaseDate, now) : null;
        if (!releaseDate) warnings.push(`${name}@${node.version}: no publish time in registry data`);
      }
    })
  );

  return { warnings };
}
