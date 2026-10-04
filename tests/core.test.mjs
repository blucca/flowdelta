import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, parseWorkflow } from '../core.mjs';
const n = (name, parameters = {}, extras = {}) => ({ id: name.toLowerCase(), name, type: 'n8n-nodes-base.set', typeVersion: 1, parameters, ...extras });
const w = (nodes, connections = {}, extras = {}) => ({ name: 'Example', nodes, connections, ...extras });
const edge = (node, type = 'main', index = 0) => ({ node, type, index });
const clone = value => JSON.parse(JSON.stringify(value));
test('parse JSON, object and one workflow export array', () => {
  const data = w([]); assert.equal(parseWorkflow(data), data);
  assert.deepEqual(parseWorkflow(JSON.stringify([data])), data);
  for (const value of ['{', [], [data, data], {}, { nodes: [], connections: [] }, w([n('A'), n('A')]), w([n('A'), n('B', {}, { id: 'a' })]), w([], { A: { main: [null] } })]) assert.throws(() => parseWorkflow(value));
});
test('ignore visual metadata, notes, pinData and object key order', () => {
  const a = w([n('A', { one: 1, two: 2 })]); const b = clone(a);
  b.nodes[0].position = [500, 100]; b.nodes[0].notes = 'changed'; b.nodes[0].parameters = { two: 2, one: 1 }; b.pinData = { A: ['secret'] };
  assert.equal(analyze(a,b).changes.length, 0); assert.equal(analyze(a,b).summary.impacted, 0);
});
test('stable ID rename preserves connections and reports name path', () => {
  const a = w([n('A'), n('B')], { A: { main: [[edge('B')]] } }); const b = clone(a);
  b.nodes[0].name = 'Renamed'; b.connections.Renamed = b.connections.A; delete b.connections.A;
  const report = analyze(a,b); assert.equal(report.summary.changed, 1); assert.deepEqual(report.changes[0].fields, ['name']); assert.equal(report.connections.added.length, 0); assert.equal(report.connections.removed.length, 0); assert.equal(report.summary.impacted, 2);
});
test('no-ID fallback and stable-ID replacement', () => {
  const a = w([n('A', {}, { id: undefined })]); const b = w([n('A', { changed: true })]);
  assert.equal(analyze(a,b).summary.changed, 1);
  const c = clone(b); c.nodes[0].id = 'replacement'; const r = analyze(b,c);
  assert.equal(r.summary.added, 1); assert.equal(r.summary.removed, 1);
});
test('stable ID matching reserved before fallback', () => {
  const a = w([n('B', {}, { id: undefined }), n('A')]);
  const b = w([n('B', {}, { id: 'a' })]); const r = analyze(a,b);
  assert.equal(r.summary.changed, 1); assert.equal(r.summary.removed, 1); assert.equal(r.summary.added, 0);
});
test('branch reconnect identifies port changes and downstream impact', () => {
  const a = w([n('A'),n('B'),n('C'),n('D')], { A: { main: [[edge('B')], [edge('C')]] }, B: { main: [[edge('D')]] } }); const b = clone(a);
  b.connections.A.main = [[edge('C')], [edge('B')]];
  const r = analyze(a,b); assert.equal(r.summary.connectionsAdded, 2); assert.equal(r.summary.connectionsRemoved, 2);
  assert.deepEqual(new Set(r.impacted.map(n=>n.nodeName)), new Set(['B','C','D']));
});
test('deleted node reaches former downstream nodes', () => {
  const a = w([n('A'), n('B'), n('C')], { A: { main: [[edge('B')]] }, B: { main: [[edge('C')]] } });
  const r = analyze(a,w([n('B'),n('C')], { B: { main: [[edge('C')]] } }));
  assert.equal(r.summary.removed, 1); assert.equal(r.summary.impacted, 3);
});
test('cycles terminate and AI links propagate', () => {
  const a = w([n('A'),n('B')], { A: { ai_languageModel: [[edge('B','ai_languageModel')]] }, B: { main: [[edge('A')]] } }); const b = clone(a); b.nodes[0].parameters.model = 'new';
  const r = analyze(a,b); assert.equal(r.summary.impacted,2);
});
test('literal expression references add indirect dependencies', () => {
  const a = w([n('A'), n('B', { text: "={{ $('A').item.json.x }}" }), n('C', { text: '={{ $node["B"].json.x }}' })]); const b = clone(a); b.nodes[0].parameters.x = 1;
  assert.equal(analyze(a,b).summary.impacted,3);
});
test('sensitive values never appear in report', () => {
  const a = w([n('A', { token: 'PRIVATE_BEFORE', list: ['PRIVATE_LIST'] }, { credentials: { httpHeaderAuth: { id: 'CREDENTIAL_ID', name: 'CREDENTIAL_NAME' } } })]); const b = clone(a);
  b.nodes[0].parameters.token = 'PRIVATE_AFTER'; b.nodes[0].parameters.list = []; b.nodes[0].credentials.httpHeaderAuth = { id: 'NEW_ID', name: 'NEW_NAME' }; b.pinData = { secret: 'PIN_SECRET' };
  const r = analyze(a,b), json = JSON.stringify(r);
  for (const secret of ['PRIVATE_BEFORE','PRIVATE_LIST','CREDENTIAL_ID','CREDENTIAL_NAME','PRIVATE_AFTER','NEW_ID','NEW_NAME','PIN_SECRET']) assert.ok(!json.includes(secret));
  assert.ok(r.changes[0].fields.includes('parameters["token"]')); assert.ok(r.checks.some(c=>c.id.startsWith('credentials:')));
});
test('settings report independently and seed every node', () => {
  const a = w([n('A'),n('B')], {}, { settings: { executionOrder: 'v0' } }); const b = clone(a); b.settings.executionOrder='v1';
  const r = analyze(a,b); assert.equal(r.changes[0].kind,'settings'); assert.equal(r.summary.changed,0); assert.equal(r.summary.impacted,2); assert.ok(r.checks.some(c=>c.id==='settings'));
});
test('dangling references warn rather than silently claim complete impact', () => {
  const a = w([n('A', { x: "={{ $('Missing').item.json.x }}" })], { A: { main: [[edge('Missing')]] } });
  assert.equal(analyze(a,a).warnings.length,2);
});
test('input object is not mutated', () => {
  const a = w([n('A')]); const serialized = JSON.stringify(a); analyze(a,a); assert.equal(JSON.stringify(a),serialized);
});
test('IF and Switch get individual boundary checks without revealing values', () => {
  const a = w([n('IF', { conditions: { threshold: 7123456 } }, { type: 'n8n-nodes-base.if' }), n('Switch', { rules: [1] }, { type: 'n8n-nodes-base.switch' })]);
  const b = clone(a); b.nodes[0].parameters.conditions.threshold=9876543; b.nodes[1].parameters.rules=[2];
  const r = analyze(a,b), checks = r.checks.filter(c=>c.id.startsWith('branch-boundaries:'));
  assert.equal(checks.length,2); assert.equal(new Set(r.checks.map(c=>c.id)).size,r.checks.length);
  assert.ok(checks.every(c=>c.nodeNames.length===1 && /below, equal to and just above both/.test(c.detail)));
  assert.ok(!JSON.stringify(r).includes('7123456')); assert.ok(!JSON.stringify(r).includes('9876543'));
});
test('HTTP target changes get endpoint and side-effect review; body-only gets contract review', () => {
  const a = w([n('HTTP', { url: 'https://private.example', method: 'GET', body: 'old' }, { type: 'n8n-nodes-base.httpRequest' })]);
  const b = clone(a); b.nodes[0].parameters.method='POST';
  const r=analyze(a,b); assert.ok(r.checks.some(c=>c.id.startsWith('http-target:'))); assert.ok(r.checks.some(c=>c.id.startsWith('http-contract:'))); assert.ok(!JSON.stringify(r).includes('private.example'));
  const c=clone(a); c.nodes[0].parameters.body='new'; assert.ok(!analyze(a,c).checks.some(c=>c.id.startsWith('http-target:')));
});
test('Code checks compare fixtures without executing imported code', () => {
  const a=w([n('Code',{jsCode:'throw new Error("PRIVATE_CODE")'},{type:'n8n-nodes-base.code'})]); const b=clone(a); b.nodes[0].parameters.jsCode='globalThis.__flowdeltaExecuted = true';
  const r=analyze(a,b); assert.equal(globalThis.__flowdeltaExecuted,undefined); assert.ok(r.checks.some(c=>c.id.startsWith('code-fixtures:'))); assert.ok(r.warnings.some(w=>w.includes('Code nodes'))); assert.ok(!JSON.stringify(r).includes('PRIVATE_CODE'));
});
test('error settings get a controlled failure check, unrelated parameters do not', () => {
  const a=w([n('A',{}, { retryOnFail: false })]); const b=clone(a); b.nodes[0].retryOnFail=true;
  assert.ok(analyze(a,b).checks.some(c=>c.id.startsWith('failure-path:')));
  const c=clone(a); c.nodes[0].parameters.foo=true; assert.ok(!analyze(a,c).checks.some(c=>c.id.startsWith('failure-path:')));
});
test('Merge socket reconnection checks both populated and missing inputs', () => {
  const a=w([n('A'),n('Merge',{}, {type:'n8n-nodes-base.merge'})], { A: { main: [[edge('Merge','main',0)]] } }); const b=clone(a); b.connections.A.main[0][0].index=1;
  const r=analyze(a,b); const check=r.checks.find(c=>c.id.startsWith('merge-inputs:')); assert.ok(check); assert.match(check.detail,/each input missing or empty/); assert.deepEqual(check.nodeNames,['Merge']);
});
test('activation-only change is reported and impacts all nodes', () => {
  const a=w([n('A')],{}, {active:false}); const b=clone(a); b.active=true;
  const r=analyze(a,b); assert.deepEqual(r.changes[0],{kind:'metadata',nodeId:'',nodeName:'Workflow activation',fields:['active']}); assert.equal(r.summary.impacted,1); assert.equal(r.summary.changed,0); assert.ok(r.checks.some(c=>c.id==='activation'));
  assert.throws(()=>parseWorkflow(w([],{}, {active:'yes'})));
});
test('uncertainty warnings only name dependency categories actually present', () => {
  assert.equal(analyze(w([n('A')]),w([n('A')])).warnings.length,1);
  const literal=w([n('A'),n('B',{x:'={{ $("A").item.json.x }}'})]); assert.equal(analyze(literal,literal).warnings.length,1);
  const dynamic=w([n('A',{x:'={{ $( $json.nodeName ).item.json.x }}'})]); assert.ok(analyze(dynamic,dynamic).warnings.some(w=>w.includes('Dynamic node-name')));
  const sub=w([n('Call',{}, {type:'n8n-nodes-base.executeWorkflow'})]); assert.ok(analyze(sub,sub).warnings.some(w=>w.includes('Sub-workflow')));
});
