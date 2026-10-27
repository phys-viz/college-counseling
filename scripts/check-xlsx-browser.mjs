// Spreadsheet import through the website: real Chrome DecompressionStream, the
// review dialog and the save payload. Requires the local app (npm run dev).
// Sources and saves are mocked, so the shared library is never written.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
import {workbook} from './fixtures/xlsx-builder.mjs';
const root=new URL('../',import.meta.url),base='http://127.0.0.1:5173';
const seed=JSON.parse(fs.readFileSync(new URL('data/reports.json',root),'utf8'));
const cornell22=seed.find(r=>r.school_id==='cornell'&&r.year===2022),cornell25=seed.find(r=>r.school_id==='cornell'&&r.year===2025);
const unrelated=Buffer.from(workbook({Budget:[['A1','Facilities budget 2024'],['B2',1200]]}));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base);await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();
 await page.route('**/__test_xlsx?*',route=>route.fulfill({body:fs.readFileSync(new URL('data/sources/'+new URL(route.request().url()).searchParams.get('file'),root)),contentType:'application/octet-stream'}));
 const actual=await page.evaluate(async({expected})=>{
  const {extractXLSX}=await import('/lib/extract-xlsx.ts');
  return extractXLSX(await (await fetch('/__test_xlsx?file=cornell-2022.xlsx')).arrayBuffer(),{url:expected.source_url,title:'2022',year:2022},expected.index_url,new AbortController().signal,()=>{});
 },{expected:cornell22});
 for(const key of ['applicants','admitted','enrolled','sat_25','sat_75','act_25','act_75'])assert.equal(actual.metrics[key],cornell22.metrics[key],`Cornell 2022 ${key}`);
 assert.equal(actual.sha256,cornell22.sha256);assert.equal(actual.factors.length,19);assert.equal(actual.source_type,'xlsx');
 console.log('PASS: Chrome reads the original Cornell 2022 workbook with the reviewed counts, scores, factors and hash');

 const files={[cornell22.source_url]:['data/sources/cornell-2022.xlsx','xlsx'],[cornell25.source_url]:['data/sources/cornell-2025.pdf','pdf']};
 const writes=[];
 await page.route('**/api/sources',async route=>{
  const input=route.request().postDataJSON();
  if(input.mode==='download'){
   if(input.url==='https://example.edu/budget.xlsx')return route.fulfill({body:unrelated,headers:{'X-Source-URL':encodeURIComponent(input.url),'X-Source-Format':'xlsx'}});
   const [file,format]=files[input.url];return route.fulfill({body:fs.readFileSync(new URL(file,root)),headers:{'X-Source-URL':encodeURIComponent(input.url),'X-Source-Format':format}});
  }
  return route.fulfill({json:{index_url:cornell22.index_url,title:'Common Data Set',documents:[{url:cornell22.source_url,title:'2022-2023 workbook',year:2022,format:'xlsx'},{url:cornell25.source_url,title:'2025-2026',year:2025}],other_documents:[{url:'https://example.edu/budget.xlsx',title:'Budget workbook',year:2024,format:'xlsx'}],notes:['2 linked reports use Excel 97–2003 (.xls) workbooks. Automatic extraction supports PDFs and .xlsx workbooks; .xls files require a reviewed source adapter or JSON import.']}});
 });
 await page.route('**/api/reports',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  writes.push(route.request().postDataJSON());await route.fulfill({json:{imported:1}});
 });
 await page.getByRole('button',{name:'Add school data',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('School website or PDF link',{exact:true}).fill(cornell22.index_url);
 await dialog.getByRole('button',{name:'Find reports',exact:true}).click();
 await dialog.getByText('2 reports found',{exact:true}).waitFor();
 await dialog.getByText(/Excel 97–2003 \(\.xls\) workbooks/).waitFor();
 await dialog.getByRole('button',{name:'Extract Section C from 1 spreadsheet',exact:true}).waitFor();
 await dialog.getByRole('checkbox',{name:'Select PDF 2025-2026',exact:true}).click();
 await dialog.locator('summary').filter({hasText:'Other report links'}).click();
 await dialog.getByRole('checkbox',{name:'Select spreadsheet Budget workbook',exact:true}).click();
 await dialog.getByRole('button',{name:'Extract Section C from 3 files',exact:true}).click();
 await dialog.getByRole('heading',{name:'Review before saving',exact:true}).waitFor({timeout:90000});
 await dialog.getByText('1 spreadsheet was skipped after checking the content',{exact:true}).waitFor({timeout:90000});
 assert.equal(await dialog.getByRole('link',{name:'Open skipped spreadsheet',exact:true}).getAttribute('href'),'https://example.edu/budget.xlsx');
 assert.equal(await dialog.locator('.import-draft').count(),2);
 assert.equal(await dialog.getByLabel('School name',{exact:true}).inputValue(),'Cornell University','The workbook names its institution in A1');
 const draft=dialog.locator(`.import-draft[data-source-url="${cornell22.source_url}"]`);
 await draft.locator('summary').first().click();
 assert.equal(await dialog.getByLabel('Applications for 2022',{exact:true}).inputValue(),String(cornell22.metrics.applicants));
 assert.equal(await draft.getByRole('link',{name:'Open original spreadsheet',exact:true}).getAttribute('href'),cornell22.source_url);
 assert((await draft.innerText()).includes('C1 · worksheet CDS-C'),'Evidence links name the worksheet, not a PDF page');
 await draft.locator('summary').filter({hasText:'Admissions factor ratings'}).click();
 assert.equal(await draft.getByRole('link',{name:'Application essay',exact:true}).getAttribute('href'),cornell22.source_url,'Workbook links carry no #page fragment');
 await draft.locator('summary').filter({hasText:'Extracted source text'}).click();
 await draft.locator('summary').filter({hasText:'Worksheet CDS-C'}).first().click();
 assert((await draft.locator('pre').first().innerText()).startsWith('Worksheet CDS-C (source worksheet 3)'));
 await dialog.getByRole('checkbox',{name:'Reviewed report 2022',exact:true}).click();
 await dialog.locator(`.import-draft[data-source-url="${cornell25.source_url}"] summary`).first().click();
 await dialog.getByRole('checkbox',{name:'Reviewed report 2025',exact:true}).click();
 await dialog.getByRole('checkbox',{name:'Replace existing reports',exact:true}).click();
 assert.equal(writes.length,0,'Extraction and review must not write to the database');
 await dialog.getByRole('button',{name:'Save 2 reviewed reports',exact:true}).click();
 await dialog.getByText('2 reviewed reports saved to the shared library.',{exact:true}).waitFor();
 const saved=writes.flat().find(r=>r.year===2022),pdf=writes.flat().find(r=>r.year===2025);
 assert.equal(saved.source_type,'xlsx');assert.equal(saved.sha256,cornell22.sha256);assert.equal(saved.school_id,'cornell');
 assert.equal(saved.metrics.applicants,cornell22.metrics.applicants);assert.equal(saved.evidence.applicants.page,3);assert.match(saved.evidence.applicants.method,/^Worksheet CDS-C: /);
 assert(saved.sections[0].text.includes('CDS-C!'),'Saved sections keep worksheet cell references');
 assert.equal(pdf.source_type,'pdf');assert.equal(pdf.metrics.applicants,cornell25.metrics.applicants,'PDF extraction is unchanged in a mixed batch');
 await page.setViewportSize({width:390,height:844});
 assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Import dialog has horizontal overflow on mobile');
 await page.screenshot({path:'.sites-runtime/xlsx-import-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: mixed PDF/workbook discovery, .xls notice, skipped non-CDS workbook, worksheet evidence links, save payload provenance and mobile layout');
} finally {await browser.close();}
