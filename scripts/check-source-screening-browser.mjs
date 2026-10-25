import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import './register-ts.mjs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const {discoverSources}=await import('../lib/discover-sources.ts');
const policyReview=JSON.parse(fs.readFileSync('scripts/fixtures/import-discovery/dickinson-policy-review.json','utf8'));
const base='http://127.0.0.1:5173',source=policyReview.source_url;
const policyPath='.sites-runtime/dickinson/10.pdf';
if(process.argv.includes('--collect')){fs.mkdirSync('.sites-runtime/dickinson',{recursive:true});const r=await fetch(source);assert(r.ok);fs.writeFileSync(policyPath,Buffer.from(await r.arrayBuffer()));}
const policy=fs.readFileSync(policyPath),cornell=fs.readFileSync('data/sources/cornell-2025.pdf'),older=fs.readFileSync('data/sources/cornell-2010.pdf');
assert.equal(crypto.createHash('sha256').update(policy).digest('hex'),policyReview.sha256,'Original policy changed; review its content before updating the pinned fixture');
const original=globalThis.fetch;
let discovery;
try {
 globalThis.fetch=async value=>String(value).startsWith('https://cloudflare-dns.com/')?Response.json({Status:0,Answer:new URL(value).searchParams.get('type')==='A'?[{type:1,data:'93.184.216.34'}]:[]}):new Response('<main><h1>Statistics</h1><h2>Common Data Set</h2><a href="/current.pdf">2025-2026</a><h2>Other reports</h2><a href="/generic.pdf">Annual research report</a><a href="/789.pdf">Unlabeled download</a></main><footer><a href="/footer.pdf">2025 safety report</a></footer>');
 discovery=await discoverSources('https://example.edu/statistics');
}finally{globalThis.fetch=original;}
assert.equal(discovery.documents.length,1);assert.equal(discovery.other_documents.length,2);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});let writes=0,mode='mixed';const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/reports',route=>{if(route.request().method()==='POST'){writes++;return route.abort();}return route.continue();});
 await page.goto(base);await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();
 await page.route('**/__policy.pdf',route=>route.fulfill({body:policy,contentType:'application/pdf'}));
 const screened=await page.evaluate(async()=>{
  const {extractPDF}=await import('/lib/extract-pdf.ts');
  try{await extractPDF(await(await fetch('/__policy.pdf')).arrayBuffer(),{url:'https://example.edu/CDS_2025.pdf',title:'Common Data Set 2025',year:2025},'https://example.edu/cds',new AbortController().signal,()=>{});return null;}
  catch(e){const {UnrecognizedReportError}=await import('/lib/pdf-report-screening.ts');return {name:e.name,screened:e instanceof UnrecognizedReportError,message:e.message};}
 });
 assert.equal(screened.screened,true,'An unrelated original policy is screened even if its supplied name says CDS');
 console.log('PASS: original Dickinson policy content rejected independently of its filename; SHA-256 '+crypto.createHash('sha256').update(policy).digest('hex'));
 const clemson=JSON.parse(fs.readFileSync('data/archive-sources.json','utf8')).find(d=>d.school_id==='clemson'&&d.year===2024);
 const expected=JSON.parse(fs.readFileSync('data/archive-c1-review.json','utf8')).find(d=>d.school_id==='clemson'&&d.year===2024);
 await page.route('**/__clemson.pdf',route=>route.fulfill({body:fs.readFileSync(clemson.cache_path),contentType:'application/pdf'}));
 const c=await page.evaluate(async d=>{const {extractPDF}=await import('/lib/extract-pdf.ts');return extractPDF(await(await fetch('/__clemson.pdf')).arrayBuffer(),d,d.index_url,new AbortController().signal,()=>{});},clemson);
 for(const [key,value] of Object.entries(expected.totals))assert.equal(c.metrics[key],value,`Clemson 2024 ${key}`);
 assert.equal(c.sha256,expected.sha256);console.log('PASS: Clemson 2024 original PDF and independently reviewed C1 counts survive content screening');
 await page.route('**/api/sources',route=>{
  const input=route.request().postDataJSON();
  if(input.mode==='discover')return route.fulfill({json:mode==='mixed'?discovery:mode==='only-other'?{...discovery,documents:[],other_documents:[discovery.other_documents[0]]}:{...discovery,documents:[discovery.other_documents[0]],other_documents:[]}});
  if(mode==='network-error')return route.fulfill({status:403,json:{error:'School server refused this download.'}});
  const bytes=input.url.endsWith('/current.pdf')?cornell:input.url.endsWith('/789.pdf')?older:policy;
  return route.fulfill({body:bytes,contentType:'application/pdf'});
 });
 await page.getByRole('button',{name:'Add school data',exact:true}).click();const dialog=page.getByRole('dialog');
 const find=async()=>{await dialog.getByLabel('School website or PDF link',{exact:true}).fill('https://example.edu/statistics');await dialog.getByRole('button',{name:'Find reports',exact:true}).click();await dialog.getByRole('button',{name:'Find reports',exact:true}).isEnabled();};
 await find();await dialog.getByText('1 PDF report found',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Select all',exact:true}).click();
 await dialog.locator('summary').filter({hasText:'Other PDF links'}).click();
 assert(!(await dialog.getByRole('checkbox',{name:'Select PDF Annual research report',exact:true}).isChecked()));
 assert(!(await dialog.getByRole('checkbox',{name:'Select PDF Unlabeled download',exact:true}).isChecked()));
 await dialog.getByRole('checkbox',{name:'Select PDF Annual research report',exact:true}).click();await dialog.getByRole('checkbox',{name:'Select PDF Unlabeled download',exact:true}).click();
 await dialog.getByRole('button',{name:'Extract Section C from 3 PDFs',exact:true}).click();
 await dialog.getByText('1 PDF was skipped after checking the content',{exact:true}).waitFor({timeout:90000});
 await page.waitForFunction(()=>document.querySelectorAll('.import-draft').length===2,{},{timeout:90000});
 assert.equal(await dialog.locator('.import-failure').count(),0);assert.equal(await dialog.getByRole('link',{name:'Open skipped PDF',exact:true}).getAttribute('href'),'https://example.edu/generic.pdf');
 const actualCount=await dialog.getByRole('button',{name:'Save 2 reviewed reports',exact:true});assert(await actualCount.isDisabled());
 await page.setViewportSize({width:390,height:844});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
 await page.screenshot({path:'.sites-runtime/source-screening-mobile.png',fullPage:false});
 mode='only-other';await find();await dialog.getByText('0 PDF reports found',{exact:true}).waitFor();
 const extract=dialog.getByRole('button',{name:'Extract Section C from 0 PDFs',exact:true});assert(await extract.isDisabled());
 await dialog.locator('summary').filter({hasText:'Other PDF links'}).click();
 await dialog.getByRole('checkbox',{name:'Select PDF Annual research report',exact:true}).click();
 await dialog.getByRole('button',{name:'Extract Section C from 1 PDF',exact:true}).click();await dialog.getByText('1 PDF was skipped after checking the content',{exact:true}).waitFor({timeout:60000});assert.equal(await dialog.locator('.import-draft').count(),0);
 mode='network-error';await find();await dialog.getByText('1 PDF report found',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Extract Section C from 1 PDF',exact:true}).click();await dialog.getByText('School server refused this download.',{exact:true}).waitFor();assert.equal(await dialog.locator('.import-skipped').count(),0);
 assert.equal(writes,0);assert.deepEqual(errors,[]);
 console.log('PASS: Select all excludes uncertain PDFs; manual recovery of a real generic report; mixed batch continues after content screening; uncertain-only and download-error states; mobile layout; no library writes');
}finally{await browser.close();}



