import fs from 'node:fs';
import path from 'node:path';
import {normalizePDF} from '../lib/extract-pdf.ts';
import {validateReports} from '../lib/validate-import.ts';
const work=path.resolve('.sites-runtime/archive-import');
const manifest=JSON.parse(fs.readFileSync(path.join(work,'manifest.json'),'utf8'));
const reports=[],errors=[];
for(const doc of manifest){
 if(doc.source_type==='xlsx')continue; // Reviewed worksheet adapter handles this report.
 try{
  const pages=JSON.parse(fs.readFileSync(path.join(work,`${doc.school_id}-${doc.year}-pages.json`),'utf8'));
  const r=normalizePDF(pages,{url:doc.url,title:doc.title,year:doc.year},doc.index_url,doc.sha256);
  r.school_id=doc.school_id;r.school=doc.school;
  fs.writeFileSync(path.join(work,`${doc.school_id}-${doc.year}-draft.json`),JSON.stringify(r,null,2));
  if(r.year!==doc.year)throw new Error(`Archive year ${doc.year}, detected cohort ${r.year}`);
  if(['applicants','admitted','enrolled'].some(k=>typeof r.metrics[k]!=='number'))throw new Error('Headline counts need source review');
  validateReports([r]);reports.push(r);
  console.log(doc.school_id,doc.year,r.metrics.applicants,r.metrics.admitted,r.metrics.enrolled,Object.keys(r.metrics).length+' metrics',r.factors.length+' factors');
 }catch(e){errors.push({...doc,error:e.message});console.log('REVIEW',doc.school_id,doc.year,e.message);}
}
fs.writeFileSync(path.join(work,'normalized.json'),JSON.stringify(reports,null,2));
fs.writeFileSync(path.join(work,'normalization-errors.json'),JSON.stringify(errors,null,2));
console.log('Normalized',reports.length,'of',manifest.length,'reports');
