import fs from 'node:fs';
import assert from 'node:assert/strict';
import './register-ts.mjs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const {validateReports}=await import('../lib/validate-import.ts');
// Run check-dickinson-browser.mjs --collect first if original PDF caches are absent.
const discovery=JSON.parse(fs.readFileSync('.sites-runtime/dickinson/discovery.json','utf8'));
const existing={school_id:'dickinson-college',school:'Dickinson College',year:2025,counselor_record:'preserve this saved payload'};
const records=new Map([['dickinson-college:2025',structuredClone(existing)]]),writes=[];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/api\/reports(?:\?|$)/,async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='POST'){
   assert.equal(req.headers()['x-replace-existing'],undefined,'Adding missing years must not opt into replacement');
   const input=validateReports(req.postDataJSON());
   if(input.some(r=>records.has(r.school_id+':'+r.year)))return route.fulfill({status:409,json:{error:'Already exists'}});
   for(const r of input){records.set(r.school_id+':'+r.year,r);writes.push(r);}
   return route.fulfill({json:{imported:input.length}});
  }
  if(url.searchParams.get('school')==='dickinson-college')return route.fulfill({json:{reports:[],total:records.size,years:[...records.values()].map(r=>({year:r.year})),schools:[{school_id:'dickinson-college',school:'Dickinson College',first_year:2025,last_year:2025}]}});
  const response=await route.fetch();const data=await response.json();
  if(data.schools&&!data.schools.some(s=>s.school_id==='dickinson-college'))data.schools.push({school_id:'dickinson-college',school:'Dickinson College',first_year:2025,last_year:2025});
  return route.fulfill({response,json:data});
 });
 await page.route('**/api/sources',route=>{
  const input=route.request().postDataJSON();if(input.mode==='discover')return route.fulfill({json:discovery});
  const index=discovery.documents.findIndex(d=>d.url===input.url);assert(index>=0);console.log("Extracting Dickinson",discovery.documents[index].year);
  return route.fulfill({body:fs.readFileSync(`.sites-runtime/dickinson/${index}.pdf`),contentType:'application/pdf',headers:{'X-Source-URL':encodeURIComponent(input.url)}});
 });
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Add school data',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('School website or PDF link',{exact:true}).fill(discovery.index_url);await dialog.getByRole('button',{name:'Find reports',exact:true}).click();
 await dialog.getByRole('button',{name:'Select all',exact:true}).click();await dialog.getByRole('button',{name:'Extract Section C from 10 PDFs',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.import-draft').length===10,null,{timeout:180000});console.log('All ten drafts extracted');
 await dialog.getByRole('button',{name:'Find reports',exact:true}).waitFor();
 const card=doc=>dialog.locator(`.import-draft[data-source-url="${doc.url}"]`);
 const open=async c=>{if(await c.getAttribute('open')===null)await c.locator(':scope > summary').click();};
 const d2024=card(discovery.documents.find(d=>d.year===2024));await open(d2024);
 for(const [label,value] of [['Applications','7258'],['Students admitted','3055'],['Students enrolled','646']])assert.equal(await d2024.getByLabel(`${label} for 2024`,{exact:true}).inputValue(),value);
 const before=dialog.locator('#import-save-requirements');assert((await before.innerText()).includes('already saved'));assert((await before.innerText()).includes('More than one selected PDF is assigned to Fall 2018'));
 assert(await dialog.getByRole('button',{name:'Save 10 reviewed reports',exact:true}).isDisabled());
 await dialog.getByRole('button',{name:'Exclude saved reports',exact:true}).click();
 assert(!(await dialog.getByRole('checkbox',{name:'Replace existing reports',exact:true}).isChecked()));
 const d2019=card(discovery.documents.find(d=>d.year===2019));await open(d2019);
 await d2019.getByRole('button',{name:'Use archive Fall 2019',exact:true}).click();
 assert((await d2019.locator('pre').allTextContents()).some(t=>t.includes('Fall 2018')),'Original publisher year remains preserved');
 for(const doc of discovery.documents.filter(d=>d.year!==2025)){const c=card(doc);await open(c);await c.getByRole('checkbox',{name:`Reviewed report ${doc.year}`,exact:true}).click();}
 const save=dialog.getByRole('button',{name:'Save 9 reviewed reports',exact:true});assert(await save.isEnabled());assert.equal(writes.length,0);
 await d2024.getByLabel('Applications for 2024',{exact:true}).fill('');assert(await save.isDisabled());assert((await before.innerText()).includes('Fall 2024: enter valid whole-number counts for Applications'));
 await d2024.getByLabel('Applications for 2024',{exact:true}).fill('7258');assert(await save.isEnabled(),'A counselor correction keeps that report reviewed');assert(await d2024.getByRole('checkbox',{name:'Reviewed report 2024',exact:true}).isChecked());
 await page.setViewportSize({width:390,height:844});assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No mobile overflow');
 await page.setViewportSize({width:1440,height:1100});await save.click();await dialog.getByText('9 reviewed reports saved to the shared library.',{exact:true}).waitFor({timeout:60000});
 assert.equal(writes.length,9);assert.deepEqual([...records.values()].map(r=>r.year).sort(),Array.from({length:10},(_,i)=>2016+i));assert.deepEqual(records.get('dickinson-college:2025'),existing);
 for(const doc of discovery.documents.filter(d=>d.year!==2025))assert.equal(records.get('dickinson-college:'+doc.year).sha256,doc.sha256);
 assert(records.get('dickinson-college:2019').warnings.some(w=>w.includes('original C1 year text is preserved')));
 assert.deepEqual(errors,[]);
 console.log('PASS: all ten original Dickinson PDFs in actual import UI; 2024 counts, explicit year correction, all review controls, explained Save blockers, nine validated mock saves, no replacement of 2025, source hashes and mobile layout');
} catch(e) {console.error(e);throw e;} finally {await browser.close();}
