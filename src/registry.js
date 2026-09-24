// Looks up when a specific package version was published, via the public
// npm registry's package document (which lists a publish time per version
// in a single response, so one request covers every version we'll ever ask
// about for that package).

const REGISTRY_BASE = 'https://registry.npmjs.org';

/**
 * Fetch the `time` map (version -> ISO publish date) for a package.
 *
 * @param {string} name package name
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] injectable for tests / to avoid
 *   a real network call
 * @returns {Promise<Record<string,string>>}
 */
export async function fetchPublishTimes(name, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('no fetch implementation available');
  }
  const url = `${REGISTRY_BASE}/${encodeURIComponent(name).replace('%40', '@')}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`registry lookup for ${name} failed: HTTP ${res.status}`);
  }
  const doc = await res.json();
  return doc.time || {};
}

/**
 * Look up the publish date of one exact version of a package.
 *
 * @returns {Promise<string|null>} ISO date string, or null if unknown
 */
export async function fetchPublishDate(name, version, options = {}) {
  const times = await fetchPublishTimes(name, options);
  return times[version] || null;
}
