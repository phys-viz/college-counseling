import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const docs=JSON.parse(fs.readFileSync('data/nyu-sources.json','utf8'));
const review=JSON.parse(fs.readFileSync('data/nyu-source-review.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('heading',{name:'New York University',exact:true}).waitFor();
 await page.route('**/__nyu.pdf?*',route=>route.fulfill({body:fs.readFileSync(`.sites-runtime/nyu/nyu-${new URL(route.request().url()).searchParams.get('year')}.pdf`),contentType:'application/pdf'}));
 for(const d of docs.filter(d=>d.source_type==='pdf')){
  const r=await page.evaluate(async d=>{const {extractPDF}=await import('/lib/extract-pdf.ts');return extractPDF(await(await fetch('/__nyu.pdf?year='+d.year)).arrayBuffer(),{url:d.url,title:d.title,year:d.year},d.index_url,new AbortController().signal,()=>{});},d);
  const expected=review[d.year];assert.equal(r.year,expected.detected_year);
  for(const [key,value] of Object.entries(expected.metrics))assert.equal(r.metrics[key],value,`NYU PDF.js ${d.year} ${key}`);
  assert.equal(r.factors.length,expected.factor_count,`NYU PDF.js ${d.year} C7`);assert.equal(r.sha256,d.sha256);
  console.log('PASS: real NYU PDF.js',d.year);
 }
 const response=await page.request.get('http://127.0.0.1:5173/api/reports?school=new-york-university');const data=await response.json();assert.equal(data.report_count,8);
 assert.equal(data.reports.find(r=>r.year===2019).year,2019);assert.equal(data.reports.find(r=>r.year===2025).metrics.applicants,114125);
 await page.getByRole('tab',{name:'Trends',exact:true}).click();await page.getByRole('combobox',{name:'Trend school',exact:true}).click();await page.getByRole('option',{name:'New York University',exact:true}).click();
 await page.getByRole('spinbutton',{name:'From year',exact:true}).fill('2018');await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2025');await page.waitForFunction(()=>document.querySelectorAll('.trend-point').length===8);
 const legend=page.locator('.school-legend-item[data-school=new-york-university]');assert.equal(await legend.evaluate(el=>getComputedStyle(el).color),'rgb(87, 6, 140)');assert(await legend.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0));
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download SVG',exact:true}).click();await(await downloading).saveAs('.sites-runtime/nyu/chart.svg');assert(fs.readFileSync('.sites-runtime/nyu/chart.svg','utf8').includes('data:image/png;base64,'));
 await page.screenshot({path:'.sites-runtime/nyu/trends-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'NYU mobile overflow');await page.screenshot({path:'.sites-runtime/nyu/trends-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: eight NYU years in library, verified cohort indexing, purple legend/logo, branded export and mobile');
}finally{await browser.close();}
