import type {Report,SourcePage} from './report-types';
import {labels} from './report-types';
import {metricUnit} from './metric-definitions';
import {validateReports} from './validate-import';
import {factorNames} from './extract-pdf';

export const chatGPTImportLimit=5_000_000;
export const aiReviewWarning='AI-prepared draft: check every included value, source reference, school, and fall year against the original before saving. AI output is not verified source evidence.';
const textMetrics=new Set(['test_policy','rd_deadline','ed_deadline','ed_notification']);
const calculated=new Set(['admit_rate','yield_rate','ed_rate','waitlist_rate']);
const slug=(name:string)=>name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
function fail(message:string):never {throw new Error(message);}
const object=(value:unknown,label:string):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail(`${label} must be a JSON object.`);
const string=(value:unknown,label:string)=>typeof value==='string'?value:fail(`${label} must be text.`);
function url(value:unknown,label:string) {
  const text=string(value,label);
  try {const u=new URL(text);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/(^|\.)example\.(edu|com|org)$/i.test(u.hostname))throw 0;}
  catch {fail(`${label} needs the real institution source URL (http or https), not an example link.`);}
  return text;
}
function pages(value:unknown,label:string):SourcePage[] {
  if(!Array.isArray(value))fail(`${label} must be an array of source pages.`);
  return value.map((item,index)=>{
    const p=object(item,`${label} ${index+1}`);
    if(!Number.isInteger(p.page)||Number(p.page)<1)fail(`${label}: use a positive physical PDF page or worksheet index.`);
    const text=string(p.text,`${label} text`);
    if(!text.trim()||/REPLACE with the original Section C|TEMPLATE ONLY/i.test(text))fail('Replace the example source text with original source text before uploading.');
    if(!Array.isArray(p.form_fields))fail(`${label}: form_fields must be an array (use [] when absent).`);
    const fields=p.form_fields.map((item,index)=>{
      const f=object(item,`Form field ${index+1}`);
      return {name:string(f.name,'Form field name'),value:string(f.value,'Form field value'),...(typeof f.label==='string'?{label:f.label}:{})};
    });
    return {page:Number(p.page),text,form_fields:fields,...(p.source_url!==undefined?{source_url:url(p.source_url,'Page source URL')}:{}),...(p.source_type!==undefined?{source_type:string(p.source_type,'Page source type')}:{}),...(p.source_label!==undefined?{source_label:string(p.source_label,'Page source label')}:{}),...(p.sha256!==undefined?{sha256:string(p.sha256,'Page hash')}:{})};
  });
}

/** Treat a downloaded AI file as untrusted drafts, never as counselor approval.
 * Use the same schema and numeric validation as saving, without fetching sources
 * or filling source gaps from the deterministic parser. */
