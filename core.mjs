/* FlowDelta — Copyright 2026 blucca. All rights reserved. */
const semanticFields = ['parameters', 'type', 'typeVersion', 'webhookId', 'disabled', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'onError', 'continueOnFail', 'alwaysOutputData', 'executeOnce', 'credentials'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function parseWorkflow(input) {
  let workflow = input;
  if (typeof input === 'string') {
    try { workflow = JSON.parse(input); } catch { throw new Error('Invalid JSON. Export one n8n workflow as JSON.'); }
  }
  if (Array.isArray(workflow)) {
    if (workflow.length !== 1) throw new Error('Provide exactly one workflow per file.');
    workflow = workflow[0];
  }
  if (!object(workflow) || !Array.isArray(workflow.nodes) || !object(workflow.connections)) throw new Error('Workflow must contain a nodes array and a connections object.');
  const names = new Set(), ids = new Set();
  for (const node of workflow.nodes) {
    if (!object(node) || typeof node.name !== 'string' || !node.name.trim()) throw new Error('Every node must have a nonempty name.');
    if (names.has(node.name)) throw new Error('Duplicate node names make comparison ambiguous.');
    names.add(node.name);
    if (node.id !== undefined && node.id !== null && node.id !== '') {
      if (typeof node.id !== 'string') throw new Error('Node IDs must be strings.');
      if (ids.has(node.id)) throw new Error('Duplicate node IDs make comparison ambiguous.');
      ids.add(node.id);
    }
  }
  for (const channels of Object.values(workflow.connections)) {
    if (!object(channels)) throw new Error('Invalid connections: expected connection channels.');
    for (const outputs of Object.values(channels)) {
      if (!Array.isArray(outputs)) throw new Error('Invalid connections: expected output arrays.');
      for (const edges of outputs) {
        if (!Array.isArray(edges)) throw new Error('Invalid connections: expected an edge array per output.');
        for (const edge of edges) {
          if (!object(edge) || typeof edge.node !== 'string' || typeof edge.type !== 'string' || !Number.isInteger(edge.index) || edge.index < 0) throw new Error('Invalid connection endpoint.');
        }
      }
    }
  }
  if (workflow.active !== undefined && typeof workflow.active !== 'boolean') throw new Error('Workflow active flag must be a boolean.');
  if (workflow.settings !== undefined && !object(workflow.settings)) throw new Error('Workflow settings must be an object.');
  return workflow;
}

function recordChange(a, b, path, result, details) {
  result.push(path);
  if (details) details.push({ path, before: { present: a !== undefined, ...(a !== undefined ? { value: a } : {}) }, after: { present: b !== undefined, ...(b !== undefined ? { value: b } : {}) } });
}

function changedPaths(a, b, path, result, details) {
  if (Object.is(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) recordChange(a.length, b.length, `${path}.length`, result, details);
    for (let i = 0; i < Math.max(a.length, b.length); i++) changedPaths(a[i], b[i], `${path}[${i}]`, result, details);
  } else if (object(a) && object(b)) {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const next = `${path}[${JSON.stringify(key)}]`;
      if (!own(a, key) || !own(b, key)) recordChange(a[key], b[key], next, result, details);
      else changedPaths(a[key], b[key], next, result, details);
    }
  } else recordChange(a, b, path, result, details);
}

