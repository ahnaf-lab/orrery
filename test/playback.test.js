import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeAxis, treeAsOf, frameAt, Playback, DEFAULT_FRAME_COUNT } from '../src/playback.js';

function makeTree() {
  return {
    name: 'root-app',
    version: '1.0.0',
    depth: 0,
    path: '',
    children: [
      {
        name: 'old-dep',
        version: '1.0.0',
        depth: 1,
        path: 'node_modules/old-dep',
        releaseDate: '2015-01-01T00:00:00.000Z',
        ageDays: 4000,
        children: [],
      },
      {
        name: 'new-dep',
        version: '2.0.0',
        depth: 1,
        path: 'node_modules/new-dep',
        releaseDate: '2026-09-01T00:00:00.000Z',
        ageDays: 24,
        children: [],
      },
      { name: 'ghost-dep', version: null, depth: 1, path: null, unresolved: true, children: [] },
    ],
  };
}

// -- buildTimeAxis --------------------------------------------------------

test('buildTimeAxis returns frameCount points from the oldest release to now', () => {
  const now = new Date('2026-09-25T00:00:00.000Z');
  const axis = buildTimeAxis(makeTree(), { frameCount: 5, now });

  assert.equal(axis.length, 5);
  assert.equal(axis[0].toISOString(), '2015-01-01T00:00:00.000Z');
  assert.equal(axis[axis.length - 1].toISOString(), now.toISOString());
  for (let i = 1; i < axis.length; i++) {
    assert.ok(axis[i].getTime() >= axis[i - 1].getTime(), 'axis must be non-decreasing');
  }
});

test('buildTimeAxis defaults frameCount to DEFAULT_FRAME_COUNT', () => {
  const axis = buildTimeAxis(makeTree(), { now: new Date('2026-09-25T00:00:00.000Z') });
  assert.equal(axis.length, DEFAULT_FRAME_COUNT);
});

test('buildTimeAxis collapses to a single point when no node has a release date', () => {
  const tree = {
    name: 'root-app',
    version: '1.0.0',
    depth: 0,
    path: '',
    children: [{ name: 'dep', version: '1.0.0', depth: 1, path: 'node_modules/dep', children: [] }],
  };
  const now = new Date('2026-09-25T00:00:00.000Z');
  const axis = buildTimeAxis(tree, { frameCount: 10, now });

  assert.equal(axis.length, 1);
  assert.equal(axis[0].toISOString(), now.toISOString());
});

test('buildTimeAxis rejects a non-positive frameCount', () => {
  assert.throws(() => buildTimeAxis(makeTree(), { frameCount: 0 }), /positive integer/);
});

// -- treeAsOf ---------------------------------------------------------------

test('treeAsOf recomputes ageDays relative to the given point in time without mutating the input', () => {
  const tree = makeTree();
  const original = JSON.parse(JSON.stringify(tree));

  const asOf = new Date('2016-01-01T00:00:00.000Z');
  const clone = treeAsOf(tree, asOf);

  const oldDep = clone.children.find((c) => c.name === 'old-dep');
  assert.equal(oldDep.ageDays, 365); // one year after its 2015-01-01 release

  assert.deepEqual(tree, original, 'the input tree must not be mutated');
});

test('treeAsOf leaves undated nodes (unresolved, root) alone', () => {
  const clone = treeAsOf(makeTree(), new Date('2020-01-01T00:00:00.000Z'));
  const ghost = clone.children.find((c) => c.name === 'ghost-dep');
  assert.equal(ghost.unresolved, true);
  assert.equal(ghost.ageDays, undefined);
});

// -- frameAt ------------------------------------------------------------

test('frameAt renders a bounded frame for a valid axis index', () => {
  const axis = buildTimeAxis(makeTree(), { frameCount: 4, now: new Date('2026-09-25T00:00:00.000Z') });
  const frame = frameAt(makeTree(), axis, 0, { width: 41, height: 21 });
  const lines = frame.split('\n');
  assert.equal(lines.length, 21);
  assert.ok(lines.every((line) => line.length === 41));
});

