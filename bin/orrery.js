#!/usr/bin/env node
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadDependencyModel } from '../src/index.js';
import { renderFrame, annotateHighlight } from '../src/render.js';
import { buildTimeAxis, frameAt, treeAsOf, Playback, DEFAULT_FRAME_COUNT } from '../src/playback.js';

const DEFAULT_INTERVAL_MS = 120;

const HELP = `orrery - render a project's dependency tree as an ASCII solar system

Usage:
  orrery [--dir <path>] [--offline] [--width <n>] [--height <n>]
  orrery --json [--dir <path>] [--offline]
  orrery --play [--frames <n>] [--interval <ms>] [--dir <path>]
  orrery --frame <n> [--frames <n>] [--dir <path>]
  orrery --range <start>:<end> [--frames <n>] [--dir <path>]

Options:
  --dir <path>   project directory to read package.json + a lockfile from
                 (default: current directory)
  --offline      skip release-age lookups against the public npm registry
  --width <n>    canvas width in characters (default: 61)
  --height <n>   canvas height in characters (default: 23)
  --json         print the dependency model as JSON instead of a rendered frame
  --play         animate: step through the whole synthetic time axis once,
                 from each package's oldest release up to today
  --frame <n>    render a single frame (0-based) from the synthetic time axis
                 instead of today's frame
  --range <s>:<e> render frames s through e (0-based, inclusive) from the
                 synthetic time axis back-to-back with no delay between them
                 — for scripted, non-interactive CI output
  --frames <n>   number of points on the synthetic time axis (default: ${DEFAULT_FRAME_COUNT})
  --interval <ms> delay between frames while playing (default: ${DEFAULT_INTERVAL_MS})
  --highlight <name> mark one package with a distinct '#' glyph (in JSON
                 output, matching nodes instead get \`"highlighted": true\`)
  --snapshot <path> write the rendered output to a file instead of stdout —
                 for capturing a deterministic screenshot in CI. Cannot be
                 combined with --play, which is inherently interactive.
  --help         show this message

By default this prints a single static frame: the project is the sun at the
centre, each dependency orbits at a radius set by its depth, and that orbit
is pulled toward the sun the longer it's been since the package's resolved
version was released.

With --play, --frame, or --range, that same decay is animated across a
synthetic time axis built from the tree's own release dates: frame 0 is as
far back as the oldest resolved package was released, and the last frame
matches today's static frame exactly. --offline builds have no release
dates to animate, so the axis collapses to that single frame.`;

function parseRange(value) {
  const match = /^(\d+):(\d+)$/.exec(value ?? '');
  if (!match) throw new Error('--range requires "<start>:<end>", e.g. --range 0:5');
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > end) throw new Error('--range start must be less than or equal to end');
  return { start, end };
}

