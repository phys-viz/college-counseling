// Run collect_gender_sources.py first. Additive source-hash-pinned enrichment.
import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {enrichSavedGender}=await import('../lib/extract-gender.ts');
const {isGenderMetric}=await import('../lib/gender-metrics.ts');
const saved=JSON.parse(fs.readFileSync('.sites-runtime/shared-before-gender.json','utf8'));
const reviewed=JSON.parse(fs.readFileSync('data/gender-source-review.json','utf8'));
const backfill={};
for(const r of saved){
 let parsed;const path=`.sites-runtime/gender-sources/${r.school_id}-${r.year}-pages.json`;
 if(fs.existsSync(path))try{parsed=normalizePDF(JSON.parse(fs.readFileSync(path,'utf8')),{url:r.source_url,year:r.year},r.index_url,r.sha256);}catch{}
 if(!parsed)parsed=enrichSavedGender(structuredClone(r));
 const metrics=Object.fromEntries(Object.entries(parsed.metrics).filter(([k,v])=>isGenderMetric(k)&&!k.endsWith('_rate')&&typeof v==='number'));
 const evidence=Object.fromEntries(Object.keys(metrics).map(k=>[k,parsed.evidence[k]]));const notes=[];
 if(r.source_type!=='pdf')for(const e of Object.values(evidence))e.method=e.method.replaceAll('PDF',r.source_type==='xlsx'?'worksheet':'HTML');
 for(const [n,d] of [['admitted','applicants'],['enrolled','admitted']])for(const group of ['male','female','another_gender','unknown_gender'])if(metrics[group+'_'+n]>metrics[group+'_'+d]){delete metrics[group+'_'+n];delete evidence[group+'_'+n];notes.push(`C1 ${group} ${n}: the source's group counts are inconsistent; left unfilled.`);}
 const checked=reviewed[r.school_id+':'+r.year];
 if(checked&&checked.sha256===r.sha256){
  for(const key of checked.omit??[]){delete metrics[key];delete evidence[key];}
  for(const [key,value] of Object.entries(checked.metrics??{})){metrics[key]=value;evidence[key]={section:'C1',page:checked.page,method:'visually reviewed original source image'};}
  notes.push(...checked.notes);
 }
 backfill[r.school_id+':'+r.year]={sha256:r.sha256,metrics,evidence,notes};
 console.log(r.school_id,r.year,JSON.stringify(metrics));
}
fs.writeFileSync('data/gender-source-backfill.json',JSON.stringify(backfill,null,2)+'\n');
console.log('Source-pinned enrichment prepared for',saved.length,'records. No saved core values changed.');
