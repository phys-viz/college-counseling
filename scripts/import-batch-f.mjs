import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const documents=JSON.parse(fs.readFileSync('data/batch-f-sources.json','utf8'));
const review=JSON.parse(fs.readFileSync('data/batch-f-source-review.json','utf8'));
const root='.sites-runtime/batch-f',check=process.argv.includes('--check'),reports=[];
if(!check)fs.mkdirSync('scripts/fixtures/batch-f',{recursive:true});
let manual=0;
for(const d of documents){
 if(d.download_error){console.log('Unavailable original:',d.school_id,d.year);continue;}
 const base=`${root}/${d.school_id}-${d.year}`,expected=review[d.school_id]?.[d.year];assert.ok(expected,'Original source needs independent review');
 assert.equal(expected.sha256,d.sha256);
 assert.equal(createHash('sha256').update(fs.readFileSync(`${base}.${d.source_type}`)).digest('hex'),d.sha256,'Original bytes match reviewed source');
 const pages=JSON.parse(fs.readFileSync(`${base}-pages.json`,'utf8'));
 if(d.source_type==='docx'){
  const xmlHash=createHash('sha256').update(fs.readFileSync(`${base}-document.xml`)).digest('hex');
  assert.equal(xmlHash,d.xml_sha256);assert.equal(xmlHash,expected.xml_sha256);
  for(const p of pages)assert.equal(p.xml_sha256,xmlHash,'Adapter pages came from the reviewed original XML');
 }
 const r=normalizePDF(pages,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);
 for(const[i,key]of ['applicants','admitted','enrolled'].entries()){
  if(r.metrics[key]!==expected.counts[i]){
   const fallback=expected.manual_totals?.[key];
   assert.ok(fallback,`${d.school_id} ${d.year} ${key}: automatic ${r.metrics[key]} versus reviewed ${expected.counts[i]}`);
   assert.equal(r.metrics[key],undefined,'Reviewed fallback never replaces an automatic numeric answer');
   assert.equal(fallback.value,expected.counts[i]);
   r.metrics[key]=fallback.value;r.evidence[key]={section:'C1',page:fallback.page,method:fallback.method};manual++;
  }
 }
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.source_type=d.source_type;
 r.report_label=`${d.year}–${String(d.year+1).slice(-2)}`;
 r.review_status=expected.review_scope;
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 r.warnings.push(...expected.notes);
 if(d.provenance)r.warnings.push(`Source provenance: ${d.provenance}. Original publisher URL: ${d.official_url}`);
 for(const[key,v]of Object.entries(expected.metric_overrides??{})){
  assert.equal(r.metrics[key],undefined,'Reviewed non-PDF table mapping must not silently replace an automatic answer');
  r.metrics[key]=v.value;r.evidence[key]={section:v.section,page:v.page,method:v.method,source_url:d.url,source_type:d.source_type};
 }
 const omissions=new Set(expected.omitted_metrics??[]);
 for(const key of [...omissions]){
  const match=key.match(/^(.*_)?(applicants|admitted|enrolled)$/);if(!match)continue;
  const prefix=match[1]??'';
  if(match[2]!=='enrolled')omissions.add(prefix+'admit_rate');
  if(match[2]!=='applicants')omissions.add(prefix+'yield_rate');
 }
 for(const key of omissions){delete r.metrics[key];delete r.evidence[key];}
 if(omissions.size)r.omitted_metrics=[...omissions].sort();
 if(d.source_type==='docx'){
  for(const s of [...r.sections,...r.additional_sections??[]]){
   const source=pages.find(p=>p.page===s.page);assert.ok(source);
   s.source_type='docx';s.source_url=d.url;s.source_label=source.source_label;s.sha256=d.sha256;
   // Preserve exact visible XML text and its original body/table indexes.
   // These are document indexes, not invented physical PDF page numbers.
   s.text=`${source.source_label} (section ordinal ${s.page}; document.xml SHA256 ${source.xml_sha256})\n`+source.lines.map(l=>{
    const ref=l.source.table?`table ${l.source.table}, row ${l.source.row}, body paragraph ${l.source.paragraph}`:`body paragraph ${l.source.paragraph}`;
    return `[${ref}] ${l.text}`;
   }).join('\n');
  }
  for(const [key,e]of Object.entries(r.evidence))if(e.method!=='calculated'){
   const rows=expected.original_subgroup_rows?.[key];
   const refs=rows?.map(l=>l.source?.table?`table ${l.source.table} row ${l.source.row}`:`body paragraph ${l.source?.paragraph}`).join('; ');
   e.method=`Original DOCX ${e.section}${refs?` (${refs})`:''}; ${e.method.replace(/\bPDF\b/g,'XML/table')}`;e.source_url=d.url;e.source_type='docx';
  }
 }
 validateReports([r]);
 for(const[i,key]of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[key],expected.counts[i]);
 for(const key of r.omitted_metrics??[])assert.equal(r.metrics[key],undefined,'Protected reviewed gap remains missing');
 for(const [key,v]of Object.entries(expected.reviewed_subgroup_answers??{})){
  if(v===null)assert.equal(r.metrics[key],undefined,`${d.school_id} ${d.year} ${key}: blank or contradictory source answer`);
  else if(r.metrics[key]!==undefined)assert.equal(r.metrics[key],v,`${d.school_id} ${d.year} ${key}: independently reviewed original answer`);
 }
 for(const[key,value]of Object.entries(expected.reviewed_additional_answers??{}))assert.equal(r.metrics[key],value,'Additional source-reviewed metric');
 for(const key of ['applicants','admitted','enrolled']){
  const genderTotal=['male','female','another_gender','unknown_gender'].reduce((sum,g)=>sum+(r.metrics[g+'_'+key]??0),0);
  assert.ok(genderTotal<=r.metrics[key],`${d.school_id} ${d.year}: populated gender ${key} cannot exceed reviewed overall`);
 }
 reports.push(r);
 if(!check)fs.writeFileSync(`scripts/fixtures/batch-f/${d.school_id}-${d.year}.json`,JSON.stringify({source_url:d.url,official_url:d.official_url,index_url:d.index_url,sha256:d.sha256,source_type:d.source_type,provenance:d.provenance,year:d.year,expected,...(d.source_type==='docx'?{source_xml:fs.readFileSync(`${base}-document.xml`,'utf8'),xml_sha256:createHash('sha256').update(fs.readFileSync(`${base}-document.xml`)).digest('hex')}:{}),pages:pages.filter(p=>r.sections.some(s=>s.page===p.page))}));
 console.log('Reviewed',d.school_id,d.year,...expected.counts,Object.keys(r.metrics).length+' metrics');
}
assert.equal(reports.length,Object.values(review).reduce((sum,years)=>sum+Object.keys(years).length,0),'Every reviewed available original imported');
if(!check)fs.writeFileSync('data/batch-f-reports.json',JSON.stringify(reports,null,2)+'\n');
console.log('PASS:',reports.length,'source-reviewed records;',manual,'documented manual overall fallbacks;',documents.filter(d=>d.download_error).length,'unavailable linked originals');
