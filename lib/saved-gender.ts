import backfill from '../data/gender-source-backfill.json' with {type:'json'};
import {enrichSavedGender} from './extract-gender';
import type {Report} from './report-types';
import {genderCategories} from './gender-metrics';
/** Hash-pinned enrichment leaves stored counselor corrections untouched. */
export function savedGenderMetrics(r:Report):Report{
 const entry=(backfill as Record<string,{sha256:string;metrics:Record<string,number>;evidence:Report['evidence'];notes:string[]}>)[r.school_id+':'+r.year];
 if(!entry||entry.sha256!==r.sha256)enrichSavedGender(r);
 else{
  for(const [key,value] of Object.entries(entry.metrics))if(r.metrics[key]===undefined){r.metrics[key]=value;r.evidence[key]={...entry.evidence[key],method:'source-hash-verified gender enrichment: '+entry.evidence[key].method};}
  for(const note of entry.notes)if(!r.warnings.includes(note))r.warnings.push(note);
 }
 for(const kind of ['applicants','admitted','enrolled']){
  const total=genderCategories.reduce((a,[g])=>a+(typeof r.metrics[g+'_'+kind]==='number'?Number(r.metrics[g+'_'+kind]):0),0);
  if(typeof r.metrics[kind]==='number'&&total>Number(r.metrics[kind])){
   const note=`C1 ${kind}: reported/reviewed gender counts sum to ${total.toLocaleString('en-US')}, exceeding the saved overall count ${Number(r.metrics[kind]).toLocaleString('en-US')}. The saved overall count is preserved; review the source before using this report's overall rate.`;
   if(!r.warnings.includes(note))r.warnings.push(note);
  }
 }
 return r;
}
