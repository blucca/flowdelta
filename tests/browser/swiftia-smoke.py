import json
from browser_support import artifact_dir, download_markdown, launch_browser, serve_product
from playwright.sync_api import sync_playwright
T=artifact_dir('swiftia')
checks=[]
def ok(name,cond,detail=''):
 checks.append({'test':name,'pass':bool(cond),'detail':detail});print(('PASS ' if cond else 'FAIL ')+name+' '+detail,flush=True)
 assert cond,name+' '+detail
def md(page,label):
 return download_markdown(page,T,label)
with serve_product() as base_url, sync_playwright() as p:
 browser=launch_browser(p);page=browser.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base_url+'?demo=swiftia',wait_until='networkidle');page.locator('#report').wait_for(state='visible');stats=page.locator('#summary .stat strong').all_text_contents();ok('query auto-load has expected 4 changes / 22 impacted',stats==['0','0','4','0','0','22'],str(stats));ok('six unexecuted checks include one curated retry-loop check',page.locator('#checks .check').count()==6 and page.locator('#checks .check h4').all_text_contents().count('6. Check the failed-render retry loop')==1 and page.locator('#check-progress').inner_text()=='0 pass · 0 fail · 6 not run')
 for summary in page.locator('.value-details summary').all():summary.click()
 ok('four local review panels show generation/render and status migration',page.locator('.value-details').count()==4 and all(x in page.locator('.value-details').all_text_contents()[0] for x in ['VideoShorts','youtubeVideoId','options']) and '={{ $json.status }}' in page.locator('.value-details').all_text_contents()[2])
 default=md(page,'default');ok('real-case default Markdown omits raw value blocks while retaining curated check','Reviewed value:' not in default and 'VideoShorts' not in default and 'current_item_ref' not in default and 'Check the failed-render retry loop' in default and default.count('**Status:** NOT RUN')==6)
 page.locator('.share-values input').first.check();selected=md(page,'selected');ok('real-case opt-in exports selected generation request only',selected.count('**Reviewed value:')==1 and 'VideoShorts' in selected and 'current_item_ref' not in selected and '={{ $json.status }}' not in selected)
 page.set_viewport_size({'width':390,'height':844});dims=page.evaluate('({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})');ok('390px real-case expanded layout does not overflow',dims['document']==390 and dims['body']==390,json.dumps(dims));page.screenshot(path=str(T/'flowdelta-swiftia-mobile.png'),full_page=True)
 page.locator('#demo').click();page.wait_for_function("document.querySelector('#project').value==='Demo · inbound lead routing'");lead_report=page.locator('#report').inner_text();lead_md=md(page,'lead-switch');ok('switching to lead demo clears Swiftia context and curated checks','Swiftia' not in lead_report+lead_md and '7cd32c2' not in lead_report+lead_md and 'failed-render retry loop' not in lead_report+lead_md and page.locator('#checks .check').count()==5 and page.locator('.share-values input:checked').count()==0)
 # Reload Swiftia then edit both inputs, exercising direct public-demo -> own-data invalidation.
 page.locator('#real-demo').click();page.wait_for_function("document.querySelector('#project').value==='Public example · Swiftia API migration'")
 a={'name':'Own old','nodes':[{'id':'x','name':'Own node','type':'n8n-nodes-base.set','parameters':{'value':'OwnBefore'}}],'connections':{}};b=json.loads(json.dumps(a));b['name']='Own new';b['nodes'][0]['parameters']['value']='OwnAfter'
 page.locator('#before').fill(json.dumps(a));page.locator('#after').fill(json.dumps(b));ok('pasting invalidates public context immediately',page.locator('#project').input_value()=='' and page.locator('#goal').input_value()=='' and page.locator('#report').is_hidden());page.locator('#compare').click();page.locator('#report').wait_for(state='visible');own=md(page,'own');ok('own-data rebuilt report has no Swiftia prose/checks or auto explanations',all(x not in own for x in ['Swiftia','7cd32c2','failed-render retry loop','VideoShorts','youtubeVideoId','COMPLETED']) and 'Not provided' in own and page.locator('.change textarea').first.input_value()=='')
 ok('final smoke has no uncaught browser errors',not errors,str(errors));browser.close()
(T/'checks.json').write_text(json.dumps(checks,indent=2))