test('frameAt rejects an out-of-range index', () => {
  const axis = buildTimeAxis(makeTree(), { frameCount: 4, now: new Date('2026-09-25T00:00:00.000Z') });
  assert.throws(() => frameAt(makeTree(), axis, 4), /out of range/);
  assert.throws(() => frameAt(makeTree(), axis, -1), /out of range/);
});

// -- Playback state machine --------------------------------------------

test('Playback starts paused at frame 0', () => {
  const player = new Playback(5);
  assert.equal(player.state, 'paused');
  assert.equal(player.index, 0);
});

test('Playback rejects a non-positive frameCount', () => {
  assert.throws(() => new Playback(0), /positive integer/);
});

test('play() switches to playing, and tick() advances one frame at a time', () => {
  const player = new Playback(3);
  player.play();
  assert.equal(player.state, 'playing');

  player.tick();
  assert.equal(player.index, 1);
  player.tick();
  assert.equal(player.index, 2);
});

test('tick() is a no-op while paused', () => {
  const player = new Playback(3);
  player.tick();
  assert.equal(player.index, 0);
  assert.equal(player.state, 'paused');
});

test('reaching the last frame while playing (no loop) transitions to ended', () => {
  const player = new Playback(2);
  player.play();
  player.tick(); // -> frame 1, the last frame
  assert.equal(player.index, 1);
  assert.equal(player.state, 'ended');

  // further ticks are no-ops: stays put, doesn't throw, doesn't go out of range
  player.tick();
  assert.equal(player.index, 1);
  assert.equal(player.state, 'ended');
});

test('pause() stops playback, and subsequent tick()s do nothing', () => {
  const player = new Playback(4);
  player.play();
  player.tick();
  assert.equal(player.index, 1);

  player.pause();
  assert.equal(player.state, 'paused');
  player.tick();
  assert.equal(player.index, 1, 'ticking while paused must not advance the frame');
});

test('step() moves the cursor directly and always leaves playback paused', () => {
  const player = new Playback(5);
  player.play();

  player.step(2);
  assert.equal(player.index, 2);
  assert.equal(player.state, 'paused', 'a manual step interrupts autoplay');

  player.step(-1);
  assert.equal(player.index, 1);
});

test('step() clamps at both ends of the axis', () => {
  const player = new Playback(3);
  player.step(-5);
  assert.equal(player.index, 0);
  player.step(50);
  assert.equal(player.index, 2);
});

test('seek() jumps directly and clamps out-of-range targets', () => {
  const player = new Playback(6);
  player.seek(3);
  assert.equal(player.index, 3);
  player.seek(999);
  assert.equal(player.index, 5);
  player.seek(-10);
  assert.equal(player.index, 0);
});

test('seek() away from the last frame resumes paused state after ending', () => {
  const player = new Playback(2);
  player.play();
  player.tick();
  assert.equal(player.state, 'ended');

  player.seek(0);
  assert.equal(player.state, 'paused');
});

test('reset() returns to frame 0 and pauses regardless of prior state', () => {
  const player = new Playback(4);
  player.play();
  player.tick();
  player.tick();
  assert.equal(player.index, 2);

  player.reset();
  assert.equal(player.index, 0);
  assert.equal(player.state, 'paused');
});

test('play() on an ended, non-looping player is a no-op', () => {
  const player = new Playback(2);
  player.play();
  player.tick();
  assert.equal(player.state, 'ended');

  player.play();
  assert.equal(player.state, 'ended');
  assert.equal(player.index, 1);
});

test('looping playback wraps back to frame 0 instead of ending', () => {
  const player = new Playback(3, { loop: true });
  player.play();
  player.tick(); // 1
  player.tick(); // 2 (last index)
  assert.equal(player.state, 'playing', 'looping playback never ends');
  player.tick(); // wraps to 0
  assert.equal(player.index, 0);
  assert.equal(player.state, 'playing');
});

test('play() on an ended looping player restarts from frame 0', () => {
  const player = new Playback(2, { loop: true });
  player.play();
  player.tick(); // wraps within loop mode, never actually ends
  assert.equal(player.state, 'playing');

  player.pause();
  player.seek(1);
  player.play();
  assert.equal(player.state, 'playing');
});
