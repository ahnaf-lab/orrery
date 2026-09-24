#!/usr/bin/env node
import path from 'node:path';
import { loadDependencyModel } from '../src/index.js';
import { renderFrame } from '../src/render.js';

const HELP = `orrery - render a project's dependency tree as an ASCII solar system

Usage:
  orrery [--dir <path>] [--offline] [--width <n>] [--height <n>]
  orrery --json [--dir <path>] [--offline]

Options:
  --dir <path>   project directory to read package.json + a lockfile from
                 (default: current directory)
  --offline      skip release-age lookups against the public npm registry
  --width <n>    canvas width in characters (default: 61)
  --height <n>   canvas height in characters (default: 23)
  --json         print the dependency model as JSON instead of a rendered frame
  --help         show this message

By default this prints a single static frame: the project is the sun at the
centre, each dependency orbits at a radius set by its depth, and that orbit
is pulled toward the sun the longer it's been since the package's resolved
version was released. Stepping through successive frames arrives in a later
milestone.`;

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
    } else {
      throw new Error(`unrecognised argument: ${arg}`);
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(HELP);
    return 0;
  }

  const dir = path.resolve(options.dir);
  const { tree, warnings, lockfileName } = await loadDependencyModel(dir, { offline: options.offline });

  if (options.json) {
    console.log(JSON.stringify({ dir, lockfileName, tree }, null, 2));
  } else {
    const frameOptions = {};
    if (options.width !== undefined) frameOptions.width = options.width;
    if (options.height !== undefined) frameOptions.height = options.height;
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
