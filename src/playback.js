import { flattenTree } from './tree.js';
import { ageDays } from './age.js';
import { renderFrame } from './render.js';

// How many points the synthetic time axis has by default when the caller
// doesn't ask for a specific number of frames.
export const DEFAULT_FRAME_COUNT = 24;

const STATE = Object.freeze({ PAUSED: 'paused', PLAYING: 'playing', ENDED: 'ended' });

/**
 * Build the synthetic time axis playback steps across: `frameCount` points
 * running from the oldest release date anywhere in the tree up to `now`,
 * evenly spaced. Frame 0 shows the tree as it would have looked back when
 * its oldest dependency was newly released; the last frame matches today's
 * static render exactly.
 *
 * If the tree carries no release dates at all (e.g. built with --offline),
 * there is nothing to animate, and the axis collapses to the single point
 * `now`.
 *
 * @param {object} root tree root, ideally annotated by attachReleaseAges()
 * @param {object} [options]
 * @param {number} [options.frameCount]
 * @param {Date} [options.now]
 * @returns {Date[]} `frameCount` dates (or 1, if there's nothing to animate)
 */
export function buildTimeAxis(root, { frameCount = DEFAULT_FRAME_COUNT, now = new Date() } = {}) {
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error('frameCount must be a positive integer');
  }

  const releaseTimes = flattenTree(root)
    .map((node) => node.releaseDate)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  const nowMs = now.getTime();
  const oldestMs = releaseTimes.length ? Math.min(...releaseTimes) : nowMs;

  if (frameCount === 1 || oldestMs >= nowMs) {
    return [new Date(nowMs)];
  }

  const step = (nowMs - oldestMs) / (frameCount - 1);
  return Array.from({ length: frameCount }, (_, i) => new Date(oldestMs + step * i));
}

/**
 * Recompute release age for every dated node in `root` as of `asOf`. The
 * input tree is never mutated — a structural clone is returned — so the
 * same model can be replayed at any number of points along the axis.
 *
 * @param {object} root
 * @param {Date} asOf
 * @returns {object} cloned tree with `ageDays` recomputed relative to `asOf`
 */
export function treeAsOf(root, asOf) {
  const clone = { ...root, children: root.children.map((child) => treeAsOf(child, asOf)) };
  if (root.releaseDate) {
    clone.ageDays = ageDays(root.releaseDate, asOf);
  }
  return clone;
}

/**
 * Render the frame at `index` on a time `axis` previously built by
 * buildTimeAxis().
 *
 * @param {object} root
 * @param {Date[]} axis
 * @param {number} index
 * @param {object} [renderOptions] passed through to renderFrame()
 * @returns {string}
 */
export function frameAt(root, axis, index, renderOptions) {
  if (!Number.isInteger(index) || index < 0 || index >= axis.length) {
    throw new Error(`frame index out of range: ${index} (axis has ${axis.length} frame(s))`);
  }
  return renderFrame(treeAsOf(root, axis[index]), renderOptions);
}

/**
 * A step/play/pause animation cursor over a fixed number of frames.
 *
 * States: `paused` (default), `playing`, and `ended` (reached the last
 * frame while playing, with looping off). It is a plain finite state
 * machine with no timers of its own — something else (a CLI loop, a test)
 * drives it forward by calling tick() on its own schedule, which is what
 * makes it possible to test deterministically.
 */
export class Playback {
  /**
   * @param {number} frameCount total number of frames on the axis
   * @param {object} [options]
   * @param {boolean} [options.loop] wrap back to frame 0 instead of ending
   */
  constructor(frameCount, { loop = false } = {}) {
    if (!Number.isInteger(frameCount) || frameCount < 1) {
      throw new Error('frameCount must be a positive integer');
    }
    this.frameCount = frameCount;
    this.loop = loop;
    this.index = 0;
    this.state = STATE.PAUSED;
  }

  get atEnd() {
    return this.index === this.frameCount - 1;
  }

  /** Start (or resume) playback. No-op if already playing. */
  play() {
    if (this.state === STATE.PLAYING) return this.state;
    if (this.state === STATE.ENDED) {
      if (!this.loop) return this.state;
      this.index = 0;
    }
    this.state = STATE.PLAYING;
    return this.state;
  }

  /** Suspend playback at the current frame. No-op unless playing. */
  pause() {
    if (this.state === STATE.PLAYING) this.state = STATE.PAUSED;
    return this.state;
  }

  /**
   * Advance one frame, but only while playing — meant to be called by an
   * external clock (setInterval, a test loop, ...) on a fixed cadence.
   * A no-op while paused or ended.
   */
  tick() {
    if (this.state !== STATE.PLAYING) return this.index;
    this._advance(1);
    if (!this.loop && this.atEnd) this.state = STATE.ENDED;
    return this.index;
  }

  /**
   * Move `delta` frames (default 1) right now, regardless of play state.
   * A manual step always leaves playback paused, mirroring how scrubbing a
   * media player interrupts autoplay.
   */
  step(delta = 1) {
    this._advance(delta);
    this.state = STATE.PAUSED;
    return this.index;
  }

  /** Jump directly to `index`, clamped (or wrapped, if looping). */
  seek(index) {
    if (!Number.isInteger(index)) throw new Error('seek requires an integer frame index');
    this.index = this._resolve(index);
    if (this.state === STATE.ENDED && !this.atEnd) this.state = STATE.PAUSED;
    return this.index;
  }

  /** Return to frame 0 and pause, regardless of current state. */
  reset() {
    this.index = 0;
    this.state = STATE.PAUSED;
    return this.index;
  }

  _advance(delta) {
    this.index = this._resolve(this.index + delta);
  }

  _resolve(index) {
    if (this.loop) return ((index % this.frameCount) + this.frameCount) % this.frameCount;
    return Math.min(Math.max(index, 0), this.frameCount - 1);
  }
}