export function parseChatGPTImport(text:string):Report[] {
  if(new TextEncoder().encode(text).length>chatGPTImportLimit)fail('Import is too large (maximum 5 MB). Ask ChatGPT to split it into smaller files.');
  let input:unknown;
  try {input=JSON.parse(text.replace(/^\uFEFF/,''));}catch {fail('This is not valid JSON. Upload the .json file downloaded from ChatGPT, without Markdown code fences.');}
  if(input!==null&&typeof input==='object'&&!Array.isArray(input)&&'atlas_import_version' in input){
    const envelope=object(input,'Import');
    if(envelope.atlas_import_version!==1)fail('Unsupported Atlas import version. Download the current instructions and template.');
    if(!Array.isArray(envelope.reports))fail('The import needs a reports array.');
    input=envelope.reports;
  }
  const rows=Array.isArray(input)?input:[input];
  if(!rows.length||rows.length>25)fail('Upload between 1 and 25 reports for one school at a time.');
  const records=rows.map((item,index):Report=>{
    const r=object(item,`Report ${index+1}`),school=string(r.school,'School name').trim();
    if(!school||school==='Example University')fail('Replace the example school with the institution and campus name.');
    const sections=pages(r.sections,'Section C pages');
    if(!sections.length)fail('Include original Section C text with page or worksheet references.');
    const additional=r.additional_sections===undefined?undefined:pages(r.additional_sections,'Additional source pages');
    const allPages=[...sections,...additional??[]];
    const rawMetrics=object(r.metrics,'Metrics'),rawEvidence=object(r.evidence,'Evidence');
    const metrics:Report['metrics']={},evidence:Report['evidence']={};
    for(const [key,value] of Object.entries(rawMetrics)){
      if(!Object.hasOwn(labels,key))fail(`Unknown metric "${key}". Ask ChatGPT to use only the metric names in the instructions.`);
      if(calculated.has(key))continue; // The application calculates these from counts.
      const textValue=textMetrics.has(key)||metricUnit(key)==='text';
      if(textValue?typeof value!=='string':typeof value!=='number'||!Number.isFinite(value))fail(`${key} must be ${textValue?'text':'a number'}. Omit missing or ambiguous answers instead of using null, blank text, or N/A.`);
      if(!textValue&&(Number(value)<0||metricUnit(key)==='number'&&!Number.isInteger(value)))fail(`${key} must be a nonnegative ${metricUnit(key)==='number'?'whole number':'number'}.`);
      const e=object(rawEvidence[key],`Evidence for ${key}`);
      if(!Number.isInteger(e.page)||Number(e.page)<1)fail(`Evidence for ${key} needs a physical page or worksheet index.`);
      const sourceURL=e.source_url===undefined?url(r.source_url,'Source URL'):url(e.source_url,`Source URL for ${key}`);
      const sourcePage=allPages.find(p=>p.page===e.page&&(p.source_url??r.source_url)===sourceURL);
      if(!sourcePage)fail(`Evidence for ${key} refers to a page that is missing from the source text.`);
      if(e.source_type!==undefined&&e.source_type!==(sourcePage.source_type??r.source_type))fail(`Evidence source type for ${key} does not match its source page.`);
      const section=string(e.section,`Section for ${key}`),method=string(e.method,`Evidence method for ${key}`);
      if(!section.trim()||!method.trim())fail(`Evidence for ${key} needs its section and how the value was read (include worksheet cells for Excel).`);
      metrics[key]=value as number|string;
      evidence[key]={section,page:Number(e.page),method,...(e.source_url!==undefined?{source_url:sourceURL}:{}),...(e.source_type!==undefined?{source_type:string(e.source_type,'Evidence source type')}:{})};
    }
    if(!Array.isArray(r.factors))fail('Factors must be an array (use [] when not reported).');
    const factors=r.factors.map(item=>{
      const f=object(item,'Admissions factor');
      if(!Number.isInteger(f.page)||!sections.some(p=>p.page===f.page))fail('Each factor needs a page present in the Section C source text.');
      const label=string(f.label,'Factor label');
      if(!factorNames.includes(label))fail(`Unknown factor "${label}". Use the C7 labels in the instructions.`);
      return {label,rating:string(f.rating,'Factor rating'),page:Number(f.page)};
    });
    if(!Array.isArray(r.warnings)||r.warnings.some(w=>typeof w!=='string'))fail('Warnings must be an array of text notes.');
    const hash=r.sha256===undefined?'':string(r.sha256,'Source hash');
    if(hash&&!/^[a-f0-9]{64}$/.test(hash))fail('sha256 must be blank when unavailable, or an actual lowercase SHA-256 file hash.');
    return {
      school,school_id:r.school_id===undefined?slug(school):string(r.school_id,'School ID'),year:r.year as number,
      report_label:typeof r.report_label==='string'?r.report_label:String(r.year),
      source_url:url(r.source_url,'Source URL'),index_url:url(r.index_url??r.source_url,'Archive URL'),source_type:string(r.source_type,'Source type'),
      sha256:hash,extracted_at:new Date().toISOString(),review_status:'AI-prepared draft; awaiting counselor review',
      metrics,evidence,factors,sections,...(additional?{additional_sections:additional}:{}),
      ...(r.omitted_metrics!==undefined?{omitted_metrics:r.omitted_metrics as string[]}:{}),
      warnings:[...r.warnings.filter(w=>w!==aiReviewWarning),aiReviewWarning,...(!hash?['Original file hash was not supplied; Atlas has not verified the original file bytes.']:[])],
    };
  });
  if(new Set(records.map(r=>r.school_id)).size>1||new Set(records.map(r=>r.school.toLowerCase().replace(/[^a-z0-9]/g,''))).size>1)fail('Upload one school and campus at a time. Ask ChatGPT to split different schools into separate files.');
  return validateReports(records);
}
