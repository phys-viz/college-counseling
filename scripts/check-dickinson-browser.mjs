import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const cache='.sites-runtime/dickinson';
// Reproduce caches with: node --import ./scripts/register-ts.mjs scripts/check-dickinson-browser.mjs --collect
// Downloads originals only; no report-save requests are sent.
if(process.argv.includes('--collect')) {
 const {discoverSources}=await import('../lib/discover-sources.ts');
 const d=await discoverSources('https://www.dickinson.edu/info/20084/institutional_research/3487/statistics');
 assert.equal(d.documents.length,10);fs.mkdirSync(cache,{recursive:true});
 for(const [i,doc] of d.documents.entries()) {
  const response=await fetch(doc.url);assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(`${cache}/${i}.pdf`,bytes);doc.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 fs.writeFileSync(`${cache}/discovery.json`,JSON.stringify(d,null,2));
}
const d=JSON.parse(fs.readFileSync(`${cache}/discovery.json`,'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const page=await browser.newPage();let writes=0;
 await page.route('**/api/reports',route=>{if(route.request().method()==='POST'){writes++;return route.abort();}return route.continue();});
 await page.goto('http://127.0.0.1:5173/');
 await page.getByRole('button',{name:'Add school data',exact:true}).waitFor();
 await page.route('**/__dickinson.pdf?*',route=>route.fulfill({body:fs.readFileSync(`${cache}/${new URL(route.request().url()).searchParams.get('i')}.pdf`),contentType:'application/pdf'}));
 for(const [i,doc] of d.documents.entries()) {
  const r=await page.evaluate(async({i,doc,index})=>{
   const {extractPDF}=await import('/lib/extract-pdf.ts');
   return extractPDF(await(await fetch('/__dickinson.pdf?i='+i)).arrayBuffer(),doc,index,new AbortController().signal,()=>{});
  },{i,doc,index:d.index_url});
  assert(r.sections.length>0,`${doc.year}: Section C extracted`);assert.equal(r.sha256,doc.sha256);
  console.log(`PASS: Dickinson ${doc.year} original PDF through PDF.js, Section C pages ${r.sections.map(s=>s.page).join(',')}`);
 }
 await page.route('**/api/sources',route=>{
  const input=route.request().postDataJSON();
  if(input.mode==='discover')return route.fulfill({json:d});
  const i=d.documents.findIndex(doc=>doc.url===input.url);return route.fulfill({body:fs.readFileSync(`${cache}/${i}.pdf`),contentType:'application/pdf'});
 });
 await page.getByRole('button',{name:'Add school data',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('School website or PDF link',{exact:true}).fill(d.index_url);
 await dialog.getByRole('button',{name:'Find reports',exact:true}).click();
 await dialog.getByText('10 PDF reports found',{exact:true}).waitFor();
 assert.equal(await dialog.getByText('Non-Discrimination Policy',{exact:true}).count(),0);
 // Simulate an unsupported file to verify that its own label identifies the error.
 await page.route('**/api/sources',route=>{
  const input=route.request().postDataJSON();
  if(input.mode==='discover')return route.fulfill({json:{...d,documents:[{url:'https://example.edu/policy.pdf',title:'Non-Discrimination Policy',year:null}]}});
  return route.fulfill({status:400,json:{error:'Section C could not be located.'}});
 });
 await dialog.getByRole('button',{name:'Find reports',exact:true}).click();
 await dialog.getByRole('button',{name:'Extract Section C from 1 PDF',exact:true}).click();
 await dialog.getByText('Could not extract: Non-Discrimination Policy',{exact:true}).waitFor();
 assert.equal(writes,0);console.log('PASS: ten-report discovery UI, named extraction errors, no library writes');
} finally {await browser.close();}
