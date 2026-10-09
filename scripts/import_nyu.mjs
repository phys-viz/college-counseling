// Run collect_nyu.py first. Preserve every existing counselor/seed record.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const docs=JSON.parse(fs.readFileSync('data/nyu-sources.json','utf8'));
const review=JSON.parse(fs.readFileSync('data/nyu-source-review.json','utf8'));
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const reports=[];
for(const d of docs){
 const pages=JSON.parse(fs.readFileSync(`.sites-runtime/nyu/${d.year}-pages.json`,'utf8'));
 const r=normalizePDF(pages,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);
 const checked=review[d.year];assert.equal(r.year,checked.detected_year);
 for(const [key,value] of Object.entries(checked.metrics))assert.equal(r.metrics[key],value,`${d.year} ${key}`);
 assert.equal(r.factors.length,checked.factor_count);
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.report_label=`${d.year}–${String(d.year+1).slice(-2)}`;r.source_type=d.source_type;
 r.review_status='Headline counts and test percentiles checked against source; additional metrics source-extracted';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Some admissions factor ratings')&&!w.startsWith('Automatically extracted'));
 r.warnings.push('Source: archived copy of the NYU-authored report from collegedata.fyi. NYU’s public server rejected direct downloads during this import. The source link opens the exact archived file used; its SHA-256 is retained.',...checked.notes);
 if(d.source_type==='xlsx'){
  r.warnings.push('Spreadsheet adapter: source page numbers identify worksheets CDS-A=1 through CDS-J=10, rather than physical PDF pages. Worksheet cells, percentage formats, and original rows are preserved. The website importer currently extracts PDFs; it does not extract XLSX files.');
  for(const e of Object.values(r.evidence))if(e.method!=='calculated')e.method=`Reviewed worksheet adapter (${['CDS-A','CDS-B','CDS-C','CDS-D','CDS-E','CDS-F','CDS-G','CDS-H','CDS-I','CDS-J'][(e.page??1)-1]}): ${e.method}`;
  for(const section of [...r.sections,...r.additional_sections??[]]){
   const p=pages.find(p=>p.page===section.page);
   section.text=`Worksheet ${['CDS-A','CDS-B','CDS-C','CDS-D','CDS-E','CDS-F','CDS-G','CDS-H','CDS-I','CDS-J'][section.page-1]} (source worksheet ${section.page})\n`+p.lines.map(l=>l.words.map(w=>`${w.cell}=${w.str}`).join(' | ')).join('\n');
  }
 }
 validateReports([r]);reports.push(r);
 console.log('Reviewed',d.year,r.metrics.applicants,r.metrics.admitted,r.metrics.enrolled,Object.keys(r.metrics).length+' metrics');
}
assert.equal(reports.length,8);
const merged=new Map(seed.map(r=>[`${r.school_id}:${r.year}`,r]));
for(const r of reports)if(!merged.has(`${r.school_id}:${r.year}`))merged.set(`${r.school_id}:${r.year}`,r);
for(const original of seed)assert.deepEqual(merged.get(`${original.school_id}:${original.year}`),original);
fs.writeFileSync('.sites-runtime/nyu/reviewed.json',JSON.stringify(reports,null,2));
fs.writeFileSync('data/reports.json',JSON.stringify([...merged.values()].sort((a,b)=>a.school_id.localeCompare(b.school_id)||b.year-a.year),null,2));
console.log('PASS: eight NYU records; existing seed records preserved');
