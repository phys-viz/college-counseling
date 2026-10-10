import fs from 'node:fs';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const review=JSON.parse(fs.readFileSync('data/batch-e-source-review.json','utf8'));
const fields=['applicants','admitted','enrolled'];
const fixtureDir='scripts/fixtures/batch-e';
const expectedLength=69;
const reportPath='data/batch-e-reports.json';
const reviewMath=(v,label)=>{
 for(const [i,g] of (v.gender_counts??[]).entries())if(g.every(n=>n!==null))assert.equal(g.reduce((a,b)=>a+b,0),v.counts[i],label+' gender arithmetic');
 if(v.status_counts?.every(n=>n!==null))assert.equal(v.status_counts.reduce((a,b)=>a+b,0),v.counts[2],label+' status arithmetic');
 if(v.inclusive_enrollment_counts)assert.equal(v.inclusive_enrollment_counts.reduce((a,b)=>a+b,0),v.counts[2],label+' explicitly inclusive enrollment arithmetic');
 for(const [i,g] of (v.residency_counts??[]).entries())assert.equal(g.reduce((a,b)=>a+b,0),v.counts[i],label+' residency arithmetic');
 if(v.newark_gender_counts){
  assert.notEqual(v.newark_gender_counts[1].reduce((a,b)=>a+b,0),v.counts[1],label+' distinct reported admissions populations');
  assert.notEqual(v.newark_status_counts.reduce((a,b)=>a+b,0),v.counts[2],label+' distinct reported enrollment populations');
 }
};

if(process.argv.includes('--check')){
 const records=JSON.parse(fs.readFileSync(reportPath,'utf8'));const seen=new Set();
 for(const file of fs.readdirSync(fixtureDir).filter(f=>f.endsWith('.json'))){
  const f=JSON.parse(fs.readFileSync(fixtureDir+'/'+file,'utf8'));
  if(f.kind==='excluded-publisher-file'){
   if(f.year===2022)assert.throws(()=>normalizePDF(f.pages,{url:f.source_url,title:file,year:f.year},f.index_url,f.sha256),/Section C could not be located/);
   assert(!records.some(r=>r.source_url===f.source_url),file+' excluded source must not be imported');continue;
  }
  const r=normalizePDF(f.pages,{url:f.source_url,title:file,year:f.year},f.index_url,f.sha256);
  const saved=records.find(r=>r.school_id===f.school_id&&r.year===f.year);assert(saved,file+' prepared record absent');
  reviewMath(f.expected,file);
  for(const [i,k] of fields.entries()){
   assert.equal(r.metrics[k]??null,(f.expected.parser_counts??f.expected.counts)[i],file+' shared C1 extraction '+k);
   assert.equal(saved.metrics[k],f.expected.counts[i],file+' reviewed '+k);
  }
  for(const k of f.expected.omit_metrics??[]){assert.equal(saved.metrics[k],undefined,file+' unsafe metric '+k);assert(saved.omitted_metrics?.includes(k),file+' omission metadata '+k);}
  validateReports([structuredClone(saved)]);
  const again=validateReports([structuredClone(saved)])[0];
  for(const k of f.expected.omit_metrics??[])assert.equal(again.metrics[k],undefined,file+' validation must preserve omission '+k);
  assert.equal(saved.source_url,f.source_url);assert.equal(saved.sha256,f.sha256);
  assert(saved.sections.every(p=>p.source_url===saved.source_url&&p.sha256===saved.sha256),file+' raw page provenance');
  seen.add(saved.school_id+':'+saved.year);
 }
 assert.equal(seen.size,expectedLength);assert.equal(records.length,expectedLength);
 console.log('PASS: 69 independent source C1 reviews, source geometry fixtures, campus scope omissions, raw provenance, and prepared records');process.exit(0);
}

