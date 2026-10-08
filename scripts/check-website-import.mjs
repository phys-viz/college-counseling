import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const root=new URL('../',import.meta.url),base='http://127.0.0.1:5173';
const seed=JSON.parse(fs.readFileSync(new URL('data/reports.json',root),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base);await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();
 await page.route('**/__test_pdf?*',route=>route.fulfill({body:fs.readFileSync(new URL('data/sources/'+new URL(route.request().url()).searchParams.get('file'),root)),contentType:'application/pdf'}));
 for(const [school,year] of [['cornell',2025],['south-carolina',2025],['south-carolina',2024],['cornell',2010]]) {
  const expected=seed.find(r=>r.school_id===school&&r.year===year);
  const actual=await page.evaluate(async({school,year,expected})=>{
   const {extractPDF}=await import('/lib/extract-pdf.ts');
   const bytes=await (await fetch('/__test_pdf?file='+school+'-'+year+'.pdf')).arrayBuffer();
   return extractPDF(bytes,{url:expected.source_url,title:String(year),year},expected.index_url,new AbortController().signal,()=>{});
  },{school,year,expected});
  console.log('Parsed',school,year,'with',Object.keys(actual.metrics).length,'figures and',actual.factors.length,'factor ratings');
  fs.writeFileSync(new URL('.sites-runtime/extracted-'+school+'-'+year+'.json',root),JSON.stringify(actual,null,2));
  for(const key of ['applicants','admitted','enrolled','sat_25','sat_75','act_25','act_75','reading_25','math_75','waitlist_offered','waitlist_accepted','waitlist_admitted'])if(expected.metrics[key]!==undefined)assert.equal(actual.metrics[key],expected.metrics[key],school+' '+year+' '+key);
  for(const f of actual.factors)assert.equal(f.rating,expected.factors.find(v=>v.label===f.label)?.rating,school+' '+year+' '+f.label);
  assert(actual.sections.length>0);assert.equal(actual.sha256,expected.sha256);assert.equal(actual.year,year);
 }
 await assert.rejects(()=>page.evaluate(async()=>{
  const {extractPDF}=await import('/lib/extract-pdf.ts');
  return extractPDF(await(await fetch('/__test_pdf?file=cornell-2022.pdf')).arrayBuffer(),{url:'https://school.edu/2022.pdf',year:2022,title:'2022'},'https://school.edu',new AbortController().signal,()=>{});
 }),/Section C could not be located/);
 console.log('PASS: real PDF form/text extraction and rejection of the Section B-only PDF');
 const cornell=seed.find(r=>r.school_id==='cornell'&&r.year===2025);
 let writes=[];
 await page.route('**/api/sources',async route=>{
  const input=route.request().postDataJSON();
  if(input.mode==='download')return route.fulfill({body:fs.readFileSync(new URL('data/sources/cornell-2025.pdf',root)),contentType:'application/pdf',headers:{'X-Source-URL':encodeURIComponent(cornell.source_url)}});
  return route.fulfill({json:{index_url:cornell.index_url,title:'Common Data Set',documents:[{url:cornell.source_url,title:'2025-2026',year:2025}],notes:[]}});
 });
 await page.route('**/api/reports',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  writes.push(route.request().postDataJSON());await route.fulfill({json:{imported:1}});
 });
 await page.getByRole('button',{name:'Add school data',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('School website or PDF link',{exact:true}).fill(cornell.index_url);
 await dialog.getByRole('button',{name:'Find reports',exact:true}).click();
 await dialog.getByRole('button',{name:'Extract Section C from 1 PDF',exact:true}).click();
 await dialog.getByRole('heading',{name:'Review before saving',exact:true}).waitFor({timeout:60000});
 assert.equal(await dialog.getByLabel('School name',{exact:true}).inputValue(),'Cornell University');
 assert.equal(await dialog.getByLabel('Applications for 2025',{exact:true}).inputValue(),'72523');
 assert((await dialog.locator('.import-draft').innerText()).includes('Already in library'));
 const save=dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true});assert(await save.isDisabled());
 await dialog.getByRole('checkbox',{name:'Reviewed report 2025',exact:true}).click();assert(await save.isDisabled());
 await dialog.getByRole('checkbox',{name:'Replace existing reports',exact:true}).click();assert(await save.isEnabled());
 await dialog.getByLabel('Applications for 2025',{exact:true}).fill('72524');assert(await save.isDisabled());
 assert.equal(writes.length,0,'Extraction and review must not write to the database');
 await dialog.getByRole('combobox',{name:'Save under school',exact:true}).click();await page.getByRole('option',{name:'A new school',exact:true}).click();
 await dialog.getByLabel('School name',{exact:true}).fill('QA Website Import');
 await dialog.getByRole('checkbox',{name:'Reviewed report 2025',exact:true}).click();await save.click();
 await dialog.getByText('1 reviewed report saved to the shared library.',{exact:true}).waitFor();
 assert.equal(writes.length,1);assert.equal(writes[0][0].school_id,'qa-website-import');assert.equal(writes[0][0].metrics.applicants,72524);
 assert.equal(writes[0][0].metrics.admit_rate,Math.round(6077/72524*100000)/1000);
 assert.equal(writes[0][0].source_url,cornell.source_url);assert.equal(writes[0][0].evidence.applicants.page,cornell.evidence.applicants.page);
 await page.screenshot({path:'.sites-runtime/website-import-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Import dialog has horizontal overflow on mobile');
 await page.screenshot({path:'.sites-runtime/website-import-mobile.png',fullPage:true});
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 console.log('PASS: website import UI, source links, existing-report protection, edits reset review, normalized save payload, mobile layout');
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
