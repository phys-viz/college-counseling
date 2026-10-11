import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {validateReports}=await import('../lib/validate-import.ts');
const {savedScoreMetrics}=await import('../lib/saved-scores.ts');
const seed=JSON.parse(fs.readFileSync(new URL('../data/reports.json',import.meta.url),'utf8'));
// Validate the current source-reviewed view, including the reviewed C9 fixes.
const reviewed=structuredClone(seed).map(savedScoreMetrics);let validated=0;
for(let i=0;i<reviewed.length;i+=100)validated+=validateReports(reviewed.slice(i,i+100)).length;
assert.equal(validated,seed.length);
const template=JSON.parse(fs.readFileSync(new URL('../public/import-template.json',import.meta.url),'utf8'));
const valid=validateReports(structuredClone(template));
assert.equal(valid[0].metrics.admit_rate,20);
assert.equal(valid[0].metrics.yield_rate,25);
for(const mutate of [r=>r.source_url='javascript:alert(1)',r=>r.metrics.enrolled=50000,r=>r.metrics.applicants=-1,r=>r.factors=[{label:'Essay',rating:'Invented',page:1}],r=>r.sections=[]]){
 const invalid=structuredClone(template); mutate(invalid[0]);assert.throws(()=>validateReports(invalid));
}
assert.throws(()=>validateReports([template[0],template[0]]));
console.log('PASS: all seed records, new-school import, calculated rates, invalid links/counts/factors/source, duplicate records');