const docs=JSON.parse(fs.readFileSync('data/batch-e-sources.json','utf8'));
const prepared=[];const mismatches=[];fs.mkdirSync(fixtureDir,{recursive:true});
for(const d of docs){
 const original=JSON.parse(fs.readFileSync(`.sites-runtime/batch-e/${d.cache_key}-pages.json`,'utf8'));
 if(!d.usable_report){
  const selected=original;
  fs.writeFileSync(`${fixtureDir}/${d.school_id}-${d.year}-excluded.json`,JSON.stringify({kind:'excluded-publisher-file',source_url:d.url,index_url:d.index_url,sha256:d.sha256,year:d.year,reason:d.excluded_reason,pages:selected}));continue;
 }
 const v=review[d.school_id]?.[d.year];assert(v,'Independent source review absent '+d.school_id+':'+d.year);
 assert.equal(v.source_url,d.url);assert.equal(v.sha256,d.sha256);reviewMath(v,d.school_id+':'+d.year);
 const pages=d.normalization_cache_key?JSON.parse(fs.readFileSync(`.sites-runtime/batch-e/${d.normalization_cache_key}-pages.json`,'utf8')):original;
 const r=normalizePDF(pages,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);
 for(const e of Object.values(r.evidence)){e.source_url??=d.url;e.source_type??=d.source_type==='xls'?'xlsx':d.source_type;}
 const fixturePages=pages.filter(p=>p.page>=v.c1_page&&p.page<=v.c1_page+1||d.school_id==='university-of-delaware'&&d.year===2014&&p.page===2);
 fs.writeFileSync(`${fixtureDir}/${d.school_id}-${d.year}.json`,JSON.stringify({school_id:d.school_id,source_url:d.url,index_url:d.index_url,sha256:d.sha256,source_type:d.source_type,year:d.year,expected:v,pages:fixturePages,...d.offline_adapter?{original_pages:original.filter(p=>p.page>=v.c1_page&&p.page<=v.c1_page+1),offline_adapter:d.offline_adapter}:{}}));
 for(const [i,k] of fields.entries())if((r.metrics[k]??null)!==(v.parser_counts??v.counts)[i])mismatches.push({school:d.school_id,year:d.year,metric:k,source:(v.parser_counts??v.counts)[i],parsed:r.metrics[k]??null});
 if(process.argv.includes('--inspect'))continue;
 const rawPage=(p,label)=>({page:p.page,text:p.source_rows?`Worksheet ${p.worksheet} (source worksheet ${p.page})\n${p.source_rows.join('\n')}`:p.text,form_fields:p.form_fields,source_url:d.url,source_type:d.source_type==='xls'?'xlsx':d.source_type,source_label:label??(p.offline_ocr?'Offline OCR transcription of original PDF':p.worksheet?'Worksheet '+p.worksheet:d.title),sha256:d.sha256});
 r.sections=r.sections.map(s=>rawPage(pages.find(p=>p.page===s.page)??s));
 r.additional_sections=(r.additional_sections??[]).map(s=>rawPage(pages.find(p=>p.page===s.page)??s));
 if(d.offline_adapter){
  const cPages=new Set(r.sections.map(p=>p.page));
  r.additional_sections.push(...original.filter(p=>cPages.has(p.page)).map(p=>rawPage(p,'Original PDF text extraction before offline OCR')));
  r.warnings.push(d.offline_adapter+'. C1 counts were independently checked against original page images. Additional metrics are source-extracted and are not all manually verified.');
 }
 for(const [k,value] of Object.entries(v.reviewed_metrics??{})){
  const scannedFont=d.school_id==='university-of-delaware'&&d.year===2024;
  r.metrics[k]=value;r.evidence[k]={section:'C1',page:scannedFont&&!k.startsWith('male_')&&!k.startsWith('female_')?14:v.c1_page,source_url:d.url,source_type:d.source_type,method:scannedFont?'Visually reviewed original C1 gender/status and explicit residency total cells; PDF font mapping/OCR extraction incomplete':'Reviewed explicit institution-wide C1 degree-seeking total; Newark-only gender/status rows have a different population scope'};
 }
 r.omitted_metrics=v.omit_metrics??[];
 for(const k of r.omitted_metrics){delete r.metrics[k];delete r.evidence[k];}
 if(d.source_type==='xlsx'||d.source_type==='xls'){
  for(const [k,e] of Object.entries(r.evidence))if(!e.method.startsWith('calculated')){
   const p=pages.find(p=>p.page===e.page);e.method=`Offline ${d.source_type.toUpperCase()} worksheet ${p?.worksheet??'CDS-C'}: ${e.method}`;
   const values=p?.lines?.filter(l=>l.text.includes(String(r.metrics[k]))).slice(0,3).flatMap(l=>l.words.filter(w=>w.str.includes(String(r.metrics[k]))).map(w=>w.cell)).filter(Boolean)??[];
   if(values.length)e.method+='; source answer candidates '+values.join(', ');
  }
  r.warnings.push('Offline Excel worksheet adapter. Source pages identify numbered CDS worksheets; original worksheet names, cell coordinates and formatted answers are retained. The browser PDF importer does not read Excel workbooks.');
 }
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.source_type=d.source_type==='xls'?'xlsx':d.source_type;r.report_label=`${d.year}–${String(d.year+1).slice(-2)}`;
 r.review_status='C1 headline counts and reported populations independently checked against original sources; additional metrics source-extracted';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 r.warnings.push(...v.notes);
 validateReports([r]);
 for(const [i,k] of fields.entries())assert.equal(r.metrics[k],v.counts[i],d.school_id+':'+d.year+' final reviewed '+k);
 for(const k of r.omitted_metrics)assert.equal(r.metrics[k],undefined,d.school_id+':'+d.year+' omission '+k);
 prepared.push(r);
}
fs.writeFileSync('.sites-runtime/batch-e/parser-mismatches.json',JSON.stringify(mismatches,null,2));
if(process.argv.includes('--inspect')){console.log('Shared parser/source differences:',JSON.stringify(mismatches,null,2));process.exit(0);}
assert.equal(mismatches.length,0,'Shared parser/source differences remain; inspect .sites-runtime/batch-e/parser-mismatches.json');
assert.equal(prepared.length,expectedLength);
fs.writeFileSync(reportPath,JSON.stringify(prepared.sort((a,b)=>a.school_id.localeCompare(b.school_id)||b.year-a.year),null,2)+'\n');
console.log('PASS:',prepared.length,'source-reviewed reports prepared; shared seed untouched');
