import { flattenTree } from './tree.js';

// How many days of age it takes for a package to reach full orbital decay.
// Five years: old enough to flag as neglected, not so old that everything
// in a typical tree pins to the sun and the rendering stops being useful.
const DEFAULT_HORIZON_DAYS = 365 * 5;

// Decay never pulls a package all the way onto the sun — that would erase
// depth information (a very old direct dependency would land on top of a
// fresh transitive one several rings out). Capped at 85% of the way in.
const MAX_DECAY_PULL = 0.85;

const SUN_CHAR = '@';
const UNRESOLVED_CHAR = '?';
const CIRCULAR_CHAR = 'x';
const FRESH_CHAR = '*';
const AGING_CHAR = 'o';
const STALE_CHAR = '.';

/**
 * Fraction (0..1) of the way from "just released" to "fully decayed" that a
 * package's orbit has drifted, given its age in days. Unknown age (no
 * registry data, or --offline) is treated as no decay rather than guessed.
 */
export function decayFraction(ageDays, horizonDays = DEFAULT_HORIZON_DAYS) {
  if (ageDays === null || ageDays === undefined) return 0;
  return Math.min(Math.max(ageDays, 0) / horizonDays, 1);
}

function glyphFor(node, fraction) {
  if (node.unresolved) return UNRESOLVED_CHAR;
  if (node.circular) return CIRCULAR_CHAR;
  if (fraction < 0.33) return FRESH_CHAR;
  if (fraction < 0.66) return AGING_CHAR;
  return STALE_CHAR;
}

/**
 * Render one static ASCII frame of the dependency tree as a solar system:
 * the root package is the sun at the centre, every other resolved package
 * orbits at a radius set by its depth, and that radius is pulled inward the
 * longer it's been since the package's version was released.
 *
 * Deterministic: nodes at the same depth are sorted by name and spaced
 * evenly by angle, so the same tree always produces the same frame.
 *
 * @param {object} root tree root from buildDependencyTree() / loadDependencyModel()
 * @param {object} [options]
 * @param {number} [options.width] canvas width in characters (odd numbers centre exactly).
 *   Default 61x23 is wider than it is tall on purpose: terminal characters
 *   are roughly twice as tall as they are wide, so the x/y radii are scaled
 *   independently from the canvas's own dimensions to still land on a
 *   visually round orbit rather than a tall ellipse.
 * @param {number} [options.height] canvas height in characters (odd numbers centre exactly)
 * @param {number} [options.horizonDays] age in days for full orbital decay
 * @returns {string} the frame, as `height` lines of `width` characters each
 */
export function renderFrame(root, options = {}) {
  const { width = 61, height = 23, horizonDays = DEFAULT_HORIZON_DAYS } = options;
  if (width < 3 || height < 3) {
    throw new Error('renderFrame needs a canvas of at least 3x3');
  }

  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  grid[centerY][centerX] = SUN_CHAR;

  const byDepth = new Map();
  let maxDepth = 0;
  for (const node of flattenTree(root)) {
    if (node.depth === 0) continue; // the root is the sun, drawn above
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth).push(node);
    maxDepth = Math.max(maxDepth, node.depth);
  }

  const maxRadiusX = centerX - 1;
  const maxRadiusY = centerY - 1;
  const ringStepX = maxDepth > 0 ? maxRadiusX / maxDepth : maxRadiusX;
  const ringStepY = maxDepth > 0 ? maxRadiusY / maxDepth : maxRadiusY;

  for (const [depth, nodes] of byDepth) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    const baseRadiusX = depth * ringStepX;
    const baseRadiusY = depth * ringStepY;

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const fraction = decayFraction(node.ageDays, horizonDays);
      const radiusX = baseRadiusX * (1 - fraction * MAX_DECAY_PULL);
      const radiusY = baseRadiusY * (1 - fraction * MAX_DECAY_PULL);

      const x = Math.round(centerX + radiusX * Math.cos(angle));
      const y = Math.round(centerY + radiusY * Math.sin(angle));

      if (x < 0 || x >= width || y < 0 || y >= height) return;
      if (x === centerX && y === centerY) return; // never overwrite the sun
      grid[y][x] = glyphFor(node, fraction);
    });
  }

  return grid.map((row) => row.join('')).join('\n');
}
