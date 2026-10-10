import backfill from '../data/score-source-backfill.json' with {type:'json'};
import type {Report} from './report-types';
type Entry={sha256:string;metrics:Record<string,number>;corrections:Record<string,{from:number;to:number|null}>;evidence:Report['evidence'];notes:string[]};
/** Hash-pinned C9 score enrichment. Additions fill only unfilled metrics; a
 * reviewed correction applies only while the saved value is still the one
 * reviewed, so later counselor edits are preserved. */
export function savedScoreMetrics(r:Report):Report{
 const entry=(backfill as unknown as Record<string,Entry>)[r.school_id+':'+r.year];
 if(!entry||entry.sha256!==r.sha256)return r;
 for(const [key,value] of Object.entries(entry.metrics))if(r.metrics[key]===undefined&&!r.omitted_metrics?.includes(key)){r.metrics[key]=value;r.evidence[key]={...entry.evidence[key],method:'source-hash-verified score enrichment: '+entry.evidence[key].method};}
 for(const [key,{from,to}] of Object.entries(entry.corrections))if(r.metrics[key]===from){
  if(to===null){delete r.metrics[key];delete r.evidence[key];}
  else{r.metrics[key]=to;r.evidence[key]={...entry.evidence[key],method:'source-hash-verified score correction: '+entry.evidence[key].method};}
 }
 for(const note of entry.notes)if(!r.warnings.includes(note))r.warnings.push(note);
 return r;
}
