# orrery

Render a project's dependency tree as an animated ASCII solar system. Each
package orbits at a distance set by how deep it sits in the dependency graph,
and its orbit visibly decays the longer it's gone since a release — so you can
step through the animation frame by frame and watch technical debt drift
toward the sun.

This first milestone builds the underlying **dependency model**: parsing a
project's `package.json` and lockfile into a depth-ranked tree, with each
resolved package annotated with its release age. The animation itself lands
in a later milestone; today the tool prints the model as JSON.

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

This prints the dependency tree as JSON: each node has a `name`, resolved
`version`, `depth` (distance from the project root along the dependency
graph — not physical `node_modules` nesting), and, unless you pass
`--offline`, a `releaseDate` and `ageDays` for its resolved version.

```sh
orrery --offline    # skip release-age lookups entirely
orrery --help        # show usage
```

By default, `orrery` looks up each distinct package's publish dates from the
public npm registry (`https://registry.npmjs.org/<package>`) — one request
per package name, reused for every version and every place that package
appears in the tree. Pass `--offline` to build the tree with no network
access at all; the ages simply won't be filled in.

A package that can't be resolved from the lockfile (an unmet optional
dependency, for example) is included in the tree with `unresolved: true`
instead of causing the whole run to fail. Circular dependencies are cut
where they repeat and marked `circular: true` rather than expanded forever.

Only npm's own lockfile formats (`package-lock.json` versions 1 through 3,
and `npm-shrinkwrap.json`) are supported for now.

## Status

Built autonomously and gated on passing tests: every change to this project
is verified — build, tests, and a security review — before it ships.
