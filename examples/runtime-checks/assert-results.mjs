#!/usr/bin/env node
// Check captured local mock requests. Workflow terminal outputs are separate n8n evidence.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const mode = option('--mode', 'generate');
const statePath = option('--state', null);
const state = statePath ? JSON.parse(await readFile(statePath, 'utf8')) : await (await fetch(option('--base-url', 'http://127.0.0.1:8787') + '/__state')).json();
const requests = state.requests;
assert(Array.isArray(requests), 'Captured requests');
if (mode === 'generate') {
  assert.equal(requests.length, 2, 'One request per source video');
  assert.deepEqual(requests.map(r => r.path), ['/api/jobs', '/api/jobs']);
  assert.deepEqual(requests.map(r => r.method), ['POST', 'POST']);
  assert.deepEqual(requests.map(r => r.body), ['fixture-video-A', 'fixture-video-B'].map(id => ({ functionName: 'VideoShorts', options: { youtubeVideoId: id }, webhook: '' })));
} else {
  assert(['completed', 'pending-then-completed', 'failed-then-completed'].includes(mode));
  assert.equal(state.scenario, mode);
  const posts = requests.filter(r => r.method === 'POST');
  const gets = requests.filter(r => r.method === 'GET');
  const expectedIds = mode === 'failed-then-completed' ? [42, 42, 43, 43] : [42, 43];
  assert.deepEqual(posts.map(r => r.body?.shortId), expectedIds, 'Render identity and POST count');
  for (const post of posts) assert.deepEqual(post.body.renderOptions, post.body.shortId === 42 ? { color: '#112233', fontSize: 31 } : { color: '#aabbcc', fontSize: 47 }, 'Styling pairs with source short');
  assert.equal(gets.length, mode === 'completed' ? 2 : 4, 'Status poll count');
  assert.deepEqual(gets.map(r => r.response.status), mode === 'completed' ? ['COMPLETED', 'COMPLETED'] : mode === 'pending-then-completed' ? ['PENDING', 'COMPLETED', 'PENDING', 'COMPLETED'] : ['FAILED', 'COMPLETED', 'FAILED', 'COMPLETED']);
  for (const req of requests) assert.equal(req.responseStatus, 200);
}
console.log(JSON.stringify({ mode, passed: true, requestCount: requests.length, scope: 'Local HTTP request bodies, item pairing, and response sequence' }));
