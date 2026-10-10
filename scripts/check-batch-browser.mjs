import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const specs=[
 ['a','university-of-florida',2000,[20675,12916,6952]],
 ['a','rutgers-university-new-brunswick',2013,[30631,18230,6402]],
 ['b','bentley-university',2021,[9311,5674,1019]],
 ['b','bentley-university',2023,[undefined,5077,1120]],
 ['b','elon-university',2000,[5625,3446,1144],'elon-university-2000-first-time-first-year-admissions'],
 ['c','boston-university',2008,[38010,20640,4131]],
 ['c','boston-university',2024,[78769,8749,3268]],
 ['c','boston-university',2025,[76776,9853,3449]],
 ['c','university-of-notre-dame',2025,[35401,3320,2118]],
 ['d','university-of-massachusetts-amherst',2002,[20449,11783,3335]],
 ['d','fordham-university',2011,[31792,13478,1986]],
 ['e','university-of-alabama',2025,[61994,44124,8127]],
 ['e','university-of-delaware',2014,[25032,16491,4179],'university-of-delaware-2014-official'],
];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/',{timeout:90000});
 await page.route('**/__batch_parser.pdf?*',route=>{
  const u=new URL(route.request().url());
  return route.fulfill({body:fs.readFileSync(`.sites-runtime/batch-${u.searchParams.get('batch')}/${u.searchParams.get('file')}.pdf`),contentType:'application/pdf'});
 });
 for(const [batch,sid,year,counts,cacheKey] of specs) {
  const file=cacheKey??`${sid}-${year}`;
  const d=JSON.parse(fs.readFileSync(`data/batch-${batch}-sources.json`)).find(d=>d.school_id===sid&&d.year===year&&(!cacheKey||d.cache_key===cacheKey));
  assert(d,`${sid} source manifest`);
  const r=await page.evaluate(async ({batch,file,d})=>{
   const {extractPDF}=await import('/lib/extract-pdf.ts');
   const bytes=await(await fetch('/__batch_parser.pdf?'+new URLSearchParams({batch,file}))).arrayBuffer();
   return extractPDF(bytes,{url:d.url,title:d.title,year:d.year},d.index_url,new AbortController().signal,()=>{});
  },{batch,file,d});
  for(const [i,k] of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],counts[i],`${sid} ${year} ${k}`);
  assert.equal(r.sha256,d.sha256);assert(r.sections.length);
  if(typeof counts[0]==='number')assert(r.evidence.applicants.page>0);else assert.equal(r.evidence.applicants,undefined);
  if(sid==='university-of-florida')assert.equal(r.metrics.unknown_gender_applicants,37);
  if(sid==='boston-university'&&year===2024){assert.equal(r.metrics.male_enrolled,1267);assert.equal(r.metrics.another_gender_enrolled,113);}
  if(sid==='university-of-notre-dame')assert.equal(r.metrics.unknown_gender_applicants,undefined);
  if(sid==='bentley-university'&&year===2023){assert.equal(r.metrics.male_applicants,undefined);assert(r.warnings.some(w=>w.includes('male_applicants')&&w.includes('disagree')));}
  console.log('PASS: real PDF.js',sid,year,...counts);
 }
}finally{await browser.close();}
