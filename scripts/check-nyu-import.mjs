import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const {enrichMetrics}=await import('../lib/extract-additional.ts');
for(let year=2018;year<=2025;year++){
 const f=JSON.parse(fs.readFileSync(`scripts/fixtures/nyu/${year}.json`,'utf8'));
 const r=normalizePDF(f.pages,{url:f.source_url,title:String(year),year},'https://www.nyu.edu',f.sha256);
 assert.equal(r.year,f.expected.detected_year);
 for(const [key,value] of Object.entries(f.expected.metrics))if(!['retention_rate','tuition_private','housing_food','cost_year','need_met'].includes(key))assert.equal(r.metrics[key],value,`${year} ${key}`);
 assert.equal(r.factors.length,f.expected.factor_count,`${year} C7`);
 if(year===2018)assert.equal(r.metrics.sat_25,undefined,'Subscore percentiles are not added into a composite');
 if(year===2019)assert(r.warnings.some(w=>w.includes('archive link suggests')),'C1 year conflict needs explicit review');
 if(year===2023){assert(r.warnings.some(w=>w.includes('ambiguous total')));assert.equal(r.metrics.in_state_applicants,undefined);assert.equal(r.factors.find(f=>f.label==='Academic GPA').rating,'Very important');assert.equal(r.factors.find(f=>f.label==='Religious affiliation/commitment').rating,'Not considered');}
 if(year===2025)assert.equal(r.metrics.ed_deadline,'11/01/2025','Source dates are not shifted to an assumed application cycle');
 console.log('PASS: NYU',year,'C1, C7, test percentiles, GPA, evidence');
}
const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/nyu/2022.json','utf8'));
const parse=p=>normalizePDF(p,{url:fixture.source_url,title:'NYU',year:2022},'https://www.nyu.edu',fixture.sha256);
const broken=structuredClone(fixture.pages);
const full=broken.flatMap(p=>p.lines).find(l=>/^Total full-time.*men.*enrolled/i.test(l.text));full.text=full.text.replace('2,419','2,420');
assert.equal(parse(broken).metrics.enrolled,undefined,'An unreconciled merged total must not yield the part-time-only count');
const fractional=structuredClone(fixture.pages);fractional.flatMap(p=>p.lines).find(l=>/^Total.*men.*applied/i.test(l.text)).text+=' .5';assert.equal(parse(fractional).metrics.applicants,undefined,'Fractional counts cannot become students');
const reviewed=JSON.parse(fs.readFileSync('data/reports.json','utf8')).filter(r=>r.school_id==='new-york-university');
assert.equal(reviewed.length,8);validateReports(structuredClone(reviewed));
for(const r of reviewed){assert.equal(r.year,Number(r.report_label.slice(0,4)));assert.match(r.sha256,/^[0-9a-f]{64}$/);assert(r.warnings.some(w=>w.includes('archived copy')));}
assert.equal(reviewed.find(r=>r.year===2019).year,2019);assert(reviewed.find(r=>r.year===2019).warnings.some(w=>w.includes('Publisher inconsistency')));
// Representative sources establish that the new C1/factor rules preserve other schools.
for(const name of ['cornell-2010','cornell-2025','south-carolina-2025','clemson-2024','washington-and-lee-university-2025']){
 const f=JSON.parse(fs.readFileSync(`scripts/fixtures/metrics/${name}.json`,'utf8'));
 const r=name.startsWith('washington-and-lee')?normalizePDF(f.pages,{url:f.source_url,title:name,year:f.year},f.source_url,f.sha256):enrichMetrics({metrics:structuredClone(f.baseline),evidence:{},sections:[],additional_sections:[],warnings:[]},f.pages);
 for(const key of ['applicants','admitted','enrolled'])if(f.baseline[key]!==undefined)assert.equal(r.metrics[key],f.baseline[key],`${name} ${key}`);
}
console.log('PASS: ambiguous merged cells rejected, source inconsistencies preserved, eight reviewed records, representative existing schools');
