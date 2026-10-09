import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const review=JSON.parse(fs.readFileSync('data/new-archive-source-review.json','utf8'));
for(const [sid,years] of Object.entries(review))for(const [year,counts] of Object.entries(years)){
 const f=JSON.parse(fs.readFileSync(`scripts/fixtures/new-archives/${sid}-${year}.json`,'utf8'));
 const r=normalizePDF(f.pages,{url:f.source_url,title:'CDS '+year,year:Number(year)},f.index_url,f.sha256);
 for(const [i,key] of ['applicants','admitted','enrolled'].entries()){
  if(sid==='the-college-of-new-jersey'&&year==='2023'&&key!=='applicants'){assert.equal(r.metrics[key],undefined);assert(r.warnings.some(w=>w.includes(key)&&w.includes('disagree')));}
  else assert.equal(r.metrics[key],counts[i],`${sid} ${year} ${key}`);
 }
 assert.equal(r.year,sid==='university-of-michigan-ann-arbor'&&year==='2018'?2017:Number(year));
 assert.equal(r.sha256,f.sha256);console.log('PASS:',sid,year);
}
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const newRecords=seed.filter(r=>Object.keys(review).includes(r.school_id));assert.equal(newRecords.length,43);validateReports(structuredClone(newRecords));
const vn=newRecords.find(r=>r.school_id==='villanova-university'&&r.year===2024);
assert.equal(vn.metrics.sat_25,1410);assert.equal(vn.metrics.sat_75,1490);assert.equal(vn.metrics.act_25,32);assert.equal(vn.metrics.act_75,34);
assert.equal(vn.metrics.male_applicants,10207);assert.equal(vn.metrics.female_applicants,13046);assert.equal(vn.metrics.unknown_gender_applicants,3);assert.equal(vn.metrics.male_enrolled,773);assert.equal(vn.metrics.female_enrolled,967);
const um=newRecords.find(r=>r.school_id==='university-of-michigan-ann-arbor'&&r.year===2024);
assert.equal(um.metrics.male_applicants,48101);assert.equal(um.metrics.female_applicants,50209);assert.equal(um.metrics.another_gender_applicants,undefined,'A blank middle column is not zero or the total');
const latest=newRecords.find(r=>r.school_id==='university-of-michigan-ann-arbor'&&r.year===2025);assert.equal(latest.factors.length,18);assert.equal(latest.factors.find(f=>f.label==='Class rank').rating,'Not considered');
assert.equal(latest.metrics.unknown_gender_applicants,undefined,'Unfilled unknown category stays missing');
const nj=newRecords.find(r=>r.school_id==='the-college-of-new-jersey'&&r.year===2023);assert.equal(nj.metrics.male_enrolled,657);assert.equal(nj.metrics.female_enrolled,890);assert(nj.warnings.some(w=>w.includes('internally inconsistent')));
console.log('PASS: 43 validated records, labeled percentiles, distinct total/gender columns, zero versus missing, Unicode factor marks and publisher inconsistencies');
