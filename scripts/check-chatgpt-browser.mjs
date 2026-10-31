// End-to-end file handoff. All report reads/writes are mocked; production is
// never contacted. Run with npm run dev serving http://127.0.0.1:5173.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:5173';
const report=(year=2025)=>({school:'Fixture College',school_id:'fixture-college',year,report_label:`${year}–${String(year+1).slice(-2)}`,source_url:'https://fixture.edu/cds.pdf',source_type:'pdf',
 metrics:{applicants:10000,admitted:2000,enrolled:500,waitlist_offered:0},evidence:Object.fromEntries(['applicants','admitted','enrolled','waitlist_offered'].map(key=>[key,{section:key==='waitlist_offered'?'C2':'C1',page:5,method:'Explicit overall Total row'}])),factors:[],sections:[{page:5,text:`C1 Fall ${year} | Overall total applicants 10000 | admitted 2000 | enrolled 500. C2 Waitlist offered 0.`,form_fields:[]}],warnings:['Synthetic browser fixture, not a real institution.']});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),writes=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/reports**',async route=>{
 const req=route.request();
 if(req.method()==='POST'){writes.push({records:req.postDataJSON(),replace:req.headers()['x-replace-existing']});return route.fulfill({json:{imported:1}});}
 return route.fulfill({json:{reports:[{...report(2024),metrics:{...report().metrics,admit_rate:20},available_years:1}],schools:[{school_id:'fixture-college',school:'Fixture College',first_year:2024,last_year:2024}],years:[{year:2024}],total:1,report_count:1,offset:0,limit:100}});
});
const upload=async reports=>{
 await page.getByLabel('ChatGPT import file',{exact:true}).setInputFiles({name:'fixture-atlas-import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({atlas_import_version:1,reports}))});
 await page.getByRole('heading',{name:'Review before saving',exact:true}).waitFor();
};
try {
 await page.goto(base);await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();await page.getByRole('button',{name:'Add school data',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Import from ChatGPT',exact:true}).click();
 const guideLink=dialog.getByRole('link',{name:'Download ChatGPT instructions',exact:true});
 const guide=await page.request.get(base+await guideLink.getAttribute('href'));assert.equal(guide.status(),200);assert((await guide.text()).includes('SOURCE TEXT AND EVIDENCE'));
 const template=await page.request.get(base+'/chatgpt-import-template.json');assert.equal(template.status(),200);assert.equal((await template.json()).atlas_import_version,1);
 await page.screenshot({path:'.sites-runtime/chatgpt-import-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Guide overflows mobile dialog');
 await page.screenshot({path:'.sites-runtime/chatgpt-import-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1100});
 await upload([report()]);
 assert.equal(await dialog.getByLabel('School name',{exact:true}).inputValue(),'Fixture College');
 assert.equal(await dialog.getByLabel('Applications for 2025',{exact:true}).inputValue(),'10000');
 assert.equal(await dialog.getByLabel('Reviewed report 2025',{exact:true}).isChecked(),false);
 assert(await dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true}).isDisabled());
 assert((await dialog.innerText()).includes('AI-prepared draft: check every included value'));
 assert.equal(writes.length,0,'Upload does not save');
 await dialog.getByLabel('Applications for 2025',{exact:true}).fill('12500');
 await dialog.getByLabel('Reviewed report 2025',{exact:true}).click();
 await dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true}).click();
 await dialog.getByText('1 reviewed report saved to the shared library.',{exact:true}).waitFor();
 assert.equal(writes.length,1);assert.equal(writes[0].records[0].metrics.applicants,12500);assert.equal(writes[0].records[0].metrics.admit_rate,16);assert.equal(writes[0].replace,undefined);
 assert.deepEqual(writes[0].records[0].sections,report().sections);
 // File approval metadata must never enable Save; existing reports stay blocked.
 await upload([{...report(2024),review_status:'APPROVED',approved:true}]);
 await dialog.getByLabel('Reviewed report 2024',{exact:true}).click();
 assert(await dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true}).isDisabled());
 assert.equal(await dialog.getByLabel('Replace existing reports',{exact:true}).isChecked(),false);
 await dialog.getByLabel('Replace existing reports',{exact:true}).click();
 await dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true}).click();
 await dialog.getByText('1 reviewed report saved to the shared library.',{exact:true}).waitFor();
 assert.equal(writes.length,2);assert.equal(writes[1].replace,'true');
 // Re-uploading the same filename resets approvals and replacement permission.
 const missing=report();delete missing.metrics.enrolled;
 await upload([missing]);assert.equal(await dialog.getByLabel('Replace existing reports',{exact:true}).isChecked(),false);
 await dialog.getByLabel('Reviewed report 2025',{exact:true}).click();assert(await dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true}).isDisabled());
 await dialog.getByLabel('Students enrolled for 2025',{exact:true}).fill('500');assert(await dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true}).isEnabled());
 assert.equal(writes.length,2,'Filling a missing value does not auto-save');
 await dialog.getByLabel('ChatGPT import file',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('```json\n{}\n```')});
 await dialog.getByRole('alert').filter({hasText:'not valid JSON'}).waitFor();assert.equal(await dialog.locator('.import-draft').count(),0);assert.equal(writes.length,2);
 // A batch can exclude saved years while importing new years.
 await upload([report(2024),report(2025)]);
 await dialog.getByRole('button',{name:'Exclude saved reports',exact:true}).click();
 const newest=dialog.locator('.import-draft').filter({hasText:'Fall 2025'});await newest.locator('summary').first().click();
 await dialog.getByLabel('Reviewed report 2025',{exact:true}).click();assert(await dialog.getByRole('button',{name:'Save 1 reviewed report',exact:true}).isEnabled());
 await page.setViewportSize({width:390,height:844});assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Review overflows mobile dialog');
 await page.screenshot({path:'.sites-runtime/chatgpt-review-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: downloadable kit; file upload; forced review; edits and recalculated rates; explicit replacements; missing-count correction; repeat upload; malformed-file recovery; batch exclusion; mobile guide/review layout. All database writes mocked.');
}finally{await browser.close();}
