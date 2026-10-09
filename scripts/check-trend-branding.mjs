import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const choose=async(label,name)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:true}).click();};
const ready=async()=>{await page.getByRole('button',{name:'Download PNG',exact:true}).waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Download PNG'))?.disabled);};
const download=async(label,path)=>{const p=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();await(await p).saveAs(path);return fs.readFileSync(path);};
try{
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();await page.getByRole('tab',{name:'Trends',exact:true}).click();await ready();
 const metric=page.getByRole('combobox',{name:'Metric',exact:true});await metric.click();
 const popup=page.locator('.metric-picker-popup');
 assert.deepEqual(await popup.locator('.metric-group-heading').allTextContents(),['Admissions','Test scores','Academic profile','Costs & financial aid','Student outcomes','Transfer admissions']);
 for(const group of await popup.locator('[cmdk-group]').all()){const labels=await group.getByRole('option').allTextContents();assert.deepEqual(labels,[...labels].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})));}
 assert.equal(new Set(await popup.getByRole('option').evaluateAll(items=>items.map(item=>item.getAttribute('data-value')))).size,35);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.metric-picker-popup')).opacity==='1');await page.screenshot({path:'.sites-runtime/grouped-metrics-desktop.png'});
 const search=page.getByRole('combobox',{name:'Search metrics',exact:true});await search.fill('SAT');assert.equal(await popup.getByRole('option').count(),5);assert.deepEqual(await popup.locator('.metric-group-heading').allTextContents(),['Test scores']);
 await search.fill('does-not-exist');await popup.getByText('No matching metrics.',{exact:true}).waitFor();assert.equal(await popup.getByRole('option').count(),0);
 await search.fill('ACT composite');await search.press('ArrowDown');await search.press('Enter');await page.getByRole('heading',{name:'ACT composite · middle 50%',exact:true}).waitFor();assert.equal(await metric.getAttribute('aria-expanded'),'false');
 await metric.click();assert.equal(await search.inputValue(),'');await search.press('Escape');assert.equal(await metric.getAttribute('aria-expanded'),'false');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Metric');
 await choose('Metric','Admission rate');await ready();
 assert.equal(await page.locator('.school-legend-item[data-school=cornell]').evaluate(el=>getComputedStyle(el).color),'rgb(179, 27, 27)');
 assert(await page.locator('.school-logo').evaluate(el=>el.complete&&el.naturalWidth>0));
 assert.equal(await page.locator('.trend-point circle[stroke]').first().getAttribute('stroke'),'#B31B1B');
 const svg=(await download('Download SVG','.sites-runtime/branded-cornell.svg')).toString();assert(svg.includes('data:image/png;base64,'));assert(svg.includes('Cornell University'));
 const png=await download('Download PNG','.sites-runtime/branded-cornell.png');assert.equal(png.subarray(1,4).toString(),'PNG');assert(png.length>20000);
 await choose('Compare with','University of South Carolina (Columbia)');await page.waitForFunction(()=>document.querySelectorAll('.trend-point').length===12);assert.equal(await page.locator('.school-logo').count(),2);
 assert.equal(await page.locator('.trend-point path[stroke]').first().getAttribute('stroke'),'#73000A');assert.equal(await page.locator('.school-legend-item').nth(1).locator('line').getAttribute('stroke-dasharray'),'6 4');
 await page.setViewportSize({width:390,height:844});await metric.click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.metric-picker-popup')).opacity==='1');assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Mobile picker overflow');const bounds=await popup.boundingBox();assert(bounds.y>=15&&bounds.y+bounds.height<=829,'Mobile popup must fit the viewport');await page.screenshot({path:'.sites-runtime/grouped-metrics-mobile.png'});await search.press('Escape');assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Mobile legend overflow');
 await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'.sites-runtime/branded-trends-desktop.png',fullPage:true});
 const brands=await page.evaluate(async()=>{const {schoolBrand}=await import('/lib/school-branding.ts');return [schoolBrand('harvard-university'),schoolBrand('harvard'),schoolBrand('cornell'),schoolBrand('unknown-school','Unknown School'),schoolBrand('unknown-school','Unknown School')];});assert.equal(brands[0].color,'#A51C30');assert.deepEqual(brands[0],brands[1]);assert.deepEqual(brands[3],brands[4]);assert.equal(brands[3].logo,undefined);
 // Synthetic read-only chart responses exercise similarly colored schools and future imports.
 await page.route('**/api/trends?*',async route=>{const response=await route.fetch(),data=await response.json(),params=new URL(route.request().url()).searchParams,ids=params.getAll('school');const primary=data.reports.filter(r=>r.school_id==='cornell');const clones=ids.filter(id=>['harvard-university','future-school'].includes(id)).flatMap(id=>primary.map(r=>({...r,school_id:id,school:id==='harvard-university'?'Harvard University':'Future School'})));await route.fulfill({json:{...data,reports:[...data.reports,...clones],schools:[...data.schools,{school_id:'harvard-university',school:'Harvard University'},{school_id:'future-school',school:'Future School'}]}});});
 await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2016');await page.waitForFunction(()=>document.querySelectorAll('.trend-data tbody tr').length===7);await choose('Compare with','Harvard University');await page.waitForFunction(()=>document.querySelectorAll('.school-legend-item[data-school=harvard]').length===1);assert.equal(await page.locator('.school-legend-item[data-school=harvard]').evaluate(el=>getComputedStyle(el).color),'rgb(165, 28, 48)');assert.equal(await page.locator('.school-logo').count(),2);
 const pair=(await download('Download SVG','.sites-runtime/branded-comparison.svg')).toString();assert.equal((pair.match(/data:image\/png;base64,/g)||[]).length,2);assert(pair.includes('stroke-dasharray="6 4"'));
 await choose('Compare with','Future School');await page.locator('.school-initials').waitFor();assert.equal(await page.locator('.school-initials').innerText(),'FS');await download('Download PNG','.sites-runtime/branded-fallback.png');
 assert.deepEqual(errors,[]);console.log('PASS: grouped alphabetical picker, search/empty states, keyboard selection/focus, school colors/logos, portable exports, similar-color comparisons, stable unknown-school fallback, mobile layout');
}finally{await browser.close();}
