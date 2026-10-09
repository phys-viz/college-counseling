import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const url='https://www.wlu.edu/Business%20Units%20and%20Administrative%20Offices/Accreditation%20and%20Institutional%20Research/Common%20Data%20Set/2025-common-data-set.pdf';
const pdfPath=new URL('../data/sources/wlu-2025.pdf',import.meta.url);
const bytes=fs.readFileSync(pdfPath);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:5173/');
 await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();
 await page.route('**/__wlu.pdf',route=>route.fulfill({body:bytes,contentType:'application/pdf'}));
 const report=await page.evaluate(async url=>{
  const {extractPDF}=await import('/lib/extract-pdf.ts');
  const {validateReports}=await import('/lib/validate-import.ts');
  const r=await extractPDF(await(await fetch('/__wlu.pdf')).arrayBuffer(),{url,title:'W&L 2025',year:2025},url,new AbortController().signal,()=>{});
  r.school_id='washington-and-lee-university';r.school='Washington and Lee University';
  return validateReports([r])[0];
 },url);
 assert.equal(report.metrics.applicants,8963);assert.equal(report.metrics.admitted,1214);assert.equal(report.metrics.enrolled,499);
 assert.equal(report.metrics.admit_rate,13.545);assert.equal(report.metrics.yield_rate,41.104);
 for(const key of ['applicants','admitted','enrolled']){assert.equal(report.evidence[key].page,9);assert(report.evidence[key].method.includes('cross-checked'));}
 assert.equal(report.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(new URL('../.sites-runtime/wlu-corrected-extraction.json',import.meta.url),JSON.stringify(report,null,2));
 console.log('PASS: W&L original PDF via PDF.js; 8,963 applicants, 1,214 admitted, 499 enrolled; gender/residency reconciliation, evidence, validation, recalculated rates');
}finally{await browser.close();}
