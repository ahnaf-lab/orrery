const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between a release date and `now` (defaults to the current
 * time). Returns null if `releaseDate` can't be parsed.
 *
 * @param {string|Date} releaseDate
 * @param {Date} [now]
 * @returns {number|null}
 */
export function ageDays(releaseDate, now = new Date()) {
  const released = releaseDate instanceof Date ? releaseDate : new Date(releaseDate);
  if (Number.isNaN(released.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - released.getTime()) / MS_PER_DAY));
}
