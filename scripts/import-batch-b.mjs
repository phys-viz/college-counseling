import fs from 'node:fs';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const {enrichMetrics}=await import('../lib/extract-additional.ts');
const review=JSON.parse(fs.readFileSync('data/batch-b-source-review.json','utf8'));
if(process.argv.includes('--check')){
 const records=JSON.parse(fs.readFileSync('data/batch-b-reports.json','utf8'));
 const keys=new Set();
 for(const file of fs.readdirSync('scripts/fixtures/batch-b').filter(f=>f.endsWith('.json'))){
  const f=JSON.parse(fs.readFileSync('scripts/fixtures/batch-b/'+file,'utf8'));
  const r=normalizePDF(f.pages,{url:f.source_url,title:file,year:f.year},f.index_url,f.sha256);
  const saved=records.find(r=>r.source_url===f.source_url&&r.year===f.year);assert(saved,`Prepared record absent ${file}`);
  for(const [i,k] of ['applicants','admitted','enrolled'].entries()){
   assert.equal(r.metrics[k]??null,(f.expected.c1_counts??f.expected.counts)[i],`Fixture ${file} ${k}`);
   assert.equal(saved.metrics[k]??null,f.expected.counts[i],`Saved ${file} ${k}`);
  }
  for(const k of f.expected.omit_metrics??[])assert.equal(saved.metrics[k],undefined,`${file} unsafe ${k}`);
  assert.equal(saved.sha256,f.sha256);assert.equal(saved.index_url,f.index_url);
  validateReports([structuredClone(saved)]);keys.add(saved.school_id+':'+saved.year);
 }
 assert.equal(keys.size,records.length);assert.equal(records.length,54);
 console.log('PASS: 54 original-source C1 fixtures and prepared records; missing responses and reviewed contradictions preserved');process.exit(0);
}
const docs=JSON.parse(fs.readFileSync('data/batch-b-sources.json','utf8')).filter(d=>d.usable_report);
const groups=new Map();
for(const d of docs){const key=d.school_id+':'+d.year;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(d);}
const inspected=[];
const prepared=[];
fs.mkdirSync('scripts/fixtures/batch-b',{recursive:true});
for(const [key,sources] of groups){
 const main=sources.find(d=>d.section_label==='First-Time First-Year Admissions')??sources[0];
 const pages=JSON.parse(fs.readFileSync(`.sites-runtime/batch-b/${main.cache_key}-pages.json`,'utf8'));
 let r;
 try{r=normalizePDF(pages,{url:main.url,title:main.title,year:main.year},main.index_url,main.sha256);}catch(e){inspected.push({key,source:main,pages,error:e.message});console.log(key,'ERROR',e.message);continue;}
 inspected.push({key,source:main,pages,r});
 console.log(key,JSON.stringify({counts:['applicants','admitted','enrolled'].map(k=>r.metrics[k]),metrics:Object.keys(r.metrics).length,factors:r.factors.length}));
 if(process.argv.includes('--inspect'))continue;
 const expected=review[main.school_id]?.[main.year];assert(expected,`Missing independent review ${key}`);
 for(const [i,k] of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k]??null,(expected.c1_counts??expected.counts)[i],`${key} ${k}`);
 for(const [i,counts] of (expected.gender_counts??[]).entries())if(counts.every(v=>v!==null)&&expected.counts[i]!==null)assert.equal(counts.reduce((a,v)=>a+v,0),expected.counts[i],`${key} reviewed gender arithmetic`);
 if(expected.status_counts?.every(v=>v!==null))assert.equal(expected.status_counts.reduce((a,v)=>a+v,0),expected.counts[2],`${key} reviewed status arithmetic`);
 if(expected.residency_counts)for(const [i,counts] of expected.residency_counts.entries())assert.equal(counts.reduce((a,v)=>a+v,0),expected.counts[i],`${key} reviewed residency arithmetic`);
 const physical=(page,source)=>{
  const text=page.source_rows?`Worksheet ${page.worksheet} (source worksheet ${page.page})\n${page.source_rows.join('\n')}`:page.text;
  return {page:page.page,text:`Source: ${source.url}\nSHA-256: ${source.sha256}\n${text}`,form_fields:page.form_fields,source_url:source.url,source_type:source.source_type==='xls'?'xlsx':source.source_type,source_label:page.worksheet??source.section_label,sha256:source.sha256};
 };
 for(const d of sources.filter(d=>d!==main)){
  const extraPages=JSON.parse(fs.readFileSync(`.sites-runtime/batch-b/${d.cache_key}-pages.json`,'utf8'));
  const extra={...r,metrics:{},evidence:{},sections:[],additional_sections:[],warnings:[]};enrichMetrics(extra,extraPages);
  for(const [k,v] of Object.entries(extra.metrics))if(r.metrics[k]===undefined){r.metrics[k]=v;r.evidence[k]={...extra.evidence[k],source_url:d.url,source_type:d.source_type==='xls'?'xlsx':d.source_type};}
  for(const p of extraPages)r.additional_sections=[...r.additional_sections??[],physical(p,d)];
 }
 let enrollmentFixture;
 if(expected.enrollment_source){
  const b=expected.enrollment_source,d=sources.find(d=>d.cache_key===b.cache_key);assert(d,`B1 source absent ${key}`);
  const sourcePages=JSON.parse(fs.readFileSync(`.sites-runtime/batch-b/${d.cache_key}-pages.json`,'utf8'));
  const p=sourcePages.find(p=>p.page===b.page);assert(p&&p.text.includes(String(main.year)),`B1 cohort year absent ${key}`);
  assert.equal(b.counts.reduce((a,v)=>a+v,0),expected.counts[2],`B1 reviewed arithmetic ${key}`);
  const section=b.section??'B1';
  r.metrics.enrolled=expected.counts[2];r.evidence.enrolled={section,page:b.page,source_url:d.url,source_type:d.source_type==='xls'?'xlsx':d.source_type,method:section==='B2'?'Reviewed explicit same-fall degree-seeking first-time first-year B2 Total, cross-checked against racial/ethnic components':'Reviewed same-fall degree-seeking first-time first-year B1 full-time/part-time men/women row'+(b.cells?`; cells ${b.cells.join(', ')}`:'; physical page '+b.page)};
  if(section==='B1')for(const [gender,value] of [['male',b.counts[0]+b.counts[2]],['female',b.counts[1]+b.counts[3]]]){r.metrics[gender+'_enrolled']=value;r.evidence[gender+'_enrolled']={...r.evidence.enrolled,method:'Reviewed same-fall B1 '+gender+' full-time plus part-time enrollment; filled C1 full-time count agrees'};}
  enrollmentFixture={source_url:d.url,sha256:d.sha256,source_type:d.source_type,page:p,expected:b};
  if(!r.additional_sections?.some(s=>s.page===p.page&&s.text.includes(d.url)))r.additional_sections=[...r.additional_sections??[],physical(p,d)];
 }
 for(const [k,e] of Object.entries(r.evidence)){
  if(e.method==='calculated'||e.method.startsWith('calculated:'))continue;
  const source=sources.find(d=>d.url===e.source_url)??main;
  if(source.source_type!=='pdf'){
   const sourcePages=JSON.parse(fs.readFileSync(`.sites-runtime/batch-b/${source.cache_key}-pages.json`,'utf8'));
   const page=sourcePages.find(p=>p.page===e.page);
   e.method=`Offline ${source.source_type.toUpperCase()} worksheet ${page?.worksheet??'CDS-C'}: ${e.method}`;
   const keys=page?.lines?.filter(l=>l.text.includes(String(r.metrics[k]))).slice(0,3).flatMap(l=>l.words.filter(w=>w.str.includes(String(r.metrics[k]))).map(w=>w.cell)).filter(Boolean)??[];
   // Keep candidate cells as source pointers, without claiming all equal values are the same metric.
   if(keys.length)e.method+=`; source answer candidates ${keys.join(', ')}`;
  }
 }
 r.school_id=main.school_id;r.school=main.school;r.year=main.year;r.source_type=main.source_type==='xls'?'xlsx':main.source_type;r.report_label=`${main.year}–${String(main.year+1).slice(-2)}`;
 r.review_status='Admissions headline counts checked against original C1 or corroborated Section B source; additional metrics source-extracted';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 r.warnings.push(...expected.notes);
 if(main.provenance.startsWith('archived'))r.warnings.push(`Source: ${main.provenance}. Archived URL and SHA-256 identify the exact institution-authored file reviewed; no third-party normalized figures were substituted.`);
 if(main.source_type!=='pdf'){
  r.warnings.push(`Offline ${main.source_type.toUpperCase()} worksheet adapter. Source page numbers identify numbered CDS worksheets, not physical PDF pages. Original worksheet names, cells and formatted answers are retained. The website PDF importer does not read Excel workbooks; reviewed JSON records may be imported.`);
  r.sections=r.sections.map(s=>physical(pages.find(p=>p.page===s.page),main));
  r.additional_sections=(r.additional_sections??[]).map(s=>s.text.startsWith('Source:')?s:physical(pages.find(p=>p.page===s.page),main));
 }
 for(const k of expected.omit_metrics??[]){delete r.metrics[k];delete r.evidence[k];}
 if(expected.omit_metrics?.length)r.omitted_metrics=[...new Set(expected.omit_metrics)];
 if(main.school_id==='bentley-university'&&main.year===2023){assert.equal(r.metrics.applicants,undefined);assert.equal(r.metrics.male_applicants,undefined);}
 if(main.school_id==='university-of-scranton'&&main.year===2025){assert.equal(r.metrics.male_enrolled,undefined);assert.equal(r.metrics.female_enrolled,undefined);}
 validateReports([r]);
 if(expected.enrollment_source&&r.evidence.yield_rate){r.evidence.yield_rate={...r.evidence.yield_rate,source_url:r.evidence.enrolled.source_url,source_type:r.evidence.enrolled.source_type,method:`calculated: verified ${r.evidence.enrolled.section} enrolled / C1 admitted`};}
 prepared.push(r);
 const c1Pages=pages.filter(p=>p.page>=expected.c1_page&&p.page<=expected.c1_page+1);
 fs.writeFileSync(`scripts/fixtures/batch-b/${main.school_id}-${main.year}.json`,JSON.stringify({source_url:main.url,index_url:main.index_url,sha256:main.sha256,source_type:main.source_type,year:main.year,expected,pages:c1Pages,...enrollmentFixture?{enrollment_source:enrollmentFixture}:{}}));
}
fs.writeFileSync('.sites-runtime/batch-b/inspected.json',JSON.stringify(inspected));
if(process.argv.includes('--inspect'))process.exit(0);
assert.equal(prepared.length,Object.values(review).reduce((n,years)=>n+Object.keys(years).length,0),'Every reviewed year must be prepared');
fs.writeFileSync('data/batch-b-reports.json',JSON.stringify(prepared.sort((a,b)=>a.school_id.localeCompare(b.school_id)||b.year-a.year),null,2)+'\n');
console.log('PASS:',prepared.length,'source-verified reports prepared; shared seed remains untouched');
