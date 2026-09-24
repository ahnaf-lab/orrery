#!/usr/bin/env node
import path from 'node:path';
import { loadDependencyModel } from '../src/index.js';
import { renderFrame } from '../src/render.js';
import { buildTimeAxis, frameAt, treeAsOf, Playback, DEFAULT_FRAME_COUNT } from '../src/playback.js';

const DEFAULT_INTERVAL_MS = 120;

const HELP = `orrery - render a project's dependency tree as an ASCII solar system

Usage:
  orrery [--dir <path>] [--offline] [--width <n>] [--height <n>]
  orrery --json [--dir <path>] [--offline]
  orrery --play [--frames <n>] [--interval <ms>] [--dir <path>]
  orrery --frame <n> [--frames <n>] [--dir <path>]

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
  --frames <n>   number of points on the synthetic time axis (default: ${DEFAULT_FRAME_COUNT})
  --interval <ms> delay between frames while playing (default: ${DEFAULT_INTERVAL_MS})
  --help         show this message

By default this prints a single static frame: the project is the sun at the
centre, each dependency orbits at a radius set by its depth, and that orbit
is pulled toward the sun the longer it's been since the package's resolved
version was released.

With --play or --frame, that same decay is animated across a synthetic time
axis built from the tree's own release dates: frame 0 is as far back as the
oldest resolved package was released, and the last frame matches today's
static frame exactly. --offline builds have no release dates to animate, so
the axis collapses to that single frame.`;

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

  if (options.play && options.frame !== undefined) {
    throw new Error('--play and --frame cannot be used together');
  }

  const dir = path.resolve(options.dir);
  const { tree, warnings, lockfileName } = await loadDependencyModel(dir, { offline: options.offline });

  const frameOptions = {};
  if (options.width !== undefined) frameOptions.width = options.width;
  if (options.height !== undefined) frameOptions.height = options.height;

  if (options.play || options.frame !== undefined) {
    const axis = buildTimeAxis(tree, { frameCount: options.frameCount ?? DEFAULT_FRAME_COUNT });

    if (options.frame !== undefined && options.frame >= axis.length) {
      throw new Error(`--frame must be less than the frame count (${axis.length})`);
    }

    const printFrame = (index) => {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              dir,
              lockfileName,
              frame: index,
              frameCount: axis.length,
              asOf: axis[index].toISOString(),
              tree: treeAsOf(tree, axis[index]),
            },
            null,
            2
          )
        );
      } else {
        console.log(`-- frame ${index + 1}/${axis.length} (${axis[index].toISOString().slice(0, 10)}) --`);
        console.log(frameAt(tree, axis, index, frameOptions));
      }
    };

    if (options.frame !== undefined) {
      printFrame(options.frame);
    } else if (axis.length === 1) {
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
    console.log(JSON.stringify({ dir, lockfileName, tree }, null, 2));
  } else {
    console.log(renderFrame(tree, frameOptions));
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
