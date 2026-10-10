import fs from 'node:fs';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {validateReports}=await import('../lib/validate-import.ts');
const selected=(process.argv.find(a=>a.startsWith('--batches='))?.split('=')[1]??'a,b,c').split(',');
assert(selected.every(b=>/^[a-f]$/.test(b)));
const check=process.argv.includes('--check');
const originals=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const merged=new Map(originals.map(r=>[`${r.school_id}:${r.year}`,r]));
let added=0,checked=0;
for(const batch of selected) {
 const records=JSON.parse(fs.readFileSync(`data/batch-${batch}-reports.json`,'utf8'));
 const seen=new Set();
 for(const r of records) {
  const id=`${r.school_id}:${r.year}`;
  assert(!seen.has(id),`Duplicate ${id} in batch ${batch}`);seen.add(id);
  assert(/^[a-f0-9]{64}$/.test(r.sha256),`${id} source hash`);
  assert(r.sections.length&&r.sections.some(s=>s.text.trim()),`${id} retained source`);
  const validated=validateReports([structuredClone(r)])[0];
  for(const k of ['applicants','admitted','enrolled'])if(typeof validated.metrics[k]==='number')assert(validated.evidence[k]?.page>0,`${id} ${k} evidence`);
  const existing=merged.get(id);
  if(check) {
   assert(existing,`${id} is missing from seed`);
   assert.equal(existing.source_url,r.source_url,`${id} reviewed source URL`);
   assert.equal(existing.sha256,r.sha256,`${id} reviewed source bytes`);
   for(const k of ['applicants','admitted','enrolled','admit_rate','yield_rate'])assert.equal(existing.metrics[k],validated.metrics[k],`${id} ${k}`);
  } else if(!existing){merged.set(id,validated);added++;}
  checked++;
 }
 console.log(`PASS: batch ${batch}, ${records.length} reviewed records`);
}
for(const r of originals)assert.deepEqual(merged.get(`${r.school_id}:${r.year}`),r,'Existing reviewed records must remain unchanged');
if(!check)fs.writeFileSync('data/reports.json',JSON.stringify([...merged.values()].sort((a,b)=>a.school_id.localeCompare(b.school_id)||b.year-a.year),null,2)+'\n');
console.log(`PASS: ${checked} verified records; ${added} added; ${originals.length} previous seed records preserved`);
