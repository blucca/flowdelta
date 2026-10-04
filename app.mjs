import { analyze } from './core.mjs';
const $ = id => document.getElementById(id);
const LIMIT = 5 * 1024 * 1024;
let result = null, acceptance = [], explanations = [], demoLoaded = false;
const revisions = {before: 0, after: 0};
const el = (tag, text, cls) => { const n = document.createElement(tag); if(text !== undefined) n.textContent = text; if(cls) n.className = cls; return n; };
function invalidate() { if(demoLoaded) { $('project').value = ''; $('goal').value = ''; $('owner').value = ''; } result = null; acceptance = []; explanations = []; $('report').hidden = true; $('error').hidden = true; demoLoaded = false; $('status').textContent = 'Inputs changed. Build a new report to review this version.'; }
function fail(message) { $('error').textContent = message; $('error').hidden = false; }
for (const side of ['before', 'after']) {
  $(side).addEventListener('input', () => { revisions[side]++; invalidate(); $(side + '-meta').textContent = 'Pasted JSON · stays on this device'; });
  $(side + '-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if(!file) return;
    invalidate(); const revision = ++revisions[side];
    $(side).value = ''; $(side + '-meta').textContent = 'Reading file…';
    try {
      if(file.size > LIMIT) throw new Error('File exceeds the 5 MB limit. Export a smaller workflow.');
      const content = await file.text(); if(revision !== revisions[side]) return;
      $(side).value = content; $(side + '-meta').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · local only`;
    } catch(error) { if(revision === revisions[side]) { fail(`${side === 'before' ? 'Previous' : 'New'} version: ${error.message}`); $(side + '-meta').textContent = 'File could not be loaded.'; } }
    event.target.value = '';
  });
}
function parse(side) {
  const text = $(side).value, label = side === 'before' ? 'Previous version' : 'New version';
  if(!text.trim()) throw new Error(`${label}: paste JSON or choose an n8n workflow export.`);
  if(new TextEncoder().encode(text).length > LIMIT) throw new Error(`${label}: JSON exceeds the 5 MB limit.`);
  try { return JSON.parse(text); } catch { throw new Error(`${label}: invalid JSON. Use a complete workflow export, including its opening and closing braces.`); }
}
function render() {
  $('version-names').textContent = `${result.beforeName} → ${result.afterName}`;
  $('summary').replaceChildren(...Object.entries({added:'Nodes added',removed:'Nodes removed',changed:'Nodes changed',connectionsAdded:'Links added',connectionsRemoved:'Links removed',impacted:'Potentially impacted'}).map(([key,label]) => {const box = el('div',undefined,'stat');box.append(el('strong',String(result.summary[key] ?? 0)),el('span',label));return box;}));
  $('warnings').replaceChildren(...result.warnings.map(text => el('p',text)));
  $('changes').replaceChildren();
  result.changes.forEach((change,index) => {
    const card = el('div',undefined,'change'), heading = el('div',undefined,'change-heading');
    heading.append(el('span',change.kind,`badge ${change.kind}`),el('strong',change.nodeName || 'Workflow')); card.append(heading);
    if(change.fields?.length) card.append(el('p',`Changed fields: ${change.fields.join(', ')}`));
    const label = el('label','Client-facing explanation','check-note');
    const input = el('textarea'); input.rows = 2; input.maxLength = 4000; input.placeholder = 'Explain the business reason and what your client should expect…'; input.value = explanations[index]; input.addEventListener('input', () => explanations[index] = input.value); label.append(input); card.append(label); $('changes').append(card);
  });
  if(!result.changes.length) $('changes').append(el('p','No reportable node or workflow-setting changes.', 'empty'));
  $('connections').replaceChildren();
  for(const kind of ['added','removed']) if(result.connections[kind].length) {
    $('connections').append(el('h4',`Connections ${kind}`,'connection-heading'));
    const list = el('ul',undefined,'connection-list');
    for(const c of result.connections[kind]) list.append(el('li',`${c.source} → ${c.target} (${c.type}, output ${c.output}, input ${c.input})`));
    $('connections').append(list);
  }
  $('impact').replaceChildren(...result.impacted.map(item => {const node = el('div',undefined,'impact-node');node.append(el('strong',item.nodeName),el('p',item.reasons.join(' · ')));return node;}));
  if(!result.impacted.length) $('impact').append(el('p','No downstream nodes identified from the exported connections. Review workflow-level settings separately.','empty'));
  $('checks').replaceChildren();
  result.checks.forEach((check,index) => {
    const box = el('div',undefined,'check'), head = el('div',undefined,'check-head'), select = el('select'); select.setAttribute('aria-label',`${check.title}: result`);
    for(const [value,label] of [['not run','Not run'],['pass','Pass'],['fail','Fail']]) {const option = el('option',label); option.value = value;select.append(option);}
    select.value = acceptance[index].status; select.addEventListener('change',() => {acceptance[index].status = select.value; progress();});
    head.append(el('h4',`${index + 1}. ${check.title}`),select);
    const label = el('label','Observed result / evidence','check-note'), note = el('textarea'); note.maxLength=6000;note.placeholder='Test input, observed outcome, evidence reference…';note.value=acceptance[index].notes;
    note.addEventListener('input',()=> acceptance[index].notes=note.value);label.append(note);
    box.append(head,el('p',check.detail)); if(check.nodeNames?.length) box.append(el('p',`Affected nodes: ${check.nodeNames.join(', ')}`)); box.append(label);$('checks').append(box);
  });
  if(!result.checks.length) $('checks').append(el('p','No change-specific checks generated. Run your standard regression suite before release.','empty'));
  progress(); $('report').hidden = false; $('status').textContent = 'Handoff report ready. Add client-facing explanations and record test outcomes.';
}
function progress() {const counts = {pass:0,fail:0,'not run':0};acceptance.forEach(c=>counts[c.status]++);$('check-progress').textContent=`${counts.pass} pass · ${counts.fail} fail · ${counts['not run']} not run`;}
function build() {
  $('error').hidden=true; result=null; $('report').hidden=true;
  try {
    result=analyze(parse('before'),parse('after'));
    if(demoLoaded) { result.warnings.push('Synthetic demo only. CRM URL and Slack channel are placeholders; configure services and credentials before attempting execution.'); for(const check of result.checks) { if(check.id.startsWith('branch-boundaries:')) check.detail += ' For this demo: compare scores 59, 60, 61, 74, 75 and 76. In the new version, scores below 75 should follow nurture; 75 and above should create a CRM lead.'; if(check.id.startsWith('added:')) check.detail='With a configured test Slack channel, run a qualifying lead and confirm one sales alert arrives after the CRM write succeeds. Verify the message contains no unintended customer data.'; } }
    acceptance=result.checks.map(()=>({status:'not run',notes:''}));
    explanations=result.changes.map(change=>demoLoaded ? demoExplanation(change) : '');
    render();$('report').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) { fail(error.message || 'This workflow could not be compared. Check your n8n export format.'); }
}
function demoExplanation(change) {
  if(change.nodeName==='Qualify lead') return 'Raise the qualification threshold from 60 to 75 so only higher-scoring leads reach the sales notification path.';
  if(change.nodeName==='Notify sales') return 'Notify the sales channel when a lead qualifies. The existing CRM write still runs before the notification.';
  return '';
}
$('compare').addEventListener('click',build);
$('demo').addEventListener('click', async () => {
  $('demo').disabled=true;invalidate();const beforeRevision=++revisions.before,afterRevision=++revisions.after;
  try {
    const values=await Promise.all(['before','after'].map(async side=>{const response=await fetch(`./examples/${side}.json`);if(!response.ok)throw new Error('Demo files could not be loaded. Reload the page and try again.');return response.text();}));
    if(beforeRevision!==revisions.before||afterRevision!==revisions.after)return;
    for(const [index,side] of ['before','after'].entries()) {$(side).value=values[index];$(side+'-meta').textContent='Synthetic lead-routing demo · no customer data';}
    $('project').value='Demo · inbound lead routing';$('goal').value='Focus sales follow-up on higher-scoring leads';$('owner').value='';demoLoaded=true;build();
  } catch(error){fail(error.message);} finally {$('demo').disabled=false;}
});
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]()<>#!|~]/g,'\\$&').replace(/\r/g,'');
function markdown() {
  const s=result.summary;
  const lines=['# Workflow release handoff','',`**Client / project:** ${md($('project').value || 'Not specified')}`,`**Release goal:** ${md($('goal').value || 'Not specified')}`,`**Delivery owner:** ${md($('owner').value || 'Not specified')}`,'',`**Previous version:** ${md(result.beforeName)}`,`**New version:** ${md(result.afterName)}`,'','## Summary','',`${s.added} nodes added · ${s.removed} removed · ${s.changed} changed · ${s.connectionsAdded} connections added · ${s.connectionsRemoved} removed · ${s.impacted} potentially impacted nodes`,'','## Changes',''];
  result.changes.forEach((c,i)=>{lines.push(`### ${md(c.nodeName)} — ${md(c.kind)}`,'',`Changed fields: ${c.fields.length ? c.fields.map(md).join(', ') : 'N/A'}`,`Client-facing explanation: ${md(explanations[i] || 'Not provided — add delivery context before sharing.')}`,'');});
  if(!result.changes.length)lines.push('No reportable node or workflow-setting changes.','');
  lines.push('## Connection changes','');
  for(const kind of ['added','removed']) for(const c of result.connections[kind])lines.push(`- ${kind}: ${md(c.source)} → ${md(c.target)} (${md(c.type)}, output ${md(c.output)}, input ${md(c.input)})`);
  if(!result.connections.added.length&&!result.connections.removed.length)lines.push('No connection changes.');
  lines.push('','## Potential downstream impact','','Static graph reachability; confirm conditional paths and runtime behavior with test data.','');
  result.impacted.forEach(n=>lines.push(`- **${md(n.nodeName)}:** ${n.reasons.map(md).join('; ')}`));
  if(!result.impacted.length)lines.push('No downstream nodes identified from exported connections.');
  lines.push('','## Acceptance plan','','Tests are executed by the delivery team in their n8n environment. The comparison tool does not run tests.','');
  result.checks.forEach((c,i)=>lines.push(`### ${i+1}. ${md(c.title)}`,`**Status:** ${acceptance[i].status.toUpperCase()}`,md(c.detail),`**Affected nodes:** ${c.nodeNames.map(md).join(', ') || 'Workflow-wide'}`,`**Observed result / evidence:** ${md(acceptance[i].notes || 'No observations recorded.')}`,''));
  lines.push('## Analysis limitations','',...result.warnings.map(w=>`- ${md(w)}`),'','## Sharing notes','','This report excludes raw workflow parameters, credential references and pinned data. Node names, field names, version names, explanations and notes may still contain business information. Review before sharing.','','Generated locally with FlowDelta.');
  return lines.join('\n');
}
$('download').addEventListener('click',()=>{if(!result)return;const url=URL.createObjectURL(new Blob([markdown()],{type:'text/markdown;charset=utf-8'}));const a=el('a');a.href=url;a.download='flowdelta-release-handoff.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('print').addEventListener('click',()=>{if(result)window.print();});
window.addEventListener('beforeprint',()=>{document.querySelectorAll('#report input, #report textarea, #report select').forEach(control=>{const copy=el('div',control.tagName==='SELECT' ? control.selectedOptions[0].textContent : (control.value || 'Not provided'),'print-value');control.after(copy);});});
window.addEventListener('afterprint',()=>{document.querySelectorAll('.print-value').forEach(copy=>copy.remove());});
