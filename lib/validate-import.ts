import type {Report} from './report-types';
import {deriveExtraMetrics} from './extract-additional';
import {extraMetrics,metricUnit} from './metric-definitions';
export function validateReports(input:unknown):Report[] {
  const records=Array.isArray(input)?input:[input];
  if(!records.length||records.length>100)throw new Error('Provide between 1 and 100 report records.');
  const seen=new Set<string>();
  for(const r of records) {
    if(!r||typeof r!=='object'||!/^[-a-z0-9]{1,80}$/.test(r.school_id??'')||typeof r.school!=='string'||!r.school.trim()||r.school.length>200||!Number.isInteger(r.year)||r.year<1900||r.year>2100)throw new Error('Each report needs a school_id, school name, and valid fall year.');
    for(const k of ['source_url','index_url']){try{const u=new URL(r[k]);if(!['https:','http:'].includes(u.protocol))throw 0;}catch{throw new Error(`${k} must be a valid HTTP or HTTPS source URL.`);}}
    if(!r.metrics||typeof r.metrics!=='object'||Array.isArray(r.metrics)||!Array.isArray(r.sections)||!r.sections.length||!Array.isArray(r.factors)||!Array.isArray(r.warnings)||!r.evidence||typeof r.evidence!=='object')throw new Error('Reports must follow the supplied import template, including metrics, evidence, factors, sections, and warnings.');
    for(const [key,v] of Object.entries(r.metrics)){if(!/^[a-z0-9_]+$/.test(key)||!['number','string'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))throw new Error('Metric values must be finite numbers or text.');}
    if(r.omitted_metrics!==undefined&&(!Array.isArray(r.omitted_metrics)||r.omitted_metrics.length>500||r.omitted_metrics.some((k:unknown)=>typeof k!=='string'||!/^[a-z0-9_]+$/.test(k)||r.metrics[k]!==undefined)))throw new Error('Reviewed omitted metrics must be valid unfilled metric names.');
    for(const s of r.sections){if(!Number.isInteger(s.page)||s.page<1||typeof s.text!=='string'||!Array.isArray(s.form_fields))throw new Error('Each source section needs a page, text, and form_fields array.');for(const f of s.form_fields)if(typeof f.name!=='string'||typeof f.value!=='string')throw new Error('Invalid source form field.');}
    for(const f of r.factors)if(typeof f.label!=='string'||!['Very important','Important','Considered','Not considered','Needs review'].includes(f.rating)||!Number.isInteger(f.page))throw new Error('Invalid admissions factor.');
    for(const e of Object.values(r.evidence) as any[]){if(!e||typeof e.section!=='string'||typeof e.method!=='string'||e.page!==null&&!Number.isInteger(e.page))throw new Error('Invalid metric evidence.');}
    for(const e of Object.values(r.evidence) as any[])if(e.source_url){try{if(!['http:','https:'].includes(new URL(e.source_url).protocol))throw 0;}catch{throw new Error('Invalid evidence source URL.');}}
    if(r.additional_sections!==undefined){if(!Array.isArray(r.additional_sections))throw new Error('Invalid additional source pages.');for(const s of r.additional_sections)if(!Number.isInteger(s.page)||s.page<1||typeof s.text!=='string'||!Array.isArray(s.form_fields)||s.form_fields.some((f:any)=>typeof f.name!=='string'||typeof f.value!=='string'))throw new Error('Invalid additional source page.');}
    for(const s of [...r.sections,...r.additional_sections??[]]){
      if(s.source_url!==undefined){try{if(!['http:','https:'].includes(new URL(s.source_url).protocol))throw 0;}catch{throw new Error('Invalid source page URL.');}}
      if(s.source_type!==undefined&&!['pdf','xlsx','html','docx'].includes(s.source_type))throw new Error('Invalid source page type.');
      if(s.source_label!==undefined&&typeof s.source_label!=='string')throw new Error('Invalid source page label.');
      if(s.sha256!==undefined&&!/^[a-f0-9]{64}$/.test(s.sha256))throw new Error('Invalid source page hash.');
    }
    if(r.warnings.some((w:unknown)=>typeof w!=='string'))throw new Error('Warnings must be text.');
    if(!['pdf','xlsx','html','docx'].includes(r.source_type)||typeof r.report_label!=='string'||typeof r.review_status!=='string'||typeof r.extracted_at!=='string'||typeof r.sha256!=='string')throw new Error('Missing report metadata; use the template.');
    for(const k of ['applicants','admitted','enrolled','ed_applicants','ed_admitted','waitlist_offered','waitlist_accepted','waitlist_admitted'])if(r.metrics[k]!==undefined&&(typeof r.metrics[k]!=='number'||r.metrics[k]<0||!Number.isInteger(r.metrics[k])))throw new Error(`${k} must be a nonnegative whole number.`);
    if(r.metrics.admitted>r.metrics.applicants||r.metrics.enrolled>r.metrics.admitted)throw new Error('Admissions counts are inconsistent.');
    for(const [k,v] of Object.entries(r.metrics))if((k.endsWith('_rate')||['top_tenth','top_quarter','top_half','rank_submitted','sat_submitted','act_submitted'].includes(k))&&(typeof v!=='number'||v<0||v>100))throw new Error(`${k} must be a percentage between 0 and 100.`);
    for(const [k,v] of Object.entries(r.metrics)){const def=extraMetrics[k];if(!def)continue;if(def.unit==='text'){if(typeof v!=='string')throw new Error(`${k} must be text.`);}else if(typeof v!=='number'||v<0||def.unit==='percent'&&v>100||def.unit==='number'&&!Number.isInteger(v)||def.unit==='gpa'&&(v<.5||v>6))throw new Error(`Invalid ${def.label}.`);}
    for(const [n,d] of [['transfer_admitted','transfer_applicants'],['transfer_enrolled','transfer_admitted'],...['in_state','out_state','international','male','female','another_gender','unknown_gender'].flatMap(s=>[[s+'_admitted',s+'_applicants'],[s+'_enrolled',s+'_admitted']])])if(typeof r.metrics[n]==='number'&&typeof r.metrics[d]==='number'&&r.metrics[n]>r.metrics[d])throw new Error(`${n} exceeds ${d}. Check the source.`);
    for(const [key,n,d,section] of [['admit_rate','admitted','applicants','C1'],['yield_rate','enrolled','admitted','C1'],['ed_rate','ed_admitted','ed_applicants','C21'],['waitlist_rate','waitlist_admitted','waitlist_accepted','C2']]){delete r.metrics[key];delete r.evidence[key];if(typeof r.metrics[n]==='number'&&r.metrics[d]>0){r.metrics[key]=Math.round(r.metrics[n]/r.metrics[d]*100000)/1000;r.evidence[key]={section,page:r.evidence[n]?.page??null,method:'calculated',...(r.evidence[n]?.source_url?{source_url:r.evidence[n].source_url,source_type:r.evidence[n].source_type}:{})};}}
    const id=`${r.school_id}:${r.year}`;if(seen.has(id))throw new Error('Duplicate school/year in import.');seen.add(id);
    deriveExtraMetrics(r);
  }
  return records;
}
