#!/usr/bin/env node
// Run isolated excerpts in an installed n8n; save both successes and failures.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = resolve(outIndex < 0 ? 'temp/flowdelta-runtime/run' : args[outIndex + 1]);
const n8n = process.env.N8N_BINARY || 'n8n';
mkdirSync(out, { recursive: true });
const env = {
  ...process.env,
  N8N_USER_FOLDER: join(out, 'n8n-home'),
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_TEMPLATES_ENABLED: 'false',
  N8N_RUNNERS_MODE: 'internal',
  N8N_ENCRYPTION_KEY: 'flowdelta-local-fixture-only',
  N8N_LOG_LEVEL: 'info',
};
function command(binary, params, name) {
  const result = spawnSync(binary, params, { env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  writeFileSync(join(out, `${name}.stdout.txt`), stdout);
  writeFileSync(join(out, `${name}.stderr.txt`), stderr);
  return { exitCode: result.status, error: result.error?.message, stdout, stderr };
}
function requireCommand(binary, params, name) {
  const result = command(binary, params, name);
  assert.equal(result.exitCode, 0, `${name}: ${result.error || result.stderr || result.stdout}`);
  return result;
}
// Logs surround execution JSON on error paths. Decode balanced JSON objects.
function executionFrom(text) {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{' || (start > 0 && text[start - 1] !== '\n')) continue;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try {
          const value = JSON.parse(text.slice(start, i + 1));
          if (value.data?.resultData) return value;
        } catch {}
        break;
      }
    }
  }
  return null;
}
const version = requireCommand(n8n, ['--version'], 'version').stdout.trim();
for (const styling of ['object', 'json-string']) {
  requireCommand(process.execPath, [join(here, 'build-fixtures.mjs'), '--out', join(out, styling), '--styling', styling], `build-${styling}`);
}
requireCommand(process.execPath, [join(here, 'build-fixtures.mjs'), '--out', join(out, 'proposed-body'), '--repair-body'], 'build-proposed-body');
const files = ['object/generate.json', 'object/render.json', 'json-string/render.json', 'proposed-body/render.json'];
const fixtures = files.map(file => JSON.parse(readFileSync(join(out, file), 'utf8')));
writeFileSync(join(out, 'import.json'), JSON.stringify(fixtures));
requireCommand(n8n, ['import:workflow', `--input=${join(out, 'import.json')}`], 'import');
const server = spawn(process.execPath, [join(here, 'mock-server.mjs'), '--log', join(out, 'mock-requests.ndjson')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLogs = '';
server.stdout.on('data', chunk => { serverLogs += chunk; });
server.stderr.on('data', chunk => { serverLogs += chunk; });
const summary = { n8nVersion: version, nodeVersion: process.version, createdAt: new Date().toISOString(), cases: [] };
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await (await fetch('http://127.0.0.1:8787/__health')).json()).ready; } catch {}
    if (ready) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert(ready && server.exitCode === null, 'Local fixture server startup');
  const cases = [
    ['generate', 0, 'completed', 'generate'],
    ['object-completed', 1, 'completed', 'completed'],
    ['string-completed', 2, 'completed', 'completed'],
    ['string-pending', 2, 'pending-then-completed', 'pending-then-completed'],
    ['string-failed', 2, 'failed-then-completed', 'failed-then-completed'],
    ['proposed-completed', 3, 'completed', 'completed'],
    ['proposed-pending', 3, 'pending-then-completed', 'pending-then-completed'],
    ['proposed-failed', 3, 'failed-then-completed', 'failed-then-completed'],
  ];
  for (const [name, fixture, scenario, mode] of cases) {
    await fetch('http://127.0.0.1:8787/__reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario }) });
    const result = command(n8n, ['execute', `--id=${fixtures[fixture].id}`, '--rawOutput'], name);
    const execution = executionFrom(result.stdout + '\n' + result.stderr);
    const state = await (await fetch('http://127.0.0.1:8787/__state')).json();
    const stateFile = join(out, `${name}.state.json`);
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    if (execution) writeFileSync(join(out, `${name}.execution.json`), JSON.stringify(execution, null, 2));
    const checked = command(process.execPath, [join(here, 'assert-results.mjs'), '--mode', mode, '--state', stateFile], `${name}.http-check`);
    const resultData = execution?.data?.resultData;
    const sink = name === 'generate' ? 'Recorded job outputs' : 'verifyingLoopOutput';
    const outputs = resultData?.runData?.[sink]?.flatMap(run => run.data?.main?.[0] || []).map(item => item.json) || [];
    let terminalError;
    try {
      assert(execution && !resultData.error, 'n8n execution reaches success');
      if (name === 'generate') assert.deepEqual(outputs.map(x => x.id), ['job-1', 'job-2']);
      else {
        assert.deepEqual(outputs.map(x => x.shortId), [42, 43]);
        assert.deepEqual(outputs.map(x => x.status), ['COMPLETED', 'COMPLETED']);
      }
    } catch (error) { terminalError = error.message; }
    const record = {
      name, scenario, workflowId: fixtures[fixture].id, cliExitCode: result.exitCode,
      workflowSuccess: Boolean(execution && !resultData.error), httpAssertionsPassed: checked.exitCode === 0,
      terminalAssertionsPassed: !terminalError, terminalError, outputs, requestCount: state.requests.length,
      postCount: state.requests.filter(request => request.method === 'POST').length,
      pollCount: state.requests.filter(request => request.method === 'GET').length,
      renderNodeRuns: resultData?.runData?.renderShort?.length || 0,
      lastNode: resultData?.lastNodeExecuted, executionError: resultData?.error?.message,
      errorDescription: resultData?.error?.description, processError: result.error,
    };
    summary.cases.push(record);
    writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(record));
  }
} finally {
  server.kill('SIGTERM');
  writeFileSync(join(out, 'mock-server.log'), serverLogs);
}
const expected = [
  ['generate', true, 2], ['object-completed', false, 0],
  ['string-completed', true, 4], ['string-pending', true, 6], ['string-failed', false, 2],
  ['proposed-completed', true, 4], ['proposed-pending', true, 6], ['proposed-failed', true, 8],
];
for (const [name, success, requests] of expected) {
  const result = summary.cases.find(item => item.name === name);
  assert(result, `Recorded scenario ${name}`);
  assert.equal(result.workflowSuccess, success, `${name}: expected workflow outcome`);
  assert.equal(result.httpAssertionsPassed, success, `${name}: expected HTTP outcome`);
  assert.equal(result.terminalAssertionsPassed, success, `${name}: expected terminal outcome`);
  assert.equal(result.requestCount, requests, `${name}: request count`);
  if (!success) {
    assert.equal(result.lastNode, 'renderShort');
    assert.match(result.executionError, /JSON Body/);
    assert.equal(result.renderNodeRuns, name === 'string-failed' ? 2 : 1);
  }
}
summary.expectedMatrixMatched = true;
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`Results: ${join(out, 'summary.json')}`);