function parseArgs(argv) {
  const options = { dir: process.cwd(), offline: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--offline') {
      options.offline = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--dir') {
      options.dir = argv[++i];
      if (!options.dir) throw new Error('--dir requires a path argument');
    } else if (arg === '--width') {
      options.width = Number(argv[++i]);
      if (!Number.isInteger(options.width)) throw new Error('--width requires an integer argument');
    } else if (arg === '--height') {
      options.height = Number(argv[++i]);
      if (!Number.isInteger(options.height)) throw new Error('--height requires an integer argument');
    } else if (arg === '--play') {
      options.play = true;
    } else if (arg === '--frame') {
      options.frame = Number(argv[++i]);
      if (!Number.isInteger(options.frame) || options.frame < 0) {
        throw new Error('--frame requires a non-negative integer argument');
      }
    } else if (arg === '--range') {
      options.range = parseRange(argv[++i]);
    } else if (arg === '--frames') {
      options.frameCount = Number(argv[++i]);
      if (!Number.isInteger(options.frameCount) || options.frameCount < 1) {
        throw new Error('--frames requires a positive integer argument');
      }
    } else if (arg === '--interval') {
      options.interval = Number(argv[++i]);
      if (!Number.isInteger(options.interval) || options.interval < 0) {
        throw new Error('--interval requires a non-negative integer argument');
      }
    } else if (arg === '--highlight') {
      options.highlight = argv[++i];
      if (!options.highlight) throw new Error('--highlight requires a package name argument');
    } else if (arg === '--snapshot') {
      options.snapshot = argv[++i];
      if (!options.snapshot) throw new Error('--snapshot requires a file path argument');
    } else {
      throw new Error(`unrecognised argument: ${arg}`);
    }
  }
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(HELP);
    return 0;
  }

  const axisModes = [options.play, options.frame !== undefined, options.range !== undefined].filter(Boolean).length;
  if (axisModes > 1) {
    throw new Error('--play, --frame, and --range cannot be used together');
  }
  if (options.snapshot && options.play) {
    throw new Error('--snapshot cannot be used with --play; use --frame or --range for a deterministic capture');
  }

  const dir = path.resolve(options.dir);
  const { tree, warnings, lockfileName } = await loadDependencyModel(dir, { offline: options.offline });

  const frameOptions = {};
  if (options.width !== undefined) frameOptions.width = options.width;
  if (options.height !== undefined) frameOptions.height = options.height;
  if (options.highlight !== undefined) frameOptions.highlight = options.highlight;

  const asciiFrame = (axis, index) =>
    `-- frame ${index + 1}/${axis.length} (${axis[index].toISOString().slice(0, 10)}) --\n${frameAt(tree, axis, index, frameOptions)}`;

  const jsonFrame = (axis, index) => ({
    dir,
    lockfileName,
    frame: index,
    frameCount: axis.length,
    asOf: axis[index].toISOString(),
    tree: annotateHighlight(treeAsOf(tree, axis[index]), options.highlight),
  });

  let output;

  if (options.range) {
    const axis = buildTimeAxis(tree, { frameCount: options.frameCount ?? DEFAULT_FRAME_COUNT });
    const { start, end } = options.range;
    if (end >= axis.length) {
      throw new Error(`--range end must be less than the frame count (${axis.length})`);
    }
    const indexes = [];
    for (let i = start; i <= end; i++) indexes.push(i);

    output = options.json
      ? JSON.stringify(indexes.map((i) => jsonFrame(axis, i)), null, 2)
      : indexes.map((i) => asciiFrame(axis, i)).join('\n\n');
  } else if (options.frame !== undefined) {
    const axis = buildTimeAxis(tree, { frameCount: options.frameCount ?? DEFAULT_FRAME_COUNT });
    if (options.frame >= axis.length) {
      throw new Error(`--frame must be less than the frame count (${axis.length})`);
    }
    output = options.json ? JSON.stringify(jsonFrame(axis, options.frame), null, 2) : asciiFrame(axis, options.frame);
  } else if (options.play) {
    const axis = buildTimeAxis(tree, { frameCount: options.frameCount ?? DEFAULT_FRAME_COUNT });
    const printFrame = (index) => {
      console.log(options.json ? JSON.stringify(jsonFrame(axis, index), null, 2) : asciiFrame(axis, index));
    };

    if (axis.length === 1) {
      printFrame(0);
    } else {
      const player = new Playback(axis.length);
      const interval = options.interval ?? DEFAULT_INTERVAL_MS;
      player.play();
      printFrame(player.index);
      while (player.state === 'playing') {
        if (interval > 0) await sleep(interval);
        player.tick();
        printFrame(player.index);
      }
    }
  } else if (options.json) {
    output = JSON.stringify({ dir, lockfileName, tree: annotateHighlight(tree, options.highlight) }, null, 2);
  } else {
    output = renderFrame(tree, frameOptions);
  }

  if (output !== undefined) {
    if (options.snapshot) {
      await writeFile(options.snapshot, `${output}\n`, 'utf8');
      console.log(`wrote snapshot to ${options.snapshot}`);
    } else {
      console.log(output);
    }
  }

  for (const warning of warnings) {
    console.error(`warning: ${warning}`);
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`error: ${err.message}`);
      process.exit(1);
    }
  );
}
