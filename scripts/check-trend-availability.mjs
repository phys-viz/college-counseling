import fs from 'node:fs';import assert from 'node:assert/strict';import './register-ts.mjs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const {trendYearRanges}=await import('../lib/trend-types.ts');
assert.equal(trendYearRanges([2015,2010,2011,2010,2013]),'2010–2011, 2013, 2015');assert.equal(trendYearRanges([]),'');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const choose=async(label,name)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:true}).click();};
const ready=async()=>{await page.getByRole('button',{name:'Download SVG',exact:true}).waitFor();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Download SVG')?.disabled===false);};
try{
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'View admissions profile',exact:true}).first().waitFor();await page.getByRole('tab',{name:'Trends',exact:true}).click();await ready();
 assert.equal(await page.locator('.view-header>.muted').innerText(),'6 years · 6 source reports');
 assert.equal(await page.locator('footer a').count(),1);assert((await page.locator('footer').innerText()).includes('Cornell University archive'));assert(!(await page.locator('footer').innerText()).includes('South Carolina'));
 await choose('Compare with','University of South Carolina (Columbia)');await ready();await page.waitForFunction(()=>document.querySelectorAll('footer a').length===2);
 assert.equal(await page.locator('.view-header>.muted').innerText(),'6 years · 12 source reports');assert((await page.locator('footer').innerText()).includes('South Carolina'));
 await choose('Compare with','No comparison');await ready();assert.equal(await page.locator('footer a').count(),1);assert(!(await page.locator('footer').innerText()).includes('South Carolina'));
 const actual=await(await page.request.get('http://127.0.0.1:5173/api/trends?school=cornell&from=2010&to=2015')).json();
 assert(actual.schools.every(s=>typeof s.index_url==='string'),'Latest saved archive metadata is available independently of chosen years');
 // Read-only response fixtures: no Harvard reports, partial Cornell metrics, then partial Harvard values.
 let fixtureMode='missing';
 await page.route('**/api/trends?*',async route=>{
  const params=new URL(route.request().url()).searchParams,ids=params.getAll('school'),from=Number(params.get('from')),to=Number(params.get('to'));
  let cornell=structuredClone(actual.reports).filter(r=>r.year>=from&&r.year<=to);
  if(fixtureMode==='partial')cornell=cornell.map(r=>r.year===2012?{...r,metrics:{...r.metrics,applicants:undefined}}:r);
  const harvard=fixtureMode==='harvard-values'&&ids.includes('harvard-test')?cornell.filter(r=>r.year!==2012).map(r=>({...r,school_id:'harvard-test',school:'Harvard University',metrics:{...r.metrics,applicants:10000+r.year},index_url:'https://example.edu/harvard-cds'})):[];
  await route.fulfill({json:{reports:[...cornell.filter(r=>ids.includes(r.school_id)),...harvard],schools:[...actual.schools,{school_id:'harvard-test',school:'Harvard University',index_url:'https://example.edu/harvard-cds'}]}});
 });
 await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2016');await ready();await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2015');await ready();
 await choose('Metric','Applications');await choose('Compare with','Harvard University');await ready();
 const noData='Harvard University: no reported Applications values for 2010–2015. No line is drawn.';
 await page.getByText(noData,{exact:true}).waitFor();assert((await page.locator('.school-legend-item').nth(1).innerText()).includes('No reported data'));assert.equal(await page.locator('.trend-point').count(),6);
 assert.equal(await page.locator('.view-header>.muted').innerText(),'6 years · 6 source reports');
 assert.equal(await page.locator('footer a').count(),2);assert.equal(await page.getByRole('link',{name:'Harvard University archive',exact:true}).getAttribute('href'),'https://example.edu/harvard-cds');
 await page.locator('.trend-point').first().focus();const detail=await page.locator('.trend-focus-details').innerText();assert(detail.includes('Harvard University'));assert(detail.includes('Not reported'));
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download SVG',exact:true}).click();const result=await waiting;await result.saveAs('.sites-runtime/harvard-missing.svg');const exportedText=await page.evaluate(xml=>Array.from(new DOMParser().parseFromString(xml,'image/svg+xml').querySelectorAll('text')).map(n=>n.textContent).join(' '),fs.readFileSync('.sites-runtime/harvard-missing.svg','utf8'));assert(exportedText.includes(noData));
 await choose('Y-axis view','Custom range');await page.getByRole('spinbutton',{name:'Y-axis minimum',exact:true}).fill('50000');await page.getByRole('spinbutton',{name:'Y-axis maximum',exact:true}).fill('60000');
 await page.waitForFunction(()=>document.querySelectorAll('.trend-point').length===0);
 assert((await page.locator('.trend-availability').innerText()).includes('Cornell University: Applications values for 2010–2015 are outside the custom Y-axis range.'));assert((await page.locator('.trend-availability').innerText()).includes(noData));assert((await page.locator('.school-legend-item').first().innerText()).includes('All reported values outside Y-axis range'));assert.equal(await page.locator('.trend-data .reporting-context').filter({hasText:'Outside Y-axis range'}).count(),6);
 await page.setViewportSize({width:390,height:844});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Availability messages, count and archive links fit mobile');await page.screenshot({path:'.sites-runtime/trend-availability-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Reset axis',exact:true}).click();assert.equal(await page.locator('.trend-point').count(),6);assert(!(await page.locator('.trend-availability').innerText()).includes('outside the custom'));
 fixtureMode='partial';await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2016');await ready();await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2015');await ready();
 assert((await page.locator('.trend-availability').innerText()).includes('Cornell University: missing Applications values for 2012. This year remains a gap.'));assert.equal(await page.locator('.trend-point').count(),5);assert.equal(await page.locator('.trend-data .trend-source').count(),5);assert.equal(await page.locator('.view-header>.muted').innerText(),'6 years · 6 source reports','Missing metric is distinct from missing source report');
 fixtureMode='harvard-values';await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2016');await ready();await page.getByRole('spinbutton',{name:'To year',exact:true}).fill('2015');await ready();
 assert((await page.locator('.trend-availability').innerText()).includes('Harvard University: missing Applications values for 2012. This year remains a gap.'));assert.equal(await page.locator('.view-header>.muted').innerText(),'6 years · 11 source reports');
 await choose('Compare with','No comparison');await ready();assert.equal(await page.locator('.trend-availability').count(),0);assert.equal(await page.locator('footer a').count(),1);
 fixtureMode='missing';await choose('Trend school','Harvard University');await page.getByRole('heading',{name:'No reported values in this range',exact:true}).waitFor();assert((await page.locator('.empty').innerText()).includes(noData));assert.equal(await page.locator('footer a').count(),1);assert.equal(await page.locator('.view-header>.muted').innerText(),'6 years · 0 source reports');
 assert.deepEqual(errors,[]);console.log('PASS: selected-source counts and archives, comparison removal, missing school/years, missing metric vs missing report, off-axis vs absent values, hover, exported annotations, empty state, mobile layout.');
}catch(e){console.log({errors,body:(await page.locator('body').innerText()).slice(0,2500)});await page.screenshot({path:'.sites-runtime/trend-availability-failure.png',fullPage:true});throw e;}finally{await browser.close();}
