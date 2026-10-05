import copy,json
from browser_support import artifact_dir, download_markdown, launch_browser, pdf_text, serve_product
from playwright.sync_api import sync_playwright
TEMP=artifact_dir('values')
checks=[]
def ok(name,cond,detail=''):
 checks.append({'test':name,'pass':bool(cond),'detail':detail});print(('PASS ' if cond else 'FAIL ')+name+' '+detail,flush=True)
 if not cond: raise AssertionError(name+' '+detail)
def markdown(page,label):
 return download_markdown(page,TEMP,label)
def pdf(page,label):
 return pdf_text(page,TEMP,label)
def setwork(page,a,b):
 page.locator('#before').fill(json.dumps(a));page.locator('#after').fill(json.dumps(b));page.locator('#compare').click();page.locator('#report').wait_for(state='visible')
for_test={'name':'Test old','nodes':[
 {'id':'code','name':'Transform','type':'n8n-nodes-base.code','typeVersion':2,'position':[0,0],'parameters':{'jsCode':'return [{json: { marker: "CODEBEFOREZZ" }}];'},'credentials':{'httpHeaderAuth':{'id':'CREDBEFOREZZ','name':'PRIVATECREDNAMEBEFOREZZ'}}},
 {'id':'http','name':'Send','type':'n8n-nodes-base.httpRequest','typeVersion':4.2,'position':[200,0],'parameters':{'url':'https://example.invalid/URLBEFOREZZ','method':'POST','jsonBody':'BODYBEFOREZZ'},'credentials':{'httpHeaderAuth':{'id':'HTTPSECRETBEFOREZZ','name':'HTTPNAMEBEFOREZZ'}}}
 ],'connections':{'Transform':{'main':[[{'node':'Send','type':'main','index':0}]]}},'pinData':{'Transform':[{'json':{'secret':'PINBEFOREZZ'}}]},'settings':{}}
a=for_test;b=copy.deepcopy(a);b['name']='Test new';b['nodes'][0]['parameters']['jsCode']='return [{json: { marker: "CODEAFTERZZ" }}];';b['nodes'][0]['credentials']['httpHeaderAuth']={'id':'CREDAFTERZZ','name':'PRIVATECREDNAMEAFTERZZ'};b['nodes'][1]['parameters'].update(url='https://example.invalid/URLAFTERZZ',jsonBody='BODYAFTERZZ');b['nodes'][1]['credentials']['httpHeaderAuth']={'id':'HTTPSECRETAFTERZZ','name':'HTTPNAMEAFTERZZ'};b['pinData']['Transform'][0]['json']['secret']='PINAFTERZZ'
raw=['CODEBEFOREZZ','CODEAFTERZZ','URLBEFOREZZ','URLAFTERZZ','BODYBEFOREZZ','BODYAFTERZZ']
secrets=['CREDBEFOREZZ','CREDAFTERZZ','PRIVATECREDNAMEBEFOREZZ','PRIVATECREDNAMEAFTERZZ','HTTPSECRETBEFOREZZ','HTTPSECRETAFTERZZ','HTTPNAMEBEFOREZZ','HTTPNAMEAFTERZZ','PINBEFOREZZ','PINAFTERZZ']
with serve_product() as base_url, sync_playwright() as p:
 browser=launch_browser(p)
 page=browser.new_page(viewport={'width':1280,'height':1000},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base_url,wait_until='networkidle');page.locator('#demo').click();page.locator('#report').wait_for(state='visible')
 page.locator('.value-details summary').first.click();ok('demo local value review opens',page.locator('.value-details').first.get_attribute('open') is not None)
 page.locator('#report').scroll_into_view_if_needed();page.screenshot(path=str(TEMP/'flowdelta-values-desktop.png'),full_page=True)
 demo_md=markdown(page,'demo-default');demo_pdf=pdf(page,'demo-default')
 ok('demo expanded default Markdown excludes reviewed-values block','Reviewed value:' not in demo_md)
 ok('demo expanded default PDF hides exact-value panels','Previous:' not in demo_pdf and 'New:' not in demo_pdf)
 setwork(page,a,b);page.locator('.value-details summary').all()[0].click();page.locator('.value-details summary').all()[1].click()
 visible=page.locator('#report').inner_text();ok('synthetic changed Code and HTTP values visible locally',all(x in visible for x in raw));ok('credential references and pinned payload never rendered in report',all(x not in visible for x in secrets))
 default_md=markdown(page,'default');default_pdf=pdf(page,'default')
 ok('expanded default Markdown omits all raw markers',all(x not in default_md for x in raw+secrets));ok('expanded default PDF omits all raw markers',all(x not in default_pdf for x in raw+secrets))
 page.locator('.share-values input').first.check()
 selected_md=markdown(page,'selected');selected_pdf=pdf(page,'selected')
 ok('opt-in Markdown includes selected Code values only',all(x in selected_md for x in raw[:2]) and all(x not in selected_md for x in raw[2:]+secrets))
 ok('opt-in PDF includes selected Code values only',all(x in selected_pdf for x in raw[:2]) and all(x not in selected_pdf for x in raw[2:]+secrets))
 page.evaluate("window.dispatchEvent(new Event('beforeprint'))");count1=page.locator('.print-value').count();page.evaluate("window.dispatchEvent(new Event('beforeprint'))");count2=page.locator('.print-value').count();copies=page.locator('.print-value').all_text_contents();ok('repeated beforeprint has no duplicates',count1==count2 and sum('CODEAFTERZZ' in v for v in copies)==1,f'{count1} then {count2} print copies');page.evaluate("window.dispatchEvent(new Event('afterprint'))");ok('afterprint cleans copies',page.locator('.print-value').count()==0)
 page.locator('.share-values input').first.uncheck();off_md=markdown(page,'off');off_pdf=pdf(page,'off');ok('toggling opt-in off excludes values in Markdown and PDF',all(x not in off_md+off_pdf for x in raw+secrets))
 page.locator('.share-values input').nth(1).check();http_md=markdown(page,'http-only');http_pdf=pdf(page,'http-only');ok('switching selection exports HTTP values but no Code/credentials/pinData',all(x in http_md and x in http_pdf for x in raw[2:]) and all(x not in http_md+http_pdf for x in raw[:2]+secrets))
 page.set_viewport_size({'width':390,'height':844});page.locator('#report').scroll_into_view_if_needed();page.screenshot(path=str(TEMP/'flowdelta-values-mobile.png'),full_page=True)
 dims=page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})');ok('390px expanded report has no horizontal page overflow',dims['document']<=390 and dims['body']<=390,json.dumps(dims))
 # Longer unbroken value to exercise wrapped local columns + PDF.
 b['nodes'][0]['parameters']['jsCode']='x'*3000;setwork(page,a,b);page.locator('.value-details summary').first.click();dims=page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth})');ok('390px long unbroken Code value stays inside viewport',dims['document']<=390,json.dumps(dims));ok('new comparison resets all opt-in selections',page.locator('.share-values input:checked').count()==0)
 ok('no uncaught browser errors',not errors,str(errors))
 browser.close()
(TEMP/'checks.json').write_text(json.dumps(checks,indent=2))
