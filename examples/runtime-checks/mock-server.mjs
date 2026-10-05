#!/usr/bin/env node
// Synthetic local HTTP contracts for isolated n8n workflow execution.
import http from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const port = Number(option('--port', '8787'));
const host = option('--host', '127.0.0.1');
const log = resolve(option('--log', 'temp/flowdelta-runtime/mock-requests.ndjson'));
const scenarios = ['completed', 'failed-then-completed', 'pending-then-completed'];
let scenario = option('--scenario', 'completed');
assert(scenarios.includes(scenario));
mkdirSync(dirname(log), { recursive: true });
let state;
function reset() { state = { requests: [], attempts: {}, polls: {}, jobs: [], renders: {}, generation: Date.now() }; }
reset();
function respond(res, status, value) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 128000) return respond(res, 413, { error: 'Fixture payload limit' });
    }
    let body;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    const path = new URL(req.url, `http://${host}:${port}`).pathname;
    if (path === '/__reset' && req.method === 'POST') {
      if (body?.scenario && !scenarios.includes(body.scenario)) return respond(res, 400, { scenarios });
      scenario = body?.scenario ?? scenario;
      reset();
      appendFileSync(log, JSON.stringify({ event: 'reset', scenario, generation: state.generation }) + '\n');
      return respond(res, 200, { scenario, generation: state.generation });
    }
    if (path === '/__state' && req.method === 'GET') return respond(res, 200, { scenario, ...state });
    if (path === '/__health') return respond(res, 200, { ready: true, scenario });
    const event = { at: new Date().toISOString(), generation: state.generation, scenario, method: req.method, path, rawBody: raw, body };
    let status = 200;
    let response;
    if (state.requests.length >= 30) {
      status = 429; response = { error: 'Fixture request cap reached' };
    } else if (req.method === 'POST' && path === '/api/jobs') {
      const id = `job-${state.jobs.length + 1}`;
      response = { id }; state.jobs.push({ id, body });
    } else if (req.method === 'POST' && /^\/api\/render\/?$/.test(path)) {
      if (!body || typeof body.shortId !== 'number' || typeof body.renderOptions !== 'object' || !body.renderOptions) {
        status = 422; response = { error: 'Fixture expects numeric shortId and object renderOptions' };
      } else {
        const attempt = (state.attempts[body.shortId] ?? 0) + 1;
        state.attempts[body.shortId] = attempt;
        const renderId = `render-${body.shortId}-${attempt}`;
        state.renders[renderId] = { shortId: body.shortId, attempt, request: body };
        response = { renderId };
      }
    } else if (req.method === 'GET' && path.startsWith('/api/render/')) {
      const renderId = path.slice('/api/render/'.length);
      const render = state.renders[renderId];
      if (!render) { status = 404; response = { error: 'Unknown fixture renderId' }; }
      else {
        const poll = (state.polls[renderId] ?? 0) + 1;
        state.polls[renderId] = poll;
        let renderStatus = 'COMPLETED';
        if (scenario === 'failed-then-completed' && render.attempt === 1) renderStatus = 'FAILED';
        if (scenario === 'pending-then-completed' && poll === 1) renderStatus = 'PENDING';
        response = { renderId, status: renderStatus, url: `http://${host}:${port}/fixture-output/${render.shortId}.mp4` };
      }
    } else { status = 404; response = { error: 'Route outside fixture contract' }; }
    Object.assign(event, { responseStatus: status, response });
    state.requests.push(event);
    appendFileSync(log, JSON.stringify(event) + '\n');
    respond(res, status, response);
  } catch (error) { respond(res, 500, { error: error.message }); }
});
server.listen(port, host, () => console.log(JSON.stringify({ ready: true, host, port, log, scenario })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
