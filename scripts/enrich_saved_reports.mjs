import fs from 'node:fs';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))return next(s+'.ts',c);throw e;}}});
const {enrichMetrics}=await import('../lib/extract-additional.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const snapshot='.sites-runtime/metrics-existing.json';
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const originals=fs.existsSync(snapshot)?JSON.parse(fs.readFileSync(snapshot,'utf8')):seed;
const manifest=JSON.parse(fs.readFileSync('.sites-runtime/metrics/manifest.json','utf8'));
const output=[];
for(const original of originals){
 const r=structuredClone(original),doc=manifest.find(d=>d.school_id===r.school_id&&d.year===r.year);
 const pages=doc?.pages_file?JSON.parse(fs.readFileSync(doc.pages_file,'utf8')):r.sections.map(p=>({...p,lines:p.text.split('\n').map(text=>({text,words:[]}))}));
 enrichMetrics(r,pages);
 validateReports([r]);
 for(const [key,value] of Object.entries(original.metrics))assert.deepEqual(r.metrics[key],value,`${r.school_id} ${r.year}: existing ${key} changed`);
 const added=Object.keys(r.metrics).filter(k=>original.metrics[k]===undefined);
 if(added.length){r.warnings.push('Additional CDS metrics were source-extracted. Aid, costs, retention, and graduation can describe different cohorts or reporting years; see the year labels and original pages.');output.push(r);console.log(r.school_id,r.year,added.length+' additional metrics');}
}
const merged=new Map(seed.map(r=>[r.school_id+':'+r.year,r]));
for(const r of output)if(merged.has(r.school_id+':'+r.year))merged.set(r.school_id+':'+r.year,r);
fs.writeFileSync('data/reports.json',JSON.stringify([...merged.values()],null,2));
fs.writeFileSync('.sites-runtime/metrics-enriched.json',JSON.stringify(output,null,2));
console.log('Enriched records:',output.length,'; existing figures preserved');
