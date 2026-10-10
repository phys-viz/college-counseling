import fs from 'node:fs';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const work='.sites-runtime/batch-a';
const docs=JSON.parse(fs.readFileSync('data/batch-a-sources.json','utf8')).filter(d=>d.usable_report&&d.year<=2025);
const reviewFile='data/batch-a-source-review.json';
const review=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile,'utf8')):{};
const expected=JSON.parse(fs.readFileSync('scripts/fixtures/batch-a/expected-c1.json','utf8'));
const inspect=process.argv.includes('--inspect');
const reports=[],summaries=[];
fs.mkdirSync('scripts/fixtures/batch-a',{recursive:true});

function matchingPages(d,pages){
 if(d.source_type==='html')return pages.map(p=>({...p,lines:p.lines.map(l=>({...l,text:l.text.replace(/^([A-J])0([1-9])(?=[A-Z\s.]|$)/,'$1$2')}))}));
 if(d.source_type!=='xlsx'||d.year<2017||d.year>2022)return pages;
 // Illinois old sheets place a bare Unknown response after each gender pair.
 // Carry the exact adjacent outcome into matching text; do not drop these counts.
 return pages.map(p=>{
  if(!/CDS-C/.test(p.worksheet??''))return p;
  let verb='';
  const lines=p.lines.map(l=>{
   if(/Total.*\bapplied\b/i.test(l.text))verb='applied';
   if(/Total.*\badmitted\b/i.test(l.text))verb='were admitted';
   if(/Total.*\benrolled\b/i.test(l.text))verb='enrolled';
   const m=l.text.match(/^Unknown\s+(\d[\d,]*)$/);
   return m&&verb?{...l,text:`Total first-time, first-year unknown gender who ${verb} ${m[1]}`} : l;
  });return {...p,lines,text:lines.map(l=>l.text).join('\n')};
 });
}

