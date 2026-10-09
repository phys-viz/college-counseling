import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const docs=JSON.parse(fs.readFileSync('data/new-archive-sources.json','utf8'));
const expected=JSON.parse(fs.readFileSync('data/new-archive-source-review.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('tab',{name:'Trends',exact:true}).waitFor();
 await page.route('**/__archive.pdf?*',route=>route.fulfill({body:fs.readFileSync(`.sites-runtime/new-archives/${new URL(route.request().url()).searchParams.get('file')}.pdf`),contentType:'application/pdf'}));
 for(const d of docs.filter(d=>!process.argv.includes('--ui-only')&&(!process.argv.includes('--remaining')||d.school_id==='the-college-of-new-jersey'&&d.year<=2015))){
  const r=await page.evaluate(async d=>{const {extractPDF}=await import('/lib/extract-pdf.ts');const bytes=await(await fetch('/__archive.pdf?file='+d.school_id+'-'+d.year)).arrayBuffer();return extractPDF(bytes,{url:d.url,title:d.title,year:d.year},d.index_url,new AbortController().signal,()=>{});},d);
  fs.writeFileSync(`.sites-runtime/new-archives/${d.school_id}-${d.year}-browser-draft.json`,JSON.stringify(r,null,2));
  for(const [i,k] of ['applicants','admitted','enrolled'].entries())if(d.school_id==='the-college-of-new-jersey'&&d.year===2023&&k!=='applicants')assert.equal(r.metrics[k],undefined);else assert.equal(r.metrics[k],expected[d.school_id][d.year][i],`${d.school_id} ${d.year} ${k}`);
  assert.equal(r.sha256,d.sha256);if(d.year===2025)assert.equal(r.factors.length,18);console.log('PASS: original PDF.js',d.school_id,d.year);
 }
 await page.getByRole('tab',{name:'Trends',exact:true}).click();await page.getByRole('combobox',{name:'Metric',exact:true}).click();await page.getByRole('combobox',{name:'Search metrics',exact:true}).fill('male applications');await page.getByRole('option',{name:'Male applications',exact:true}).click();
 await page.getByRole('spinbutton',{name:'From year',exact:true}).fill('2010');await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2015');await page.waitForFunction(()=>document.querySelectorAll('.trend-point').length===6);
 const data=await(await page.request.get('http://127.0.0.1:5173/api/trends?school=cornell&from=2010&to=2015')).json();assert.equal(data.reports.find(r=>r.year===2010).metrics.male_applicants,19274);
 await page.getByRole('link',{name:/19,274.*source/}).first().waitFor();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download SVG',exact:true}).click();await(await download).saveAs('.sites-runtime/gender-trends.svg');assert(fs.readFileSync('.sites-runtime/gender-trends.svg','utf8').includes('Male applications'));
 await page.screenshot({path:'.sites-runtime/gender-trends-desktop.png',fullPage:true});
 await page.getByRole('combobox',{name:'Trend school',exact:true}).click();await page.getByRole('option',{name:'University of Michigan–Ann Arbor',exact:true}).click();await page.getByRole('spinbutton',{name:'From year',exact:true}).fill('2023');await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2025');await page.waitForFunction(()=>document.querySelectorAll('.trend-point').length===3);
 const mark=page.locator('.school-legend-item[data-school=university-of-michigan-ann-arbor] img');assert(await mark.evaluate(el=>el.complete&&el.naturalWidth>0));
 await page.setViewportSize({width:390,height:844});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Gender trends mobile overflow');await page.screenshot({path:'.sites-runtime/gender-trends-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: gender search, historical Cornell data, source links, chart export, Michigan logo and mobile layout');
}finally{await browser.close();}
