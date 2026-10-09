import fs from 'node:fs';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const docs=JSON.parse(fs.readFileSync('data/new-archive-sources.json','utf8'));
const review=JSON.parse(fs.readFileSync('data/new-archive-source-review.json','utf8'));
const originals=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const merged=new Map(originals.map(r=>[r.school_id+':'+r.year,r]));
fs.mkdirSync('scripts/fixtures/new-archives',{recursive:true});
const reports=[];
for(const d of docs){
 const pages=JSON.parse(fs.readFileSync(`.sites-runtime/new-archives/${d.school_id}-${d.year}-pages.json`,'utf8'));
 const r=normalizePDF(pages,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);
 const counts=review[d.school_id][d.year];
 const manual=d.school_id==='the-college-of-new-jersey'&&d.year===2023;
 if(manual){
  for(const [i,k] of ['applicants','admitted','enrolled'].entries()){r.metrics[k]=counts[i];r.evidence[k]={section:'C1',page:8,method:'visually reviewed reported overall Total column; source breakdowns disagree'};}
  r.warnings.push('TCNJ 2023 C1 page 8 is internally inconsistent: residency applicants sum to 11,693 versus printed total 11,668; residency admits sum to 7,273 versus printed total 7,251; gender enrollment sums to 1,547 versus printed total 1,568. Headline counts preserve the publisher’s explicit overall totals, not inferred corrections. Gender counts remain as printed; no missing category is inferred.');
 }
 for(const [i,k] of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],counts[i],`${d.school_id} ${d.year} ${k}`);
 if(d.school_id==='university-of-michigan-ann-arbor'&&d.year===2018){assert.equal(r.year,2017);r.warnings.push('Michigan 2018–19 C1 repeats “Fall 2017” in its template, while the report heading and C9 describe 2018. The reviewed record is indexed to Fall 2018; the original stale label remains in source text.');}
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.report_label=`${d.year}–${String(d.year+1).slice(-2)}`;
 r.review_status='C1 headline counts checked against original source; additional metrics source-extracted';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 validateReports([r]);reports.push(r);
 const cPages=pages.filter(p=>r.sections.some(s=>s.page===p.page));
 fs.writeFileSync(`scripts/fixtures/new-archives/${d.school_id}-${d.year}.json`,JSON.stringify({source_url:d.url,index_url:d.index_url,sha256:d.sha256,year:d.year,pages:cPages}));
 const existing=merged.get(r.school_id+':'+r.year);
 if(!existing||process.argv.includes('--refresh-generated')&&existing.sha256===d.sha256&&existing.review_status===r.review_status)merged.set(r.school_id+':'+r.year,r);
 console.log('Reviewed',d.school_id,d.year,...counts,r.factors.length+' factors',Object.keys(r.metrics).length+' metrics');
}
for(const r of originals)if(!process.argv.includes('--refresh-generated')||!docs.some(d=>d.school_id===r.school_id&&d.year===r.year))assert.deepEqual(merged.get(r.school_id+':'+r.year),r);
fs.writeFileSync('.sites-runtime/new-archives/reviewed.json',JSON.stringify(reports,null,2));
fs.writeFileSync('data/reports.json',JSON.stringify([...merged.values()].sort((a,b)=>a.school_id.localeCompare(b.school_id)||b.year-a.year),null,2)+'\n');
console.log('PASS: added',reports.length,'reports; preserved existing records');