for(const d of docs){
 const pages=JSON.parse(fs.readFileSync(`${work}/${d.school_id}-${d.year}-pages.json`,'utf8'));
 let r;
 try{r=normalizePDF(matchingPages(d,pages),{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);}
 catch(e){summaries.push({school_id:d.school_id,year:d.year,error:e.message});if(inspect)continue;throw e;}
 const checked=review[d.school_id]?.[d.year];
 summaries.push({school_id:d.school_id,year:d.year,counts:['applicants','admitted','enrolled'].map(k=>r.metrics[k]??null),metrics:r.metrics,factors:r.factors,warnings:r.warnings});
 if(inspect)continue;
 assert(checked,`Missing reviewed source: ${d.school_id} ${d.year}`);
 assert.deepEqual(checked.counts,expected[d.school_id]?.[d.year],`Independent expected C1 fixture ${d.school_id} ${d.year}`);
 for(const [i,k] of ['applicants','admitted','enrolled'].entries()){
  if(r.metrics[k]!==checked.counts[i]){
   assert(checked.manual_counts?.includes(k),`Parser differs without documented manual review: ${d.school_id} ${d.year} ${k}: ${r.metrics[k]} vs ${checked.counts[i]}`);
   r.metrics[k]=checked.counts[i];r.evidence[k]={section:'C1',page:checked.page,method:checked.method??'reviewed original source C1 counts; manual source-layout handling'};
  }
 }
 for(const [k,v] of Object.entries(checked.reviewed_metrics??{})){
  r.metrics[k]=v;r.evidence[k]={section:checked.metric_evidence?.[k]?.section??'C1',page:checked.metric_evidence?.[k]?.page??checked.page,method:checked.metric_evidence?.[k]?.method??checked.method??'reviewed original source response'};
 }
 for(const k of checked.omit_metrics??[]){delete r.metrics[k];delete r.evidence[k];}
 if(checked.omit_metrics?.length)r.omitted_metrics=[...new Set(checked.omit_metrics)];
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.report_label=`${d.year}–${String(d.year+1).slice(-2)}`;r.source_type=d.source_type;
 r.review_status='C1 counts reconciled against original source; other metrics source-extracted';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 r.warnings.push(...(checked.notes??[]));
 if(d.provenance.startsWith('archived'))r.warnings.push(d.provenance+'. Source URL and SHA-256 identify the original bytes used.');
 if(d.source_type==='xlsx')r.warnings.push('Imported with an offline worksheet adapter. Evidence page numbers identify worksheets; the website PDF importer does not read XLSX files. Original Section C cell values are preserved.');
 if(d.source_type==='html')r.warnings.push('Imported from official IU Bloomington campus-and-year HTML with an offline table adapter. Evidence pages identify CDS sections A=1…J=10, not PDF pages. Each section URL/hash is retained in the source manifest.');
 // Preserve actual worksheet cell rows instead of claiming adapter labels are raw text.
 if(d.source_type==='xlsx'){
  for(const section of r.sections){const p=pages.find(p=>p.page===section.page);if(p?.source_rows)section.text=`Worksheet ${p.worksheet}\n${p.source_rows.join('\n')}`;}
  for(const section of r.additional_sections??[]){const p=pages.find(p=>p.page===section.page);if(p?.source_rows)section.text=`Worksheet ${p.worksheet}\n${p.source_rows.join('\n')}`;}
 }
 if(d.source_type==='html')for(const section of [...r.sections,...r.additional_sections??[]]){const p=pages.find(p=>p.page===section.page);if(p)section.text=p.text;}
 for(const e of Object.values(r.evidence)){
  if(d.source_type==='html'){e.source_type='html';e.source_url=d.section_sources.find(s=>s.section.startsWith(e.section[0]+'.'))?.url??d.url;e.method=e.method.replaceAll('PDF','HTML table adapter');}
  if(d.source_type==='xlsx'){e.source_type='xlsx';e.source_url=d.url;e.method=e.method.replaceAll('PDF','worksheet adapter');}
 }
 validateReports([r]);
 for(const [i,k] of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],checked.counts[i],`${d.school_id} ${d.year} ${k}`);
 reports.push(r);
 const cPages=pages.filter(p=>r.sections.some(s=>s.page===p.page));
 fs.writeFileSync(`scripts/fixtures/batch-a/${d.school_id}-${d.year}.json`,JSON.stringify({source_url:d.url,index_url:d.index_url,sha256:d.sha256,year:d.year,source_type:d.source_type,pages:cPages,expected_c1:checked.counts}));
 console.log('Reviewed',d.school_id,d.year,...checked.counts,Object.keys(r.metrics).length+' metrics');
}
fs.writeFileSync(`${work}/extracted-summary.json`,JSON.stringify(summaries,null,2));
if(!inspect){
 assert.equal(reports.length,76);
 assert.equal(new Set(reports.map(r=>r.school_id+':'+r.year)).size,76);
 const incomplete=reports.find(r=>r.school_id==='university-of-illinois-urbana-champaign'&&r.year===2021);
 assert.equal(incomplete.metrics.unknown_gender_applicants,undefined,'Omitted gender is not inferred from a difference');
 assert.equal(incomplete.metrics.unknown_gender_admitted,undefined);
 const genuineZero=reports.find(r=>r.school_id==='university-of-illinois-urbana-champaign'&&r.year===2024);
 assert.equal(genuineZero.metrics.another_gender_applicants,0,'Explicit zero preserved');
 const unknown=reports.find(r=>r.school_id==='university-of-illinois-urbana-champaign'&&r.year===2017);
 assert.equal(unknown.metrics.unknown_gender_applicants,47,'Bare source Unknown row retained by scoped adapter');
 const ufOptional=reports.find(r=>r.school_id==='university-of-florida'&&r.year===2025);
 assert.equal(ufOptional.metrics.unknown_gender_applicants,undefined,'Dash is not zero');
 fs.writeFileSync('data/batch-a-reports.json',JSON.stringify(reports,null,2)+'\n');console.log('PASS',reports.length,'standalone reports; existing seed unchanged');
}
else console.log('Inspected',summaries.length,'sources');
