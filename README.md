# orrery

Render a project's dependency tree as an animated ASCII solar system. Each
package orbits at a distance set by how deep it sits in the dependency graph,
and its orbit visibly decays the longer it's gone since a release — so you can
step through the animation frame by frame and watch technical debt drift
toward the sun.

Under the hood, a project's `package.json` and lockfile are parsed into a
depth-ranked dependency tree, with each resolved package annotated with its
release age. This milestone renders that tree as one static ASCII frame:
the project is the sun at the centre, each dependency orbits at a radius set
by its depth, and older, more neglected releases have visibly decayed
inward. Stepping through successive frames as an animation lands in a later
milestone; for now the tool prints a single frame.

## Install

```sh
git clone <this-repo>
cd orrery
npm install
npm link   # optional: makes the `orrery` command available globally
```

Requires Node.js 18 or later. There are no runtime dependencies — parsing
`package.json` and an npm lockfile only needs what Node ships with.

## Usage

Run it from inside any Node project that has a `package-lock.json` (or
`npm-shrinkwrap.json`):

```sh
orrery --dir /path/to/project
```

This prints one ASCII frame: `@` is the project itself at the centre, and
each dependency is drawn as a point orbiting it — further out the deeper it
sits in the dependency graph, and pulled inward the longer it's been since
its resolved version was released:

- `*` — released recently
- `o` — aging
- `.` — stale, and visibly drifted toward the sun
- `?` — couldn't be resolved from the lockfile at all
- `x` — a circular dependency, cut off rather than expanded forever

```sh
orrery --json               # print the dependency tree as JSON instead
orrery --offline             # skip release-age lookups entirely
orrery --width 81 --height 31  # render a bigger canvas
orrery --help                 # show usage
```

By default, `orrery` looks up each distinct package's publish dates from the
public npm registry (`https://registry.npmjs.org/<package>`) — one request
per package name, reused for every version and every place that package
appears in the tree. Pass `--offline` to render with no network access at
all; every package is then drawn as if freshly released, since its age is
unknown rather than assumed.

With `--json`, each tree node has a `name`, resolved `version`, `depth`
(distance from the project root along the dependency graph — not physical
`node_modules` nesting), and, unless `--offline` was passed, a `releaseDate`
and `ageDays` for its resolved version.

Only npm's own lockfile formats (`package-lock.json` versions 1 through 3,
and `npm-shrinkwrap.json`) are supported for now.

## Status

Built autonomously and gated on passing tests: every change to this project
is verified — build, tests, and a security review — before it ships.
