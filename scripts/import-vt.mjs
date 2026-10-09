import fs from 'node:fs';import assert from 'node:assert/strict';import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');const {validateReports}=await import('../lib/validate-import.ts');
const docs=JSON.parse(fs.readFileSync('data/vt-sources.json','utf8')).filter(d=>d.usable_report),review=JSON.parse(fs.readFileSync('data/vt-source-review.json','utf8'));
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8')),merged=new Map(seed.map(r=>[r.school_id+':'+r.year,r])),reports=[];
for(const d of docs){
 const pages=JSON.parse(fs.readFileSync(`.sites-runtime/vt/${d.year}-pages.json`,'utf8')),r=normalizePDF(pages,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256),expected=review[d.year];
 if(d.year===2023){assert.equal(r.metrics.applicants,undefined);r.metrics.applicants=47207;r.evidence.applicants={section:'C1',page:17,method:'visually reviewed explicit overall Total; source gender breakdown disagrees'};}
 for(const [i,k] of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],expected.counts[i],`${d.year} ${k}`);
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.source_type=d.source_type;r.report_label=`${d.year}–${String(d.year+1).slice(-2)}`;r.review_status='C1 counts checked against original PDF pages or worksheet cells; additional metrics source-extracted';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 r.warnings.push('Source: exact archived VT-authored original from CollegeData.fyi; publisher now requests email inquiries for current and historical CDS files. The working archived file URL and SHA-256 identify the source actually reviewed.',...expected.notes);
 if(d.source_type==='xlsx'){
  r.warnings.push('Offline worksheet adapter: source page numbers identify CDS worksheets A=1 through J=10, not physical PDF pages. The browser importer supports PDF extraction and reviewed JSON imports; it does not extract XLSX files.');
  for(const e of Object.values(r.evidence))if(e.method!=='calculated')e.method=`Worksheet ${pages.find(p=>p.page===e.page)?.worksheet??'CDS-C'}: ${e.method}`;
  for(const s of [...r.sections,...r.additional_sections??[]]){const p=pages.find(p=>p.page===s.page);s.text=`Worksheet ${p.worksheet} (source worksheet ${p.page})\n`+p.source_rows.join('\n');}
 }
 if(d.year===2024){
  // Contradictory zero applicants / 122 admits cannot be a valid normalized group.
  delete r.metrics.unknown_gender_applicants;delete r.evidence.unknown_gender_applicants;
  r.warnings.push('The contradictory unknown-gender applicant answer (0 versus 122 admitted) remains in original worksheet evidence; its normalized applicant metric is left unfilled.');
  for(const [k,v,cell] of [['sat_submitted',41,'C262'],['act_submitted',9,'C263'],['sat_submitted_count',3010,'C265'],['act_submitted_count',668,'C266']]){r.metrics[k]=v;r.evidence[k]={section:'C9',page:3,method:`Reviewed dictionary answer CDS-C!${cell}; labeled percentage/count rows are separate`};}
  delete r.metrics.sat_25;delete r.metrics.sat_50;delete r.metrics.sat_75;
 }
 validateReports([r]);reports.push(r);
 const fixture={source_url:d.url,index_url:d.index_url,sha256:d.sha256,year:d.year,expected,pages:pages.filter(p=>r.sections.some(s=>s.page===p.page))};
 fs.writeFileSync(`scripts/fixtures/vt/${d.year}.json`,JSON.stringify(fixture));
 if(!merged.has(d.school_id+':'+d.year))merged.set(d.school_id+':'+d.year,r);
 console.log('Reviewed VT',d.year,...expected.counts);
}
for(const r of seed)assert.deepEqual(merged.get(r.school_id+':'+r.year),r);
fs.writeFileSync('.sites-runtime/vt/reviewed.json',JSON.stringify(reports,null,2));fs.writeFileSync('data/reports.json',JSON.stringify([...merged.values()].sort((a,b)=>a.school_id.localeCompare(b.school_id)||b.year-a.year),null,2)+'\n');
console.log('PASS: five VT reports prepared; existing records preserved');
