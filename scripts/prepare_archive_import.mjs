import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateReports} from '../lib/validate-import.ts';
const input=JSON.parse(fs.readFileSync('.sites-runtime/archive-import/reviewed.json','utf8'));
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const snapshot='.sites-runtime/archive-existing-reports.json';
const existing=fs.existsSync(snapshot)?JSON.parse(fs.readFileSync(snapshot,'utf8')):seed;
// Keep the corrected shared 2025 report intact, including any counselor edits.
const preserved=existing.find(r=>r.school_id==='washington-and-lee-university'&&r.year===2025);
if(preserved){const i=input.findIndex(r=>r.school_id===preserved.school_id&&r.year===preserved.year);input[i]=structuredClone(preserved);}
assert.equal(input.length,39);
const reviewed=validateReports(input);
for(const [school,start,count] of [['clemson',2008,18],['washington-and-lee-university',2005,21]]){
 const years=reviewed.filter(r=>r.school_id===school).map(r=>r.year).sort((a,b)=>a-b);
 assert.deepEqual(years,Array.from({length:count},(_,i)=>start+i));
}
const merged=new Map(seed.map(r=>[`${r.school_id}:${r.year}`,r]));
for(const r of reviewed)merged.set(`${r.school_id}:${r.year}`,r);
for(const r of seed.filter(r=>!['clemson','washington-and-lee-university'].includes(r.school_id)))assert.deepEqual(merged.get(`${r.school_id}:${r.year}`),r);
const reports=[...merged.values()].sort((a,b)=>a.school_id.localeCompare(b.school_id)||b.year-a.year);
assert.equal(reports.length,92);
fs.writeFileSync('.sites-runtime/archive-reviewed-reports.json',JSON.stringify(reviewed,null,2));
fs.writeFileSync('data/reports.json',JSON.stringify(reports,null,2));
console.log('PASS: 39 reviewed archive records; 92 seed records; existing Cornell/USC data and W&L 2025 preserved');
