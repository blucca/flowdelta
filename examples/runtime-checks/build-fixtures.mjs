#!/usr/bin/env node
// Derived workflow portions: Copyright (c) 2025 MI, MIT.
// Source and full notice: ../public-cases/README.md and swiftia-LICENSE.txt.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const out = resolve(option('--out', 'temp/flowdelta-runtime'));
const base = option('--base-url', 'http://127.0.0.1:8787').replace(/\/$/, '');
const stylingMode = option('--styling', 'object');
const repairedBody = args.includes('--repair-body');
assert(['object', 'json-string'].includes(stylingMode), '--styling object|json-string');
assert(['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal'].includes(new URL(base).hostname), 'Use a local mock URL');
const sourcePath = join(here, '../public-cases/swiftia-after.json');
const raw = await readFile(sourcePath, 'utf8');
const source = JSON.parse(raw);
const original = (name) => {
  const node = source.nodes.find((node) => node.name === name);
  assert(node, `Source node ${name}`);
  return structuredClone(node);
};
const utility = (name, type, parameters, position = [0, 0], typeVersion = 1) => ({
  id: `flowdelta-fixture-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
  name, type: `n8n-nodes-base.${type}`, typeVersion, parameters, position,
});
const trigger = () => utility('Fixture start', 'manualTrigger', {}, [-400, 0]);
const code = (name, jsCode) => utility(name, 'code', { jsCode }, [-200, 0], 2);
const link = (name) => ({ node: name, type: 'main', index: 0 });
const next = (name) => ({ main: [[link(name)]] });
const localize = (node) => {
  node.parameters.url = node.parameters.url.replace('https://app.swiftia.io', base);
  for (const header of node.parameters.headerParameters?.parameters ?? []) {
    if (header.name.toLowerCase() === 'authorization') header.value = 'Bearer flowdelta-local-fixture';
  }
  return node;
};
const workflow = (name, nodes, connections) => ({
  id: createHash('sha256').update(name).digest('hex').slice(0, 16),
  name, nodes, connections, active: false,
  settings: { executionOrder: 'v1', executionTimeout: 60, saveExecutionProgress: true },
});

const videos = ['fixture-video-A', 'fixture-video-B'];
const generate = workflow('FlowDelta isolated Swiftia generateShorts', [
  trigger(),
  code('preparingField', `return ${JSON.stringify(videos)}.map(videoId => ({json: {videoId, videoSource: 'youtube'}}));`),
  localize(original('generateShorts')),
  utility('Recorded job outputs', 'noOp', {}, [600, 0]),
], {
  'Fixture start': next('preparingField'),
  preparingField: next('generateShorts'),
  generateShorts: next('Recorded job outputs'),
});

const shorts = [
  { 'data.shorts': { id: 42, text: 'Synthetic short A', reason: 'fixture' }, styling: { color: '#112233', fontSize: 31 }, title: 'Fixture A' },
  { 'data.shorts': { id: 43, text: 'Synthetic short B', reason: 'fixture' }, styling: { color: '#aabbcc', fontSize: 47 }, title: 'Fixture B' },
];
if (stylingMode === 'json-string') {
  for (const item of shorts) item.styling = JSON.stringify(item.styling);
}
const kept = ['Loop Over Items', 'current_item_ref', 'renderShort', 'Wait1', 'getRender', 'isError ?', 'iscompleted ?', 'verifyingLoopOutput'];
const renderNodes = kept.map(original);
for (const node of renderNodes) {
  if (node.type === 'n8n-nodes-base.httpRequest') localize(node);
  if (node.name === 'Wait1') node.parameters = { amount: 0.1, unit: 'seconds' };
  if (node.name === 'renderShort' && repairedBody) {
    node.parameters.jsonBody = "={{ { shortId: $('current_item_ref').item.json['data.shorts'].id, renderOptions: $('current_item_ref').item.json.styling } }}";
  }
}
const renderConnections = {};
for (const name of kept) {
  const connections = source.connections[name];
  if (!connections) continue;
  renderConnections[name] = structuredClone(connections);
  for (const outputs of Object.values(renderConnections[name])) {
    for (const branch of outputs) {
      for (const target of branch) {
        if (name === 'iscompleted ?' && target.node === 'generatingMetaData') target.node = 'Record completed short';
      }
      for (let i = branch.length - 1; i >= 0; i--) {
        if (!kept.includes(branch[i].node) && branch[i].node !== 'Record completed short') branch.splice(i, 1);
      }
    }
  }
}
const record = utility('Record completed short', 'set', {
  assignments: { assignments: [
    { id: 'fixture-record-short', name: 'shortId', type: 'number', value: "={{ $('current_item_ref').item.json['data.shorts'].id }}" },
    { id: 'fixture-record-render', name: 'renderId', type: 'string', value: '={{ $json.renderId }}' },
    { id: 'fixture-record-status', name: 'status', type: 'string', value: '={{ $json.status }}' },
  ] }, options: {},
}, [2700, 0], 3.3);
const render = workflow(`FlowDelta isolated Swiftia render loop (${stylingMode}${repairedBody ? ', proposed body' : ''})`, [
  trigger(), code('Fixture shorts', `return ${JSON.stringify(shorts)}.map(json => ({json}));`), ...renderNodes, record,
], {
  'Fixture start': next('Fixture shorts'),
  'Fixture shorts': next('Loop Over Items'),
  ...renderConnections,
  'Record completed short': next('Loop Over Items'),
});

// Exact structural changes for every retained source node, plus removed/added nodes and graph.
function differences(before, after, path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => differences(before[key], after[key], `${path}/${key}`));
  }
  return [{ path, before: before ?? null, after: after ?? null }];
}
function transformation(fixture) {
  const retained = fixture.nodes.filter(n => source.nodes.some(s => s.id === n.id));
  return {
    retainedNodes: retained.map(n => n.name),
    modifiedRetainedNodes: retained.flatMap(n => {
      const changes = differences(source.nodes.find(s => s.id === n.id), n);
      return changes.length ? [{ name: n.name, changes }] : [];
    }),
    addedNodes: fixture.nodes.filter(n => !source.nodes.some(s => s.id === n.id)).map(n => n.name),
    removedNodes: source.nodes.filter(n => !fixture.nodes.some(s => s.id === n.id)).map(n => n.name),
    connectionChanges: differences(source.connections, fixture.connections),
    settingsChanges: differences(source.settings, fixture.settings),
  };
}
for (const fixture of [generate, render]) {
  const names = new Set(fixture.nodes.map(n => n.name));
  for (const connection of Object.values(fixture.connections)) {
    for (const branches of Object.values(connection)) for (const branch of branches) for (const target of branch) assert(names.has(target.node));
  }
  for (const node of fixture.nodes) {
    assert(!node.credentials, 'Fixtures use local mock credentials');
    if (node.type === 'n8n-nodes-base.httpRequest') assert(node.parameters.url.includes(base));
  }
}
await mkdir(out, { recursive: true });
await writeFile(join(out, 'generate.json'), JSON.stringify(generate, null, 2) + '\n');
await writeFile(join(out, 'render.json'), JSON.stringify(render, null, 2) + '\n');
await copyFile(join(here, '../public-cases/swiftia-LICENSE.txt'), join(out, 'swiftia-LICENSE.txt'));
await writeFile(join(out, 'transformations.json'), JSON.stringify({
  source: 'https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/blob/7cd32c2a6ccbb2ca6edf4bded2534e916fd08985/video_to_shorts_Automation.json',
  sourceFixture: '../public-cases/swiftia-after.json',
  copyright: 'Copyright (c) 2025 MI', license: 'MIT; see swiftia-LICENSE.txt',
  mockBaseUrl: base, stylingMode, repairedBody, videos, shorts,
  fixtureScope: 'Isolated original HTTP expressions, item pairing, and render-loop control flow against synthetic local HTTP responses.',
  excludedExecution: ['Swiftia service', 'YouTube', 'Gemini', 'source form/styling preparation', 'uploads', 'production environments'],
  generate: transformation(generate), render: transformation(render),
}, null, 2) + '\n');
console.log(JSON.stringify({ out, files: ['generate.json', 'render.json', 'transformations.json', 'swiftia-LICENSE.txt'], stylingMode, repairedBody }));
