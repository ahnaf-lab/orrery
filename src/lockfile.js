// Parsing for npm lockfiles (package-lock.json / npm-shrinkwrap.json),
// versions 1 through 3. Only the shape needed to reconstruct the dependency
// graph and each package's resolved version is extracted.

/**
 * Normalise a lockfile into a flat map keyed by installation path
 * ("" for the root, "node_modules/foo", "node_modules/foo/node_modules/bar",
 * ...) so the rest of the tool doesn't need to know which lockfile version
 * produced it.
 *
 * @param {object} lockfile parsed package-lock.json / npm-shrinkwrap.json
 * @returns {Map<string, {version: string, dependencies: Record<string,string>}>}
 */
export function normalizeLockfile(lockfile) {
  if (!lockfile || typeof lockfile !== 'object') {
    throw new Error('lockfile must be a parsed object');
  }

  if (lockfile.lockfileVersion >= 2 && lockfile.packages) {
    return normalizeV2Or3(lockfile);
  }

  if (lockfile.dependencies) {
    return normalizeV1(lockfile);
  }

  throw new Error('unrecognised lockfile shape: no "packages" or "dependencies" field');
}

function normalizeV2Or3(lockfile) {
  const map = new Map();
  for (const [path, entry] of Object.entries(lockfile.packages)) {
    if (path === '') {
      // Root project entry: no version, its "dependencies" here already
      // merges what package.json declares.
      map.set('', {
        version: entry.version || lockfile.name || '.',
        dependencies: { ...(entry.dependencies || {}), ...(entry.devDependencies || {}) },
      });
      continue;
    }
    map.set(path, {
      version: entry.version || '0.0.0',
      dependencies: { ...(entry.dependencies || {}) },
    });
  }
  return map;
}

function normalizeV1(lockfile) {
  const map = new Map();
  map.set('', { version: lockfile.version || '.', dependencies: {} });

  function walk(deps, prefix) {
    for (const [name, entry] of Object.entries(deps)) {
      const path = `${prefix}node_modules/${name}`;
      map.set(path, {
        version: entry.version || '0.0.0',
        dependencies: { ...(entry.requires || {}) },
      });
      if (entry.dependencies) {
        walk(entry.dependencies, `${path}/`);
      }
    }
  }

  walk(lockfile.dependencies, '');
  return map;
}

/**
 * Node module resolution order: from a given installation path, look for
 * `name` nested under it, then walk up through each ancestor's
 * node_modules, finally checking the root.
 *
 * @returns {string[]} candidate paths, closest first
 */
export function resolutionCandidates(currentPath, name) {
  const candidates = [];
  let path = currentPath;
  while (true) {
    candidates.push(path === '' ? `node_modules/${name}` : `${path}/node_modules/${name}`);
    if (path === '') break;
    const idx = path.lastIndexOf('node_modules/');
    path = idx <= 0 ? '' : path.slice(0, idx - 1);
  }
  return candidates;
}

/**
 * Resolve a dependency name from a given package's installation path using
 * standard node_modules lookup order.
 *
 * @returns {string|undefined} the resolved path, or undefined if not found
 *   in the lockfile (e.g. an unmet optional dependency).
 */
export function resolveDependency(packages, currentPath, name) {
  for (const candidate of resolutionCandidates(currentPath, name)) {
    if (packages.has(candidate)) return candidate;
  }
  return undefined;
}
