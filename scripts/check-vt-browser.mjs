import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const docs=JSON.parse(fs.readFileSync('data/vt-sources.json','utf8')).filter(d=>d.usable_report&&d.source_type==='pdf'),review=JSON.parse(fs.readFileSync('data/vt-source-review.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/');
 await page.route('**/__vt.pdf?*',route=>route.fulfill({body:fs.readFileSync(`.sites-runtime/vt/virginia-tech-${new URL(route.request().url()).searchParams.get('year')}.pdf`),contentType:'application/pdf'}));
 for(const d of docs){
  const r=await page.evaluate(async d=>{const {extractPDF}=await import('/lib/extract-pdf.ts');const bytes=await(await fetch('/__vt.pdf?year='+d.year)).arrayBuffer();return extractPDF(bytes,{url:d.url,title:d.title,year:d.year},d.index_url,new AbortController().signal,()=>{});},d);
  for(const [i,k] of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],d.year===2023&&k==='applicants'?undefined:review[d.year].counts[i],`${d.year} ${k}`);
  assert.equal(r.sha256,d.sha256);if(d.year===2023){assert(r.warnings.some(w=>w.includes('47208, 47207')));assert.equal(r.metrics.reading_25,620);}console.log('PASS: real PDF.js VT',d.year);
 }
 const response=await page.request.get('http://127.0.0.1:5173/api/trends?school=virginia-tech&from=2019&to=2025');assert.equal(response.status(),200);
 const data=await response.json();assert.deepEqual(data.reports.map(r=>r.year),[2019,2022,2023,2024,2025]);assert(data.schools.some(s=>s.school_id==='virginia-tech'));
 assert.equal(data.reports.find(r=>r.year===2023).metrics.applicants,47207);assert.equal(data.reports.find(r=>r.year===2024).metrics.unknown_gender_applicants,undefined);
 await page.getByRole('tab',{name:'Trends',exact:true}).click();await page.getByRole('combobox',{name:'Trend school',exact:true}).click();await page.getByRole('option',{name:'Virginia Tech',exact:true}).click();
 await page.getByRole('spinbutton',{name:'From year',exact:true}).fill('2019');await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2025');await page.waitForFunction(()=>document.querySelectorAll('.trend-point').length===5);
 assert(await page.locator('.school-legend-item[data-school=virginia-tech] img').evaluate(el=>el.complete&&el.naturalWidth>0));
 console.log('PASS: VT shared library/trend years, missing-year gaps, reviewed source counts and official mark');
}finally{await browser.close();}
