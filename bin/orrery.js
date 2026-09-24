#!/usr/bin/env node
import path from 'node:path';
import { loadDependencyModel } from '../src/index.js';

const HELP = `orrery - render a project's dependency tree as an ASCII solar system

Usage:
  orrery [--dir <path>] [--offline]

Options:
  --dir <path>   project directory to read package.json + a lockfile from
                 (default: current directory)
  --offline      skip release-age lookups against the public npm registry
  --help         show this message

This milestone builds the dependency model only: it prints the depth-ranked
tree (and, unless --offline is given, each package's release age) as JSON.
The animated rendering arrives in a later milestone.`;

function parseArgs(argv) {
  const options = { dir: process.cwd(), offline: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--offline') {
      options.offline = true;
    } else if (arg === '--dir') {
      options.dir = argv[++i];
      if (!options.dir) throw new Error('--dir requires a path argument');
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

  console.log(JSON.stringify({ dir, lockfileName, tree }, null, 2));

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
