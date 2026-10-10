// Source-hash-pinned C9 score enrichment for saved reports. Replays the shared
// parser over each seed report's stored Section C text: new score metrics are
// additive; changing or removing a saved value requires an entry in
// data/score-source-review.json, and is applied only while the saved value is unchanged.
import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const reviewed=JSON.parse(fs.readFileSync('data/score-source-review.json','utf8'));
const scoreKey=k=>/^(?:sat|act|reading|math)_(?:25|50|75|band_\w+)$/.test(k);
const backfill={};let added=0,corrected=0;const unreviewed=[];
for(const r of seed){
 const id=r.school_id+':'+r.year,review=reviewed[id];
 const byPage=new Map();for(const s of [...(r.sections??[]),...(r.additional_sections??[])])byPage.set(s.page,(byPage.has(s.page)?byPage.get(s.page)+'\n':'')+s.text);
 const pages=[...byPage].sort((a,b)=>a[0]-b[0]).map(([page,text])=>({page,text,lines:text.split('\n').map(t=>({text:t,words:[]})),form_fields:[]}));
 let parsed;try{parsed=normalizePDF(pages,{url:r.source_url,title:'CDS'+r.year,year:r.year},r.index_url,r.sha256);}catch{continue;}
 const metrics={},evidence={},corrections={};
 for(const [key,value] of Object.entries(parsed.metrics)){
  if(!scoreKey(key)||typeof value!=='number')continue;
  if(r.metrics[key]===undefined){metrics[key]=value;evidence[key]={...parsed.evidence[key],section:'C9'};added++;}
  else if(r.metrics[key]!==value){if(review?.correct?.includes(key)){corrections[key]={from:r.metrics[key],to:value};evidence[key]={...parsed.evidence[key],section:'C9'};corrected++;}else unreviewed.push(`${id} ${key}: saved ${r.metrics[key]}, source parse ${value}`);}
 }
 for(const key of review?.correct??[])if(!(key in corrections)){
  if(parsed.metrics[key]!==undefined||r.metrics[key]===undefined)throw new Error(`${id} ${key}: reviewed correction no longer matches the saved record or parser`);
  corrections[key]={from:r.metrics[key],to:null};corrected++;
 }
 if(Object.keys(metrics).length||Object.keys(corrections).length||review?.note)backfill[id]={sha256:r.sha256,metrics,corrections,evidence,notes:review?.note?[review.note]:[]};
}
for(const id of Object.keys(reviewed))if(!backfill[id])throw new Error(`${id}: reviewed entry has no matching seed report`);
if(unreviewed.length)throw new Error('Unreviewed differences from saved values:\n'+unreviewed.join('\n'));
fs.writeFileSync('data/score-source-backfill.json',JSON.stringify(backfill)+'\n');
console.log(`Score enrichment for ${Object.keys(backfill).length} reports: ${added} added, ${corrected} reviewed corrections. Saved records unchanged.`);
