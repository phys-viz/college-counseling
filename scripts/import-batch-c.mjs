import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');const {validateReports}=await import('../lib/validate-import.ts');
const docs=JSON.parse(fs.readFileSync('data/batch-c-sources.json','utf8')),review=JSON.parse(fs.readFileSync('data/batch-c-source-review.json','utf8'));
const root='.sites-runtime/batch-c';fs.mkdirSync('scripts/fixtures/batch-c',{recursive:true});
// This is a worksheet adapter, not a claim that browser PDF imports support Excel.
function worksheetPages(sheets){return sheets.filter(s=>/^CDS-[A-J]$/.test(s.name)).map(s=>{
 const page=s.name.charCodeAt(4)-64;
 const lines=[...new Set(s.cells.map(c=>c.row))].map(row=>{
  const cells=s.cells.filter(c=>c.row===row).sort((a,b)=>a.column-b.column);
  const words=cells.map(c=>{
   let value=c.value;
   if(typeof value==='number'&&c.number_format?.includes('%'))value=(Math.round(value*1000000)/10000)+'%';
   const str=String(value).replace(/\s+/g,' ').trim();return{str,x:c.column*130,y:-row*20,width:Math.min(110,str.length*4)};
  });return{text:words.map(w=>w.str).join(' '),words};
 });return{page,worksheet:s.name,text:lines.map(l=>l.text).join('\n'),lines,form_fields:[],source_cells:s.cells};
});}
const reports=[];let manualCount=0;
for(const d of docs){
 assert.ok(!d.download_error,`${d.school_id} ${d.year}: ${d.download_error}`);
 const base=`${root}/${d.school_id}-${d.year}`,expected=review[d.school_id][d.year];assert.ok(expected);
 assert.equal(d.sha256,expected.sha256,'Source review hash must match manifest');
 assert.equal(createHash('sha256').update(fs.readFileSync(base+'.'+d.source_type)).digest('hex'),d.sha256,'Original source file hash');
 const sheets=['pdf','html'].includes(d.source_type)?null:JSON.parse(fs.readFileSync(base+'-sheets.json','utf8'));
 const pages=sheets?worksheetPages(sheets):JSON.parse(fs.readFileSync(base+'-pages.json','utf8'));
 const r=normalizePDF(pages,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);
 for(const [i,k]of ['applicants','admitted','enrolled'].entries()){
  if(expected.counts[i]===null){assert.equal(r.metrics[k],undefined,'An unverified missing source total remains missing');continue;}
  if(r.metrics[k]!==expected.counts[i]){
   const reviewedOnly=k==='enrolled'&&(d.school_id==='lehigh-university'&&[2002,2015,2016,2017,2018].includes(d.year)||d.school_id==='university-of-notre-dame'&&[2008,2012,2016,2018,2019,2020,2021].includes(d.year));
   assert.ok(reviewedOnly,`${d.school_id} ${d.year} ${k}: unexpected automatic extraction mismatch ${r.metrics[k]} versus ${expected.counts[i]}`);
   assert.equal(r.metrics[k],undefined,'A manual fallback must never silently replace a contradictory numeric extraction');
   // Only the independently reviewed source values can be used here. Every
   // mismatch stays explicit in evidence and the import review, not hidden.
   r.metrics[k]=expected.counts[i];r.evidence[k]={section:expected.overrides?.[k]?.section??'C1',page:expected.overrides?.[k]?.page??expected.page,method:expected.overrides?.[k]?.method??'Independently reviewed original C1 counts; automatic extraction did not resolve this layout'};manualCount++;
  }
 }
 r.school_id=d.school_id;r.school=d.school;r.year=d.year;r.source_type=d.source_type==='xls'?'xlsx':d.source_type;r.report_label=`${d.year}–${String(d.year+1).slice(-2)}`;
 r.review_status='C1 headline counts checked against original PDF pages or worksheet cells; additional metrics source-extracted';
 r.warnings=r.warnings.filter(w=>!w.startsWith('Automatically extracted')&&!w.startsWith('Some headline counts'));
 r.warnings.push(...expected.notes);
 if(d.provenance)r.warnings.push('Source provenance: '+d.provenance+'. Original publisher URL: '+d.official_url);
 if(d.source_type==='html'){
  r.warnings.push('Offline historical HTML table adapter; the website importer extracts PDF reports. This archived record covers Section C. Other historical source tabs could not be retrieved, and their metrics remain unfilled. Source page 3 identifies the CDS-C worksheet, not a physical PDF page.');
  for(const e of Object.values(r.evidence))if(e.method!=='calculated'){e.method='Archived CDS-C HTML worksheet: '+e.method;e.source_url=d.url;e.source_type='html';}
 }
 for(const[k,v]of Object.entries(expected.metric_overrides??{})){
  r.metrics[k]=v.value;r.evidence[k]={section:'C1',page:v.page,method:v.method};
 }
 for(const k of expected.omitted_metrics??[]){delete r.metrics[k];delete r.evidence[k];}
 const omissions=new Set([...(expected.omitted_metrics??[]),...Object.entries(expected.reviewed_subgroup_answers??{}).filter(([,v])=>v===null).map(([k])=>k),...(['applicants','admitted','enrolled'].filter((_,i)=>expected.counts[i]===null))]);
 for(const key of [...omissions]){
  const match=key.match(/^(.*_)?(applicants|admitted|enrolled)$/);if(!match)continue;
  const prefix=match[1]??'';
  if(match[2]!=='enrolled')omissions.add(prefix+'admit_rate');
  if(match[2]!=='applicants')omissions.add(prefix+'yield_rate');
 }
 if(omissions.size)r.omitted_metrics=[...omissions].sort();
 const supportingPages=new Set(Object.values(expected.overrides??{}).map(e=>e.page));
 for(const p of pages.filter(p=>supportingPages.has(p.page)&&!r.sections.some(s=>s.page===p.page)&&!r.additional_sections?.some(s=>s.page===p.page))){
  (r.additional_sections??=[]).push({page:p.page,text:p.text,form_fields:p.form_fields});
 }
 r.additional_sections?.sort((a,b)=>a.page-b.page);
 if(sheets){
  r.warnings.push('Offline Excel worksheet adapter. Source page numbers identify CDS worksheets A=1 through J=10, rather than physical PDF pages. The website importer does not extract Excel workbooks; additional metrics are source-extracted and have not all been manually verified.');
  // Exact worksheet columns protect residency subgroups from collapsed blank
  // cells. An unfilled source answer is retained as missing, never as zero.
  const c=sheets.find(s=>s.name==='CDS-C');const rows=[...new Set(c.cells.map(v=>v.row))];
  const headerRow=rows.find(row=>c.cells.some(v=>v.row===row&&/^In-State$/i.test(String(v.value))));
  if(headerRow){
   for(const group of ['in_state','out_state','international'])for(const suffix of ['applicants','admitted','enrolled','admit_rate','yield_rate']){delete r.metrics[group+'_'+suffix];delete r.evidence[group+'_'+suffix];}
   for(const [group,label]of [['in_state','In-State'],['out_state','Out-of-State'],['international','International']]){
    const col=c.cells.find(v=>v.row===headerRow&&String(v.value).toLowerCase()===label.toLowerCase())?.column;if(!col)continue;
    for(const [k,verb]of [['applicants','applied'],['admitted','admitted'],['enrolled','enrolled']]){
     const row=rows.find(row=>row>headerRow&&row<headerRow+8&&c.cells.some(v=>v.row===row&&new RegExp(`^Total.*\\b${verb}\\b`,'i').test(String(v.value))));
     const answer=c.cells.find(v=>v.row===row&&v.column===col);if(typeof answer?.value!=='number')continue;
     r.metrics[group+'_'+k]=answer.value;r.evidence[group+'_'+k]={section:'C1',page:3,method:`Reviewed worksheet CDS-C R${row}C${col}`};
    }
   }
  }
  for(const e of Object.values(r.evidence))if(e.method!=='calculated'&&!e.method.startsWith('Reviewed worksheet'))e.method=`Worksheet ${pages.find(p=>p.page===e.page)?.worksheet??'CDS-C'}: ${e.method}`;
  for(const s of [...r.sections,...r.additional_sections??[]]){const p=pages.find(p=>p.page===s.page);s.text=`Worksheet ${p.worksheet} (source worksheet ${p.page})\n`+p.source_cells.map(c=>`R${c.row}C${c.column}: ${c.value}`).join('\n');}
 }
 validateReports([r]);for(const[i,k]of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],expected.counts[i]??undefined);
 for(const key of r.omitted_metrics??[])assert.equal(r.metrics[key],undefined,'Intentional omissions must not alter an actual populated value');
 for(const [k,value]of Object.entries(expected.reviewed_subgroup_answers??{})){
  if(value===null)assert.equal(r.metrics[k],undefined,`${d.school_id} ${d.year} ${k}: a blank source subgroup remains missing`);
  else if(r.metrics[k]!==undefined)assert.equal(r.metrics[k],value,`${d.school_id} ${d.year} ${k}: original source subgroup answer`);
 }
 if(d.school_id==='university-of-notre-dame'&&[2012,2016,2018,2019,2020,2021].includes(d.year))for(const k of ['male_enrolled','female_enrolled'])assert.equal(r.metrics[k],undefined,`Do not infer ${k} from unfilled source status cells`);
 reports.push(r);
 if(!process.argv.includes('--check'))fs.writeFileSync(`scripts/fixtures/batch-c/${d.school_id}-${d.year}.json`,JSON.stringify({source_url:d.url,index_url:d.index_url,sha256:d.sha256,year:d.year,expected,pages:pages.filter(p=>r.sections.some(s=>s.page===p.page)||supportingPages.has(p.page))}));
 console.log('Reviewed',d.school_id,d.year,...expected.counts,Object.keys(r.metrics).length+' metrics');
}
assert.equal(reports.length,88);if(!process.argv.includes('--check'))fs.writeFileSync('data/batch-c-reports.json',JSON.stringify(reports,null,2)+'\n');
console.log('PASS:',reports.length,'reports prepared;',manualCount,'counts required documented source review');