function expressionReferences(value, refs = new Set()) {
  if (typeof value === 'string' && value.includes('{{')) {
    // Literal names only. Dynamic references and runtime code are deliberately not evaluated.
    const pattern = /\$\(\s*(['"])((?:\\.|(?!\1)[^\\])*?)\1\s*\)|\$node\s*\[\s*(['"])((?:\\.|(?!\3)[^\\])*?)\3\s*\]/g;
    for (const match of value.matchAll(pattern)) refs.add((match[2] ?? match[4]).replace(/\\(['"\\])/g, '$1'));
  } else if (value && typeof value === 'object') for (const entry of Object.values(value)) expressionReferences(entry, refs);
  return refs;
}

function conditionOperators(value, operators = []) {
  if (!value || typeof value !== 'object') return operators;
  if (object(value.operator) && typeof value.operator.type === 'string') operators.push(value.operator.type);
  for (const [key, child] of Object.entries(value)) if (key !== 'operator') conditionOperators(child, operators);
  return operators;
}

export function analyze(beforeInput, afterInput, { includeValues = false } = {}) {
  const before = parseWorkflow(beforeInput), after = parseWorkflow(afterInput);
  const warnings = ['Potential impact is a static estimate across both workflow versions, not execution validation. Scope: node parameters, type/version, webhook identifiers, credentials, execution flags, connections, workflow settings and activation; other metadata is ignored.'];
  const beforeKeys = new Map(), afterKeys = new Map(), pairs = [], taken = new Set();
  const afterById = new Map(after.nodes.filter(n => n.id).map(n => [n.id, n]));
  const afterByName = new Map(after.nodes.map(n => [n.name, n]));
  // Reserve stable-ID matches before allowing fallback name matches.
  for (const node of before.nodes) {
    const next = node.id ? afterById.get(node.id) : undefined;
    if (next) { pairs.push([node, next]); taken.add(next); }
  }
  const matchedBefore = new Set(pairs.map(([n]) => n));
  for (const node of before.nodes) {
    if (matchedBefore.has(node)) continue;
    const candidate = afterByName.get(node.name);
    const next = candidate && !taken.has(candidate) && (!node.id || !candidate.id) ? candidate : undefined;
    pairs.push([node, next]); if (next) taken.add(next);
  }
  for (const node of after.nodes) if (!taken.has(node)) pairs.push([undefined, node]);
  const labels = new Map();
  pairs.forEach(([a, b], i) => {
    const key = `node:${i}`, node = b || a;
    if (a) beforeKeys.set(a.name, key);
    if (b) afterKeys.set(b.name, key);
    labels.set(key, { nodeId: node.id || node.name, nodeName: node.name });
  });
  const changes = [], seeds = new Map(), changesByKey = new Map();
  function seed(key, reason) { if (!seeds.has(key)) seeds.set(key, new Set()); seeds.get(key).add(reason); }
  pairs.forEach(([a, b], i) => {
    const key = `node:${i}`, fields = [], details = includeValues ? [] : undefined;
    let kind;
    if (!a) kind = 'added';
    else if (!b) kind = 'removed';
    else {
      if (a.name !== b.name) recordChange(a.name, b.name, 'name', fields, details);
      for (const field of semanticFields) changedPaths(a[field], b[field], field, fields, field === 'credentials' ? undefined : details);
      if (fields.length) kind = 'changed';
    }
    if (details && (!a || !b)) for (const field of semanticFields.filter(field => field !== 'credentials')) changedPaths(a?.[field], b?.[field], field, [], details);
    if (kind) { const change = { kind, ...labels.get(key), fields, ...(details ? { details } : {}) }; changes.push(change); changesByKey.set(key, change); seed(key, `Node ${kind}`); }
  });
  const settingPaths = [], settingDetails = includeValues ? [] : undefined;
  changedPaths(before.settings || {}, after.settings || {}, 'settings', settingPaths, settingDetails);
  if (settingPaths.length) {
    changes.push({ kind: 'settings', nodeId: '', nodeName: 'Workflow settings', fields: settingPaths, ...(settingDetails ? { details: settingDetails } : {}) });
    for (const key of labels.keys()) seed(key, 'Workflow settings changed');
  }
  const activationChanged = before.active !== after.active;
  if (activationChanged) {
    const details = includeValues ? [] : undefined;
    if (details) recordChange(before.active, after.active, 'active', [], details);
    changes.push({ kind: 'metadata', nodeId: '', nodeName: 'Workflow activation', fields: ['active'], ...(details ? { details } : {}) });
    for (const key of labels.keys()) seed(key, 'Workflow activation changed');
  }
  const graph = new Map([...labels.keys()].map(key => [key, new Set()]));
  let unresolved = false;
  function edges(workflow, names) {
    const result = new Map();
    for (const [source, channels] of Object.entries(workflow.connections)) for (const [channel, outputs] of Object.entries(channels)) outputs.forEach((entries, output) => {
      for (const edge of entries) {
        const from = names.get(source), to = names.get(edge.node);
        if (!from || !to) unresolved = true;
        else {
          graph.get(from).add(to);
          // AI sockets are dependencies into their owner even when execution semantics differ.
        }
        const id = JSON.stringify([from || `missing:${source}`, to || `missing:${edge.node}`, channel, edge.type, output, edge.index]);
        result.set(id, { public: { source, target: edge.node, type: channel === edge.type ? channel : `${channel} → ${edge.type}`, output, input: edge.index }, from, to });
      }
    });
    for (const node of workflow.nodes) for (const ref of expressionReferences(node.parameters)) {
      if (names.has(ref)) graph.get(names.get(ref)).add(names.get(node.name));
      else unresolved = true;
    }
    return result;
  }
  const oldEdges = edges(before, beforeKeys), newEdges = edges(after, afterKeys);
  const connections = { added: [], removed: [] };
  for (const [kind, first, second] of [['added', newEdges, oldEdges], ['removed', oldEdges, newEdges]]) for (const [key, edge] of first) if (!second.has(key)) {
    connections[kind].push(edge.public);
    // Rewiring directly affects the destination, not unrelated siblings of its source.
    if (edge.to) seed(edge.to, `Incoming connection ${kind}`);
  }
  if (unresolved) warnings.push('Some connection endpoints or literal expression references could not be resolved to a node. Impact may be incomplete.');
  const impacts = new Map([...seeds].map(([key, reasons]) => [key, new Set(reasons)]));
  const queue = [...seeds.keys()];
  for (let i = 0; i < queue.length; i++) for (const next of graph.get(queue[i]) || []) {
    if (!impacts.has(next)) { impacts.set(next, new Set(['Downstream of a changed node or connection'])); queue.push(next); }
  }
  const impacted = [...impacts].map(([key, reasons]) => ({ ...labels.get(key), reasons: [...reasons] }));
  const checks = [];
  const touchedEdges = [...connections.added, ...connections.removed];
  function addCheck(id, title, detail, nodeNames = []) { checks.push({ id, title, detail, nodeNames }); }
  let hasCode = false, hasSubworkflow = false, hasDynamic = false;
  function scanDynamic(value) {
    if (typeof value === 'string' && value.includes('{{')) {
      const stripped = value.replace(/\$\(\s*(['"])(?:\\.|(?!\1)[^\\])*?\1\s*\)|\$node\s*\[\s*(['"])(?:\\.|(?!\2)[^\\])*?\2\s*\]/g, '');
      if (/\$\s*\(|\$node\s*\[/.test(stripped)) hasDynamic = true;
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) scanDynamic(child);
  }
  for (const workflow of [before, after]) for (const node of workflow.nodes) {
    const type = String(node.type || '').split('.').pop().toLowerCase();
    if (['code', 'function', 'functionitem'].includes(type)) hasCode = true;
    if (type === 'executeworkflow') hasSubworkflow = true;
    scanDynamic(node.parameters);
  }
  if (hasCode) warnings.push('Code nodes are present. Code is not executed or analyzed for hidden dependencies or side effects.');
  if (hasSubworkflow) warnings.push('Sub-workflow calls are present. Called workflows are outside these two exports and their internal dependencies are not inspected.');
  if (hasDynamic) warnings.push('Dynamic node-name references are present. Only literal $("Name") and $node["Name"] references can be resolved statically.');
  pairs.forEach(([a, b], index) => {
    const node = b || a, name = node.name, key = `node:${index}`;
    const change = changesByKey.get(key);
    const fields = change?.fields || [];
    const isNew = change?.kind === 'added';
    const types = [a?.type, b?.type].filter(Boolean).map(type => String(type).split('.').pop().toLowerCase());
    const isType = (...values) => types.some(type => values.includes(type));
    const params = isNew || fields.some(path => path.startsWith('parameters'));
    const runtime = isNew || fields.includes('type') || fields.includes('typeVersion');
    const connected = touchedEdges.some(edge => edge.target === a?.name || edge.target === b?.name);
    const check = (suffix, title, detail) => addCheck(`${suffix}:${index}`, title, detail, [name]);
    if (change?.kind === 'removed') {
      check('removed', 'Confirm removed step and references', 'Confirm the removed processing and side effects are intentional. Check remaining expressions and code for stale references, then exercise each former downstream branch.');
      return;
    }
    if (isNew) check('added', 'Exercise new node with representative input', 'Check output item count, field shape, empty input and intended side effects before enabling the new step.');
    let specialized = false;
    if ((params || runtime) && isType('if', 'switch')) {
      specialized = true;
      const operators = [...conditionOperators(a?.parameters), ...conditionOperators(b?.parameters)];
      if (operators.length && operators.every(type => type === 'string')) check('branch-cases', 'Test matching, non-matching and missing values', 'For each changed string condition, test values that match the previous rule, match the new rule, match neither, and are missing/null. Check case sensitivity, type handling and whether the referenced input field is present. Confirm the selected output branch, fallback behavior and downstream item counts.');
      else check('branch-boundaries', 'Test old and new decision boundaries', 'For each changed condition, use inputs just below, equal to and just above both the old and new threshold where ordered comparisons apply. Also test missing/null values and type coercion. Confirm the selected output branch, fallback behavior and downstream item counts.');
    }
    if ((params || runtime) && isType('httprequest')) {
      specialized = true;
      const target = runtime || fields.some(path => /^parameters\["(?:url|method)"\]/.test(path));
      if (target) check('http-target', 'Confirm HTTP destination and side effects', 'Inspect the old and new URL and method locally. Confirm the intended environment, endpoint, authentication scope and whether the request writes data. Use a controlled fixture or test endpoint; verify that retries cannot duplicate unintended side effects.');
      check('http-contract', 'Compare HTTP request and response contracts', 'Using a controlled response fixture, verify request headers, query/body encoding, success response shape, pagination if configured, and handling of non-success status codes. Do not send production requests solely to generate this report.');
    }
    if ((params || runtime) && isType('code', 'function', 'functionitem')) {
      specialized = true;
      check('code-fixtures', 'Compare code with identical fixtures', 'Run old and new code separately in your controlled test environment with identical normal, empty and malformed input fixtures. Compare output item count, JSON shape, item pairing and errors. This tool does not execute imported code.');
    }
    if ((params || runtime || connected) && isType('merge')) {
      specialized = true;
      check('merge-inputs', 'Exercise Merge with both and missing inputs', 'Test both inputs populated, each input missing or empty in turn, and unmatched/duplicate keys where relevant. Compare output count, paired fields and conflict resolution under the selected merge mode; confirm rewired input socket indices.');
    }
    if (params && !specialized) check('parameters', 'Verify modified parameter behavior', 'Use identical representative and empty/malformed input fixtures with both configurations. Compare output shape, item count and side effects for the reported parameter paths; inspect exact values locally.');
    if (fields.some(path => path.startsWith('credentials'))) check('credentials', 'Verify selected credential access', 'Confirm the selected credential resolves in the target environment, belongs to the intended account and has the required permissions. Use a controlled authentication check without exposing credential contents.');
    if (fields.includes('webhookId')) check('webhook-id', 'Verify trigger URLs and callback routing', 'Confirm the changed webhook identifier in the target environment. For form/webhook triggers, check generated URLs, registration and incoming links; for other nodes, check whether the identifier is used for callbacks or waiting executions. Send a representative event and verify it reaches the intended workflow. A configured path may override the identifier.');
    if (fields.some(path => ['retryOnFail', 'maxTries', 'waitBetweenTries', 'onError', 'continueOnFail'].includes(path))) check('failure-path', 'Force a controlled failure', 'Use a fixture that fails predictably. Verify retry count and delay, final error routing, whether downstream nodes continue, and whether repeated attempts duplicate side effects. Also confirm the normal success path remains unchanged.');
    if (fields.some(path => ['disabled', 'alwaysOutputData', 'executeOnce'].includes(path))) check('execution-flags', 'Check empty and multiple-item execution', 'Test empty input, one item and multiple items. Verify whether the node runs or is bypassed, output item count and downstream behavior under the changed execution flags.');
    if (runtime && !isNew) check('node-version', 'Check node type and version compatibility', 'Run the same fixtures against the old and new node type/version. Confirm parameter interpretation, output schema and error behavior in the target n8n version.');
    if (fields.includes('name')) check('rename', 'Review renamed-node references', 'Check expressions, code and external references for stale node names, then exercise dependent nodes. Stable-ID connection matching alone does not validate expression resolution.');
    if (connected) check('connections', 'Exercise changed incoming connections', 'Send a representative item through each changed output branch and target input socket. Confirm which items arrive, output counts and error routes; inspect AI dependency sockets where applicable.');
  });
  if (settingPaths.length) addCheck('settings', 'Review workflow settings', 'Verify each changed workflow setting in the target environment and test affected scheduling, execution or error behavior before activation.');
  if (activationChanged) addCheck('activation', 'Confirm workflow activation intent', 'Inspect the activation state in both exports and confirm the desired deployed state. Verify trigger registration and scheduling behavior in the target environment; importing JSON alone does not prove a workflow is active.');
  if (impacted.length) addCheck('impact', 'Inspect potentially affected outputs', 'Run representative fixtures in a suitable test environment and inspect downstream results. This report does not execute or validate the workflow.', impacted.map(node => node.nodeName));
  return { beforeName: typeof before.name === 'string' ? before.name : 'Before workflow', afterName: typeof after.name === 'string' ? after.name : 'After workflow', summary: { added: changes.filter(c => c.kind === 'added').length, removed: changes.filter(c => c.kind === 'removed').length, changed: changes.filter(c => c.kind === 'changed').length, connectionsAdded: connections.added.length, connectionsRemoved: connections.removed.length, impacted: impacted.length }, changes, connections, impacted, checks, warnings };
}
