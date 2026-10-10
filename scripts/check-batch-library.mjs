import fs from 'node:fs';import assert from 'node:assert/strict';import './register-ts.mjs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const {validateReports}=await import('../lib/validate-import.ts');
const batches=(process.argv.find(a=>a.startsWith('--batches='))?.split('=')[1]??'a,b,c').split(',');
const records=batches.flatMap(b=>JSON.parse(fs.readFileSync(`data/batch-${b}-reports.json`,'utf8')));
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const get=async path=>{const r=await fetch('http://127.0.0.1:5173'+path,{signal:AbortSignal.timeout(90000)});assert(r.ok,path);return r.json();};
const overview=await get('/api/reports?view=schools');assert(overview.report_count>=seed.length);
for(const sid of new Set(records.map(r=>r.school_id))){const rs=records.filter(r=>r.school_id===sid),actual=await get('/api/reports?school='+sid);assert.equal(actual.report_count,rs.length);assert.deepEqual(actual.years.map(y=>y.year).sort((a,b)=>a-b),rs.map(r=>r.year).sort((a,b)=>a-b));}
const elon=records.find(r=>r.school_id==='elon-university'&&r.year===2002);
assert.equal(elon.metrics.enrolled,1194);assert.equal(elon.evidence.enrolled.section,'B2');
const invalid=structuredClone(elon);invalid.additional_sections[0].source_url='javascript:alert(1)';assert.throws(()=>validateReports([invalid]),/source page URL/);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('textbox',{name:'Search admissions reports'}).fill('Elon');
 const elonCard=page.locator('.school-card').filter({has:page.getByRole('heading',{name:'Elon University',exact:true})});
 await elonCard.waitFor();await elonCard.getByRole('button',{name:'View admissions profile',exact:true}).click();
 await page.getByRole('combobox',{name:'Fall cohort',exact:true}).click();await page.getByRole('option',{name:'2002',exact:true}).click();
 await page.getByRole('heading',{name:'Elon University · Fall 2002',exact:true}).waitFor();
 const enrolled=page.locator('.facts>div').filter({has:page.locator('dt').filter({hasText:'Students enrolled'})}).first();
 assert.equal(await enrolled.locator('a').getAttribute('href'),elon.evidence.enrolled.source_url+'#page=2');
 await page.getByRole('tab',{name:'Source pages',exact:true}).click();
 const links=await page.locator('.source-page summary a').evaluateAll(nodes=>nodes.map(n=>n.href));
 assert(links.includes(elon.evidence.enrolled.source_url+'#page=2'));
 assert(new Set(links.map(l=>l.split('#')[0])).size>1,'Separate section files have distinct original links');
 await page.getByRole('textbox',{name:'Find in Section C'}).fill('Source:');assert(await page.locator('.source-page').count()>0);
 assert.deepEqual(errors,[]);console.log('PASS: new school/year coverage, verified B2 enrollment citation, separate section-file raw links, raw search, and invalid URL rejection');
}finally{await browser.close();}
