import copy, json, re, subprocess
from browser_support import PRODUCT_ROOT, WORKSPACE, artifact_dir, download_markdown, launch_browser, pdf_text, serve_product
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
OUT=artifact_dir('editable')
core_run=subprocess.run(['node','--test','--test-reporter=tap',*map(str,(PRODUCT_ROOT/'tests').glob('*.test.mjs'))],capture_output=True,text=True,check=True)
core_passed=int(re.search(r'^# pass (\d+)$',core_run.stdout,re.M).group(1))
checks=[]
def ok(name,condition,detail=''):
 checks.append({'test':name,'pass':bool(condition),'detail':detail});print(('PASS ' if condition else 'FAIL ')+name,flush=True); assert condition, name+' '+detail
def md(page,label):
 return download_markdown(page,OUT,label)
def pdf(page,label):
 return pdf_text(page,OUT,label)
def build(page,a,b):
 page.locator('#before').fill(json.dumps(a));page.locator('#after').fill(json.dumps(b));page.locator('#compare').click();page.locator('#report').wait_for(state='visible')
a={'name':'Before','nodes':[{'id':'code','name':'Compute, Action','type':'n8n-nodes-base.code','typeVersion':2,'parameters':{'jsCode':'return [{json: {marker:"PRIVATEBEFORE"}}];'},'credentials':{'test':{'id':'SECRETID','name':'SECRETNAME'}}}], 'connections':{},'pinData':{'Compute, Action':[{'json':{'secret':'PINSECRET'}}]}}
b=copy.deepcopy(a);b['name']='After';b['nodes'][0]['parameters']['jsCode']='return [{json: {marker:"PRIVATEAFTER"}}];'
errors=[];console_errors=[]
try:
 with serve_product() as base_url, sync_playwright() as p:
  browser=launch_browser(p)
  page=browser.new_page(viewport={'width':1280,'height':900});page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:console_errors.append(e.text) if e.type=='error' else None)
  page.goto(base_url,wait_until='networkidle');build(page,a,b)
  cards=page.locator('#checks .check');initial=cards.count();first=cards.first
  ok('Generated checks expose separate title, plan, nodes and observations', initial>0 and all(first.locator(f'[data-field="{f}"]').count()==1 for f in ['title','detail','nodeNames','observations']))
  ok('Node names containing commas remain a single editable node',first.locator('[data-field="nodeNames"]').input_value()=='Compute, Action')
  title='Verify AR pause at day 7';plan='Input: overdue day 7, ar_pause=true.\nSteps: run the pause gate and Compute Action with the same fixture.\nExpected: no reminder; day 7 unpaused control sends one reminder.'
  first.locator('[data-field="title"]').fill(title);first.locator('[data-field="detail"]').fill(plan);first.locator('[data-field="nodeNames"]').fill('Pause, gate\nCompute Action')
  ok('All generated plan fields are editable without creating an outcome',first.locator('[data-field="title"]').input_value()==title and first.locator('h4').inner_text()=='1. '+title and first.locator('select').input_value()=='not run' and first.locator('[data-field="observations"]').input_value()=='')
  page.locator('.change textarea').first.fill('Pause gate is a required customer condition.');page.locator('.value-details summary').first.click();page.locator('.share-values input').first.check()
  notes='Run old-17: zero reminders; screenshot evidence-old-17.';first.locator('[data-field="observations"]').fill(notes);first.locator('select').select_option('pass');first.locator('[data-field="title"]').fill(title+' revised')
  ok('Editing a passed title resets status and retains marked previous observations',first.locator('select').input_value()=='not run' and first.locator('[data-field="observations"]').input_value()==notes and first.locator('.check-review').is_visible() and 'Previous observations' in first.locator('.check-note').last.inner_text() and page.locator('#check-progress').inner_text().startswith('0 pass'))
  first.locator('[data-field="observations"]').press('End');first.locator('[data-field="observations"]').press_sequentially(' Retained comment.')
  ok('Typing observations keeps the plan-revision review marker until re-confirmed',first.locator('.check-review').is_visible())
  first.locator('select').select_option('fail');ok('Explicitly recording a revised outcome clears the prior-evidence marker',first.locator('.check-review').is_hidden() and 'Previous observations' not in first.locator('.check-note').last.inner_text())
  revised_plan=plan+'\nReview: assert both gate and action paths.';first.locator('[data-field="detail"]').fill(revised_plan)
  ok('Editing a failed plan resets to Not run and keeps every observation',first.locator('select').input_value()=='not run' and first.locator('[data-field="observations"]').input_value()==notes+' Retained comment.')
  first.locator('select').select_option('pass');first.locator('[data-field="nodeNames"]').fill('Pause, gate\nCompute Action\nDelivery log')
  ok('Changing affected nodes also invalidates the prior outcome',first.locator('select').input_value()=='not run' and first.locator('.check-review').is_visible())
  page.locator('#add-check').click();custom=cards.last
  ok('Add business check starts Not run with no observations and focused title',cards.count()==initial+1 and custom.locator('select').input_value()=='not run' and custom.locator('[data-field="observations"]').input_value()=='' and custom.locator('[data-field="title"]').evaluate('(n)=>n===document.activeElement'))
  custom.locator('[data-field="title"]').fill('Business replay positive control');custom.locator('[data-field="detail"]').fill('Input: day 7, ar_pause=false.\nStep: run the fixture.\nExpected: exactly one reminder.');custom.locator('[data-field="nodeNames"]').fill('Send reminder');custom.locator('[data-field="observations"]').fill('Run control-18: one reminder.');custom.locator('select').select_option('pass')
  ok('Adding a check preserves plan edits, stale observations, explanations and opt-in',first.locator('[data-field="detail"]').input_value()==revised_plan and first.locator('.check-review').is_visible() and page.locator('.change textarea').first.input_value()=='Pause gate is a required customer condition.' and page.locator('.share-values input').first.is_checked() and page.locator('.value-details').first.get_attribute('open') is not None)
  page.locator('#add-check').click();cards.last.locator('[data-field="title"]').fill('Temporary removable check');cards.last.locator('.remove-check').click()
  ok('Removing a custom check preserves other check outcomes and inputs',cards.count()==initial+1 and cards.last.locator('select').input_value()=='pass' and cards.last.locator('[data-field="observations"]').input_value()=='Run control-18: one reminder.' and 'Temporary removable check' not in page.locator('#checks').inner_text())
  selected_md=md(page,'edited-selected');selected_pdf=pdf(page,'edited-selected')
  for kind,text in [('Markdown',selected_md.replace('\\_', '_')),('PDF',selected_pdf)]:
   ok(kind+' exports edited generated and custom plans',all(x in text for x in ['Verify AR pause at day 7 revised','Input: overdue day 7','assert both gate and action paths','Business replay positive control','day 7, ar_pause=false','Pause, gate','Delivery log']))
   ok(kind+' distinguishes retained evidence and current results','Previous observations / evidence' in text and 'review required' in text and 'evidence-old-17' in text and 'Run control-18' in text)
   ok(kind+' keeps explicit raw opt-in and omits credentials/pinData','PRIVATEBEFORE' in text and 'PRIVATEAFTER' in text and all(x not in text for x in ['SECRETID','SECRETNAME','PINSECRET']))
  ok('PDF prints each edited title and plan once',selected_pdf.count('Verify AR pause at day 7 revised')==1 and selected_pdf.count('Input: overdue day 7')==1 and selected_pdf.count('Business replay positive control')==1)
  page.evaluate("window.dispatchEvent(new Event('beforeprint'))");first_count=page.locator('.print-value').count();page.evaluate("window.dispatchEvent(new Event('beforeprint'))");ok('Repeated print preparation creates no duplicate copies',first_count>0 and page.locator('.print-value').count()==first_count);page.evaluate("window.dispatchEvent(new Event('afterprint'))");ok('Print cleanup restores editing without leftover copies',page.locator('.print-value').count()==0 and first.locator('[data-field="detail"]').input_value()==revised_plan)
  page.locator('.share-values input').first.uncheck();default_md=md(page,'edited-default');default_pdf=pdf(page,'edited-default');ok('Editing acceptance plans never turns on raw-value exports',all(x not in default_md+default_pdf for x in ['PRIVATEBEFORE','PRIVATEAFTER','SECRETID','PINSECRET']) and title in default_md+default_pdf)
  first.locator('.remove-check').click();ok('Removing a generated check keeps remaining custom state aligned',cards.count()==initial and cards.last.locator('[data-field="title"]').input_value()=='Business replay positive control' and cards.last.locator('select').input_value()=='pass')
  removed=md(page,'removed');ok('Removed check and its old observations disappear from the export','Verify AR pause' not in removed and 'evidence-old-17' not in removed and 'Business replay positive control' in removed)
  for width in [390,320]:
   page.set_viewport_size({'width':width,'height':844});cards.last.locator('[data-field="title"]').fill('LongTitle'+('x'*290));cards.last.locator('[data-field="detail"]').fill('long-plan-'+('y'*800));cards.last.locator('[data-field="nodeNames"]').fill('long-node-'+('z'*800));
   ok(f'{width}px edited long fields fit without horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth'))
  page.set_viewport_size({'width':390,'height':844});cards.last.screenshot(path=str(OUT/'editable-mobile.png'))
  page.locator('#compare').click();page.locator('#report').wait_for(state='visible');ok('Rebuilding same inputs clears custom checks, edits, outcomes and observations',cards.count()==initial and all(v=='not run' for v in cards.locator('select').evaluate_all('(a)=>a.map(x=>x.value)')) and all(v=='' for v in cards.locator('[data-field="observations"]').evaluate_all('(a)=>a.map(x=>x.value)')) and 'LongTitle' not in page.locator('#checks').inner_text())
  page.locator('#add-check').click();cards.last.locator('[data-field="title"]').fill('Must not cross versions');cards.last.locator('[data-field="observations"]').fill('OLD VERSION EVIDENCE');cards.last.locator('select').select_option('pass');page.locator('#before').fill(json.dumps(a)+' ')
  ok('Editing workflow inputs immediately invalidates the report',page.locator('#report').is_hidden());page.locator('#compare').click();page.locator('#report').wait_for(state='visible');rebuilt=md(page,'rebuilt');ok('Input rebuild does not leak custom checks or old version evidence','Must not cross versions' not in rebuilt and 'OLD VERSION EVIDENCE' not in rebuilt and cards.count()==initial)
  page.locator('#add-check').click();cards.last.locator('[data-field="title"]').fill('Before uploaded replacement');payload=json.dumps(a).encode();page.locator('#before-file').set_input_files({'name':'uploaded-before.json','mimeType':'application/json','buffer':payload});page.wait_for_function("document.querySelector('#before-meta').textContent.includes('uploaded-before.json')");ok('File replacement invalidates the report too',page.locator('#report').is_hidden());page.locator('#compare').click();page.locator('#report').wait_for(state='visible');ok('File rebuild drops custom check state','Before uploaded replacement' not in md(page,'file-rebuilt') and cards.count()==initial)
  build(page,a,a);ok('Unchanged inputs can start with an empty acceptance plan',cards.count()==0);page.locator('#add-check').click();empty=md(page,'blank');empty_pdf=pdf(page,'blank');ok('New empty business check exports explicit missing plan and workflow-wide scope','Not specified' in empty+empty_pdf and 'Workflow-wide' in empty and 'Workflow-wide' in empty_pdf and cards.first.locator('select').input_value()=='not run');cards.first.locator('.remove-check').click();ok('Removing the last check shows empty state and zero progress',cards.count()==0 and page.locator('#check-progress').inner_text()=='0 pass · 0 fail · 0 not run' and page.locator('#add-check').evaluate('(n)=>n===document.activeElement'))
  empty=md(page,'no-checks');ok('Empty plan export states that no checks were recorded','No acceptance checks recorded.' in empty)
  page.goto(base_url+'?demo=swiftia',wait_until='networkidle');page.locator('#report').wait_for(state='visible');ok('Swiftia still has six Not run checks with editable case-specific retry plan',cards.count()==6 and cards.last.locator('[data-field="title"]').input_value()=='Check the failed-render retry loop' and page.locator('#check-progress').inner_text()=='0 pass · 0 fail · 6 not run');page.locator('#add-check').click();cards.last.locator('[data-field="title"]').fill('Swiftia business addition');page.locator('#demo').click();page.wait_for_function("document.querySelector('#project').value==='Demo · inbound lead routing'");ok('Switching demos clears custom checks and case-specific plans',cards.count()==5 and 'Swiftia business addition' not in md(page,'lead-switch'))
  ok('No uncaught JavaScript errors or browser console errors',not errors and not console_errors,str(errors+console_errors));browser.close()
finally:
 report={'timestamp_utc':datetime.now(timezone.utc).isoformat(),'scope':'Editable acceptance plans: browser app only; no live n8n/service execution','core_tests':{'passed':core_passed,'failed':0},'browser':{'engine':'Chromium / Playwright','passed':sum(c['pass'] for c in checks),'failed':sum(not c['pass'] for c in checks),'checks':checks,'js_errors':errors,'console_errors':console_errors},'test_source':'tests/browser/editable-acceptance-test.py','temporary_artifacts':str(OUT.relative_to(WORKSPACE))}
 (OUT/'checks.json').write_text(json.dumps(report,indent=2)+'\n')
