import { normalizeLockfile, resolveDependency } from './lockfile.js';

/**
 * Build a depth-ranked dependency tree from a package.json and its lockfile.
 *
 * Depth is the number of dependency edges from the root, not the physical
 * nesting of node_modules — a hoisted package that several other packages
 * depend on will appear once per depending branch, at that branch's depth.
 * Circular dependencies are cut where they repeat a name already on the
 * current path, and the node is flagged `circular: true` instead of being
 * expanded again.
 *
 * @param {object} pkgJson parsed package.json
 * @param {object} lockfile parsed package-lock.json / npm-shrinkwrap.json
 * @returns {object} root node: { name, version, depth, path, children }
 */
export function buildDependencyTree(pkgJson, lockfile) {
  const packages = normalizeLockfile(lockfile);

  const rootDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  const root = {
    name: pkgJson.name || '.',
    version: pkgJson.version || '0.0.0',
    depth: 0,
    path: '',
    children: [],
  };

  walk(root, '', rootDeps, packages, new Set([pkgJson.name]));

  return root;
}

function walk(node, currentPath, dependencyRanges, packages, ancestorNames) {
  for (const name of Object.keys(dependencyRanges).sort()) {
    const resolvedPath = resolveDependency(packages, currentPath, name);

    if (!resolvedPath) {
      node.children.push({
        name,
        version: null,
        depth: node.depth + 1,
        path: null,
        unresolved: true,
        children: [],
      });
      continue;
    }

    const entry = packages.get(resolvedPath);
    const child = {
      name,
      version: entry.version,
      depth: node.depth + 1,
      path: resolvedPath,
      children: [],
    };

    if (ancestorNames.has(name)) {
      child.circular = true;
    } else {
      walk(child, resolvedPath, entry.dependencies || {}, packages, new Set(ancestorNames).add(name));
    }

    node.children.push(child);
  }
}

/** Flatten a tree into a list of nodes, depth-first, root included. */
export function flattenTree(root) {
  const out = [];
  (function visit(node) {
    out.push(node);
    for (const child of node.children) visit(child);
  })(root);
  return out;
}
