import json
from browser_support import artifact_dir, launch_browser, serve_product
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
T=artifact_dir('contact')
checks=[]
def ok(name,condition):
 assert condition,name
 checks.append({'test':name,'pass':True});print('PASS',name)
with serve_product() as base_url, sync_playwright() as p:
 b=launch_browser(p);page=b.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base_url,wait_until='networkidle')
 page.locator('.service-link').click();page.wait_for_timeout(400);ok('Header leads to scoped pilot section',urlparse(page.url).fragment=='pilot' and page.locator('#pilot-title').is_visible())
 href=page.locator('.service-contact .button').get_attribute('href');url=urlparse(href);query=parse_qs(url.query);body=query['body'][0]
 ok('Email brief uses correct business mailbox and decoded subject',url.scheme=='mailto' and url.path=='belgialucca@gmail.com' and query['subject']==['FlowDelta — release-handoff pilot'])
 ok('Brief asks scope, node count, date with no client export included',all(x in body for x in ['Release goal:','both versions','Target handoff date:','$149']) and len(body)<400 and '%0A' in href and '+' not in href)
 ok('Selectable email and Telegram fallback remain visible',page.locator('.contact-address').inner_text()=='belgialucca@gmail.com' and page.locator('.contact-alternative').get_attribute('href')=='https://t.me/blucca_pm_bot')
 sample_links=page.locator('#sample-links a')
 ok('Pilot links to a readable service sample and its PDF', sample_links.count()==2 and sample_links.nth(0).get_attribute('href')=='./examples/service-sample.html' and sample_links.nth(1).get_attribute('href')=='./examples/service-sample.pdf')
 sample=page.request.get(base_url+'examples/service-sample.html');pdf=page.request.get(base_url+'examples/service-sample.pdf')
 ok('Both sample assets are served and PDF is a real PDF', sample.ok and 'Release-handoff service sample' in sample.text() and pdf.ok and pdf.body().startswith(b'%PDF-'))
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':900});page.locator('#pilot').scroll_into_view_if_needed();ok(f'{width}px contact layout fits viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth'));page.locator('#pilot').screenshot(path=str(T/f'contact-{width}.png'))
 ok('No uncaught JS errors',not errors);b.close()
(T/'checks.json').write_text(json.dumps(checks,indent=2))
