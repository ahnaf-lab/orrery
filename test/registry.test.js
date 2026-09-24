import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPublishTimes, fetchPublishDate } from '../src/registry.js';

function fakeFetch(responses) {
  return async (url) => {
    const hit = responses[url];
    if (!hit) return { ok: false, status: 404 };
    return { ok: true, json: async () => hit };
  };
}

test('fetchPublishTimes returns the registry\'s version -> date map', async () => {
  const fetchImpl = fakeFetch({
    'https://registry.npmjs.org/left-pad': {
      time: { '1.3.0': '2015-08-15T00:00:00.000Z' },
    },
  });

  const times = await fetchPublishTimes('left-pad', { fetchImpl });
  assert.deepEqual(times, { '1.3.0': '2015-08-15T00:00:00.000Z' });
});

test('fetchPublishTimes URL-encodes scoped package names correctly', async () => {
  let requestedUrl;
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ time: {} }) };
  };

  await fetchPublishTimes('@scope/pkg', { fetchImpl });
  assert.equal(requestedUrl, 'https://registry.npmjs.org/@scope%2Fpkg');
});

test('fetchPublishTimes throws on a non-OK response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  await assert.rejects(() => fetchPublishTimes('missing-pkg', { fetchImpl }), /HTTP 404/);
});

test('fetchPublishDate resolves a single version out of the time map', async () => {
  const fetchImpl = fakeFetch({
    'https://registry.npmjs.org/chalk': {
      time: { '4.1.2': '2020-11-11T00:00:00.000Z', '4.1.1': '2020-09-01T00:00:00.000Z' },
    },
  });

  const date = await fetchPublishDate('chalk', '4.1.2', { fetchImpl });
  assert.equal(date, '2020-11-11T00:00:00.000Z');
});

test('fetchPublishDate returns null for a version absent from the time map', async () => {
  const fetchImpl = fakeFetch({
    'https://registry.npmjs.org/chalk': { time: { '4.1.2': '2020-11-11T00:00:00.000Z' } },
  });

  const date = await fetchPublishDate('chalk', '9.9.9', { fetchImpl });
  assert.equal(date, null);
});
