import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const work='.sites-runtime/batch-d';
const docs=JSON.parse(fs.readFileSync('data/batch-d-sources.json','utf8')).filter(d=>d.usable_report);
const reviewed=JSON.parse(fs.readFileSync('data/batch-d-source-review.json','utf8'));
const expected=JSON.parse(fs.readFileSync('scripts/fixtures/batch-d/expected-c1.json','utf8'));
const reports=[];
fs.mkdirSync('scripts/fixtures/batch-d',{recursive:true});
for(const d of docs){
 const base=`${work}/${d.school_id}-${d.year}`;
 const originals=JSON.parse(fs.readFileSync(`${base}-pages.json`,'utf8'));
 const ocr=fs.existsSync(`${base}-ocr-pages.json`)?JSON.parse(fs.readFileSync(`${base}-ocr-pages.json`,'utf8')):[];
 const matching=originals.map(p=>ocr.find(x=>x.page===p.page)??p).map(p=>ocr.length?({...p,lines:p.lines.map(l=>({...l,text:l.text.replaceAll('|',' ').replace(/\s+/g,' ').trim()}))}):p);
 const r=normalizePDF(matching,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);
 const checked=reviewed[d.school_id][d.year];
 assert.equal(createHash('sha256').update(fs.readFileSync(`${base}.pdf`)).digest('hex'),d.sha256,`Original source hash ${d.school_id} ${d.year}`);
 assert.equal(checked.sha256,d.sha256);
 assert.equal(checked.source_url,d.url);
 assert.deepEqual(checked.counts,expected[d.school_id][d.year]);
 if(!checked.offline_ocr){
  const sourceText=checked.source_c1_pages.map(p=>p.text).join('\n').replace(/(?<=\d),\s*(?=\d{3}(?!\d))/g,'');
  for(const [k,v]of Object.entries(checked.gender_status_components))assert(new RegExp(`(?<!\\d)${v}(?:\\.0)?(?!\\d)`).test(sourceText),`Reviewed component absent from source: ${d.school_id} ${d.year} ${k}`);
 }
 for(const [i,k]of ['applicants','admitted','enrolled'].entries())if(r.metrics[k]!==checked.counts[i]){
  assert(checked.manual_counts.includes(k),`Undocumented C1 difference: ${d.school_id} ${d.year} ${k}`);
  r.metrics[k]=checked.counts[i];r.evidence[k]={section:'C1',page:checked.page,method:checked.method};
 }
 for(const [k,v]of Object.entries(checked.reviewed_metrics)){
  r.metrics[k]=v;r.evidence[k]={section:checked.metric_evidence[k]?.section??'C1',page:checked.metric_evidence[k]?.page??checked.page,method:checked.metric_evidence[k]?.method??checked.method};
 }
 r.omitted_metrics=checked.omit_metrics;
 for(const k of r.omitted_metrics){delete r.metrics[k];delete r.evidence[k];}
 if(checked.reviewed_factors)r.factors=checked.reviewed_factors;
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.report_label=`${d.year}\u2013${String(d.year+1).slice(-2)}`;r.source_type='pdf';
 r.review_status='C1 counts reconciled against original source; other metrics source-extracted or individually noted as reviewed';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 r.warnings.push(...checked.notes);
 if(d.provenance.startsWith('archived'))r.warnings.push(d.provenance+'. Original-file URL and SHA-256 preserved.');
 for(const e of Object.values(r.evidence)){e.source_url=d.url;e.source_type='pdf';if(checked.offline_ocr&&!e.method.startsWith('visually')&&!e.method.startsWith('independent'))e.method='offline OCR adapter: '+e.method;}
 if(ocr.length)for(const s of [...r.sections,...r.additional_sections??[]]){
  const p=originals.find(p=>p.page===s.page),o=ocr.find(p=>p.page===s.page);
  if(p&&o)s.text=`Original PDF selectable text:\n${p.text}\n\nOffline OCR (approximate recognition; selected responses reviewed):\n${o.text}`;
 }
 validateReports([r]);
 for(const e of Object.values(r.evidence)){e.source_url=d.url;e.source_type='pdf';}
 for(const [i,k]of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],checked.counts[i]);
 for(const k of r.omitted_metrics)assert.equal(r.metrics[k],undefined,`${d.school_id} ${d.year} intentional omission ${k}`);
 const cps=originals.filter(p=>r.sections.some(s=>s.page===p.page));
 fs.writeFileSync(`scripts/fixtures/batch-d/${d.school_id}-${d.year}.json`,JSON.stringify({source_url:d.url,index_url:d.index_url,sha256:d.sha256,year:d.year,source_type:'pdf',pages:cps,offline_ocr_pages:ocr,expected_c1:checked.counts,reviewed_c1_components:checked.gender_status_components}));
 reports.push(r);
 console.log('Reviewed',d.school_id,d.year,...checked.counts,Object.keys(r.metrics).length+' metrics');
}
assert.equal(reports.length,51);
assert.equal(new Set(reports.map(r=>r.school_id+':'+r.year)).size,51);
assert.equal(reports.find(r=>r.school_id==='university-of-massachusetts-amherst'&&r.year===2024).metrics.unknown_gender_enrolled,0);
for(const y of [2024,2025]){
 const r=reports.find(r=>r.school_id==='ohio-state-university-columbus'&&r.year===y);
 assert.equal(r.metrics.unknown_gender_applicants,undefined);
 assert.equal(r.metrics.gpa_average,undefined,'Publisher zero without GPA reporters is not a usable average');
 assert.equal(r.metrics.gpa_submitted,0,'Source explicitly reports zero GPA reporting');
 assert.equal(r.metrics.act_band_6_11,undefined,'Blank ACT Composite band is not zero');
 assert.equal(r.metrics.reading_band_300_399,y===2024?0:1,'Explicit reading-band response preserved');
}
fs.writeFileSync('data/batch-d-reports.json',JSON.stringify(reports,null,2)+'\n');
console.log('PASS',reports.length,'standalone reviewed reports; existing seed unchanged');
