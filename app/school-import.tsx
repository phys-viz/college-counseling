'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,ExternalLink,FileSpreadsheet,FileText,Info,Search,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {Report,SourcePage} from '@/lib/report-types';
import {labels,format} from '@/lib/report-types';
import {extraMetrics,metricSection,metricUnit} from '@/lib/metric-definitions';
import type {SourceDiscovery,SourceDocument} from '@/lib/source-types';
import {validateReports} from '@/lib/validate-import';
import {setReviewedMetric} from '@/lib/review-metrics';
import {extractPDF,factorNames} from '@/lib/extract-pdf';
import {extractXLSX} from '@/lib/extract-xlsx';
import {UnrecognizedReportError} from '@/lib/pdf-report-screening';
import {importReadiness,missingHeadlineCounts} from '@/lib/import-readiness';
import {chatGPTImportLimit,parseChatGPTImport} from '@/lib/chatgpt-import';

type Draft={url:string;sourceTitle:string;archiveYear:number|null;report:Report;include:boolean;approved:boolean;saved:boolean;existing:boolean;error:string};
type School={school_id:string;school:string};
type ImportNotice={url:string;title:string;message:string;format?:'xlsx'};
// Wording stays "PDF" when every file is a PDF; spreadsheets and mixed lists say so.
const kind=(d:{format?:'xlsx'})=>d.format==='xlsx'?'spreadsheet':'PDF';
const noun=(docs:{format?:'xlsx'}[])=>docs.every(d=>!d.format)?'PDF':docs.every(d=>d.format==='xlsx')?'spreadsheet':'file';
const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
const worksheet=(page:number)=>`CDS-${String.fromCharCode(64+page)}`;
const pageLink=(r:Report,page:number,s?:SourcePage)=>(s?.source_url??r.source_url)+((s?.source_type??r.source_type)==='pdf'?`#page=${page}`:'');
const pageName=(r:Report,page:number,sourceURL=r.source_url)=>{
  const s=[...r.sections,...r.additional_sections??[]].find(s=>s.page===page&&(s.source_url??r.source_url)===sourceURL);
  return (s?.source_type??r.source_type)==='xlsx'?`worksheet ${s?.source_label??worksheet(page)}`:`page ${page}`;
};
const cleanName=(s:string)=>s.toLowerCase().replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]/g,'');
const slug=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const head=['applicants','admitted','enrolled'];
const optional=['waitlist_offered','waitlist_accepted','waitlist_admitted','ed_applicants','ed_admitted','sat_25','sat_50','sat_75','reading_25','reading_50','reading_75','math_25','math_50','math_75','act_25','act_50','act_75','sat_submitted','act_submitted','sat_submitted_count','act_submitted_count','top_tenth','top_quarter','top_half','rank_submitted','fee'];
const textFields=['test_policy','rd_deadline','ed_deadline','ed_notification'];
const sectionFor=metricSection;
const extraGroups=[...new Set(Object.values(extraMetrics).map(d=>d.group))];
const source=(r:Report,key?:string)=>{const e=key?r.evidence[key]:undefined;return (e?.source_url??r.source_url)+((e?.source_type??r.source_type)==='pdf'&&e?.page?`#page=${e.page}`:'');};

export default function SchoolImport({open,onOpenChange,schools,onSaved}:{open:boolean;onOpenChange:(v:boolean)=>void;schools:School[];onSaved:()=>void}) {
  const [method,setMethod]=useState<'website'|'chatgpt'>('website');
  const [url,setURL]=useState(''),[discovery,setDiscovery]=useState<SourceDiscovery|null>(null),[selected,setSelected]=useState<string[]>([]),[years,setYears]=useState<Record<string,string>>({});
  const [schoolName,setSchoolName]=useState(''),[target,setTarget]=useState('new'),[drafts,setDrafts]=useState<Draft[]>([]),[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState<'discover'|'extract'|'upload'|'save'|null>(null),[progress,setProgress]=useState(''),[error,setError]=useState(''),[failures,setFailures]=useState<ImportNotice[]>([]),[skipped,setSkipped]=useState<ImportNotice[]>([]),[allowReplace,setAllowReplace]=useState(false);
  const controller=useRef<AbortController|null>(null);const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!open)controller.current?.abort();return()=>{controller.current?.abort();};},[open]);
  async function uploadJSON(file:File) {
    setBusy('upload');setError('');setProgress('Checking the import file…');setDrafts([]);setDiscovery(null);setFailures([]);setSkipped([]);setExpanded({});setAllowReplace(false);setTarget('new');setSchoolName('');
    const abort=new AbortController();controller.current=abort;
    try {
      if(file.size>chatGPTImportLimit)throw new Error('Import is too large (maximum 5 MB). Ask ChatGPT to split it into smaller files.');
      const records=parseChatGPTImport(await file.text());
      if(abort.signal.aborted)return;
      const first=records[0],match=schools.find(s=>s.school_id===first.school_id)||schools.find(s=>cleanName(s.school)===cleanName(first.school));
      const knownYears=new Set<number>();
      if(match){
        const res=await fetch('/api/reports?view=schools&school='+encodeURIComponent(match.school_id),{signal:abort.signal});
        if(!res.ok)throw new Error('Could not check existing reports. Please upload the file again.');
        const body=await res.json() as {years:{year:number}[]};body.years.forEach(y=>knownYears.add(y.year));
      }
      if(abort.signal.aborted)return;
      setTarget(match?.school_id??'new');setSchoolName(match?.school??first.school);
      setDrafts(records.map((report,index)=>({url:`json:${index}:${report.year}`,sourceTitle:`${report.school} · ${report.report_label}`,archiveYear:null,report,include:true,approved:false,saved:false,existing:knownYears.has(report.year),error:''})));
      setProgress(`${records.length} AI-prepared draft${records.length===1?'':'s'} loaded. Check the original source and confirm each report before saving.`);
    }catch(e){if(!abort.signal.aborted){setError(e instanceof Error?e.message:'The import file could not be read.');setProgress('');}}
    finally{setBusy(null);}
  }
  async function discover(event:React.FormEvent) {
    event.preventDefault();setBusy('discover');setError('');setDrafts([]);setFailures([]);setSkipped([]);setExpanded({});setDiscovery(null);setProgress('Opening the school archive…');setAllowReplace(false);
    setTarget('new');setSchoolName('');
    const abort=new AbortController();controller.current=abort;
    try {
      const res=await fetch('/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.trim(),mode:'discover'}),signal:abort.signal});
      const data=await res.json() as SourceDiscovery&{error?:string};if(!res.ok)throw new Error(data.error);
      setDiscovery(data);setSelected(data.documents.length?[data.documents[0].url]:[]);setYears(Object.fromEntries([...data.documents,...data.other_documents??[]].map(d=>[d.url,d.year?String(d.year):''])));
      if(!data.documents.length&&!data.other_documents?.length)setError('No linked PDF or Excel reports were found. Paste the school’s Common Data Set archive page or a direct PDF or .xlsx link.');
    }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'The school page could not load.');}finally{setBusy(null);setProgress('');}
  }
  async function extract() {
    if(!discovery)return;setBusy('extract');setError('');setFailures([]);setSkipped([]);setExpanded({});setDrafts([]);setAllowReplace(false);
    const abort=new AbortController();controller.current=abort;let detectedTarget=target;
    let knownYears=new Set<number>(),identified=false;
    try {
      for(const [i,doc] of [...discovery.documents,...discovery.other_documents??[]].filter(d=>selected.includes(d.url)).entries()) {
        if(abort.signal.aborted)break;
        setProgress(`Report ${i+1} of ${selected.length}: downloading ${doc.title}…`);
        try {
          const res=await fetch('/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:doc.url,mode:'download'}),signal:abort.signal});
          if(!res.ok){const body=await res.json() as {error:string};throw new Error(body.error);}
          const finalURL=decodeURIComponent(res.headers.get('X-Source-URL')??doc.url);
          const document:SourceDocument={...doc,url:finalURL,year:years[doc.url]?Number(years[doc.url]):null};
          // The server identifies the downloaded content; a link's extension can be wrong.
          const extractor=res.headers.get('X-Source-Format')==='xlsx'?extractXLSX:extractPDF;
          const report=await extractor(await res.arrayBuffer(),document,discovery.index_url,abort.signal,text=>setProgress(`Report ${i+1} of ${selected.length} · ${text}`));
          if(abort.signal.aborted)break;
          if(!identified) {
            const match=schools.find(s=>cleanName(s.school)===cleanName(report.school||schoolName));
            if(target==='new'&&match){detectedTarget=match.school_id;setTarget(match.school_id);setSchoolName(match.school);}
            else if(!schoolName&&report.school)setSchoolName(report.school);
            if(detectedTarget!=='new') {
              const existing=await fetch('/api/reports?view=schools&school='+encodeURIComponent(detectedTarget),{signal:abort.signal});
              if(!existing.ok)throw new Error('Could not check existing reports. Please retry extraction.');
              const body=await existing.json() as {years:{year:number}[]};knownYears=new Set(body.years.map(y=>y.year));
            }
            identified=true;
          }
          setDrafts(v=>[...v,{url:doc.url,sourceTitle:doc.title,archiveYear:doc.year,report,include:true,approved:false,saved:false,existing:knownYears.has(report.year),error:''}]);
        }catch(e){if(!abort.signal.aborted){const notice:ImportNotice={url:doc.url,title:doc.title,format:doc.format,message:e instanceof Error?e.message:`This ${kind(doc)} could not be extracted.`};if(e instanceof UnrecognizedReportError)setSkipped(v=>[...v,notice]);else setFailures(v=>[...v,notice]);}}
      }
      if(abort.signal.aborted)setError('Extraction canceled. Reports already extracted remain available for review.');
    }finally{setBusy(null);setProgress('');}
  }
  // Corrections are part of the counselor's review, so they keep the review confirmation.
  function update(index:number,mutate:(r:Report)=>void) {setDrafts(v=>v.map((d,i)=>{if(i!==index)return d;const report=structuredClone(d.report);mutate(report);return {...d,report,error:''};}));}
  function changeMetric(index:number,key:string,value:string) {
    update(index,r=>setReviewedMetric(r,key,value===''?null:Number(value)));
  }
  async function save() {
    const chosen=drafts.filter(d=>d.include&&!d.saved);if(!chosen.length)return;
    setError('');setBusy('save');setProgress('Validating reviewed reports…');
    const name=target==='new'?schoolName.trim():schools.find(s=>s.school_id===target)?.school??schoolName.trim();const id=target==='new'?slug(name):target;
    try {
      const records=chosen.map(d=>({...structuredClone(d.report),school:name,school_id:id,report_label:`${d.report.year}–${String(d.report.year+1).slice(-2)}`,review_status:'Reviewed by user before website import'}));
      if(!name||!id)throw new Error('Enter the school name before saving.');
      if(chosen.some(d=>!d.approved))throw new Error('Review each selected report and check its review box before saving.');
      if(records.some(r=>head.some(k=>r.metrics[k]===undefined)))throw new Error('Fill the three C1 headline counts before saving.');
      validateReports(records);
      // Recheck current database state just before saving, including edited cohort years.
      const existing=await fetch('/api/reports?view=schools&school='+encodeURIComponent(id));if(!existing.ok)throw new Error('Could not check existing records. Please retry.');
      const body=await existing.json() as {years:{year:number}[]};const currentYears=new Set(body.years.map(y=>y.year));
      const replaces=records.some(r=>currentYears.has(r.year));
      if(replaces&&!allowReplace){setDrafts(v=>v.map(d=>({...d,existing:currentYears.has(d.report.year)})));throw new Error('Some reports already exist. Check “Replace existing reports” to save reviewed updates.');}
      let saved=0;
      for(const record of records) {
        setProgress(`Saving report ${++saved} of ${records.length}…`);
        const res=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json',...(allowReplace?{'X-Replace-Existing':'true'}:{})},body:JSON.stringify([record])});
        const result=await res.json() as {error?:string};if(!res.ok)throw new Error(result.error??'The report could not be saved.');
        setDrafts(v=>v.map(d=>d.report.year===record.year&&d.include?{...d,saved:true}:d));onSaved();
      }
      setProgress(`${records.length} reviewed report${records.length===1?'':'s'} saved to the shared library.`);
    }catch(e){setError(e instanceof Error?e.message:'The reports could not be saved. Reports marked Saved do not need to be retried.');setProgress('');}finally{setBusy(null);}
  }
  const readiness=importReadiness(drafts,schoolName,allowReplace),chosen=readiness.selected,replacements=readiness.existing.length;
  const canSave=readiness.canSave&&!busy;
  function numericField(d:Draft,index:number,key:string,required=false) {
    return <label className={'import-metric '+(required&&d.report.metrics[key]===undefined?'needs-value':'')} key={key}><span>{labels[key]??key}{required?' *':''}</span><Input type="number" min={0} step={['percent','gpa','dollars','units','ratio'].includes(metricUnit(key))?'any':'1'} aria-label={`${labels[key]??key} for ${d.report.year}`} value={d.report.metrics[key]??''} disabled={d.saved||!!busy} placeholder="Not extracted" onChange={e=>changeMetric(index,key,e.target.value)}/><a href={source(d.report,key)} target="_blank" rel="noreferrer">{d.report.evidence[key]?.section??sectionFor(key)}{d.report.evidence[key]?.page?` · ${pageName(d.report,d.report.evidence[key].page!,d.report.evidence[key].source_url)}`:''}<ExternalLink size={12}/></a></label>;
  }
  function documentRow(doc:SourceDocument) {
    const Icon=doc.format==='xlsx'?FileSpreadsheet:FileText;
    return <div className="import-document" key={doc.url}><Checkbox aria-label={`Select ${kind(doc)} ${doc.title}`} checked={selected.includes(doc.url)} disabled={!!busy||selected.length>=25&&!selected.includes(doc.url)} onCheckedChange={()=>setSelected(v=>v.includes(doc.url)?v.filter(s=>s!==doc.url):[...v,doc.url])}/><a href={doc.url} target="_blank" rel="noreferrer"><Icon size={16}/><span>{doc.title}</span><ExternalLink size={13}/></a><label><span>Fall year</span><Input type="number" min={1900} max={2100} aria-label={`Fall year for ${doc.title}`} value={years[doc.url]??''} placeholder={doc.format==='xlsx'?'Check file':'Check PDF'} disabled={!!busy} onChange={e=>setYears(v=>({...v,[doc.url]:e.target.value}))}/></label></div>;
  }
  const allDocuments=discovery?[...discovery.documents,...discovery.other_documents??[]]:[];
  const selectedDocuments=allDocuments.filter(d=>selected.includes(d.url));
  return <Dialog open={open} onOpenChange={v=>{if(busy==='save')return;onOpenChange(v);}}><DialogContent className="school-import-dialog"><DialogTitle>Add school data</DialogTitle><DialogDescription>Import from a school website or a file prepared in ChatGPT, then review the source and save to your shared library.</DialogDescription>
    <div className="import-method" aria-label="Choose import method"><Button variant={method==='website'?'default':'outline'} aria-pressed={method==='website'} disabled={!!busy} onClick={()=>setMethod('website')}><Search size={16}/> School website</Button><Button variant={method==='chatgpt'?'default':'outline'} aria-pressed={method==='chatgpt'} disabled={!!busy} onClick={()=>setMethod('chatgpt')}><Upload size={16}/> Import from ChatGPT</Button></div>
    {method==='website'?<><form className="import-link-form" onSubmit={discover}><label><span>School’s Common Data Set webpage, PDF or .xlsx link</span><Input ref={input} type="url" required aria-label="School website or PDF link" value={url} onChange={e=>setURL(e.target.value)} placeholder="https://school.edu/common-data-set" disabled={!!busy}/></label><Button type="submit" disabled={!!busy||!url.trim()}><Search size={16}/> Find reports</Button></form>
    <p className="fine-print">Use the institution’s Common Data Set archive page rather than its homepage. You can also paste a direct PDF or Excel (.xlsx) link. For an unusual layout, choose Import from ChatGPT.</p></>:<section className="import-chatgpt" aria-label="ChatGPT import instructions"><h3>Prepare the file in ChatGPT</h3><ol><li>Download the instructions and attach them in a ChatGPT conversation with the original report or its direct link.</li><li>Ask: “Follow the attached Atlas instructions and create a downloadable import file for this report.” If ChatGPT cannot read the link or a scanned table, upload the original file or clear page images.</li><li>Download the resulting .json file, upload it below, and check each draft against the original before saving.</li></ol><div className="import-chatgpt-downloads"><a href="/chatgpt-import-instructions.txt" download><Download size={16}/> Download ChatGPT instructions</a><a href="/chatgpt-import-template.json" download><Download size={16}/> Download example template</a></div><p className="fine-print">Uses your own ChatGPT conversation. AI can make mistakes; check its answers against the original before saving.</p><label className="import-json-upload"><span>Upload the ChatGPT import file (.json)</span><Input type="file" accept=".json,application/json" aria-label="ChatGPT import file" disabled={!!busy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void uploadJSON(file);}}/><span className="fine-print">One school per file · up to 25 reports · maximum 5 MB. Uploading loads drafts; saving requires your review.</span></label></section>}
    {busy&&<div className="import-progress" role="status"><span>{progress}</span>{busy!=='save'&&<Button variant="outline" onClick={()=>controller.current?.abort()}>Cancel</Button>}</div>}
    {!busy&&progress&&<p className="import-success" role="status">{progress}</p>}
    {error&&<p className="import-error" role="alert">{error}</p>}
    {discovery&&<>
      <div className="import-section-heading"><h3>{plural(discovery.documents.length,{PDF:'PDF report',spreadsheet:'spreadsheet report',file:'report'}[noun(discovery.documents)])} found</h3><a href={discovery.index_url} target="_blank" rel="noreferrer">Open archive<ExternalLink size={13}/></a></div>
      {discovery.notes.map(note=><p className="fine-print" key={note}>{note}</p>)}
      {(discovery.documents.length>0||!!discovery.other_documents?.length)&&<><div className="import-document-actions">{discovery.documents.length>0&&<button className="text-button" disabled={!!busy} onClick={()=>setSelected(discovery.documents.slice(0,25).map(d=>d.url))}>Select {discovery.documents.length>25?'newest 25':'all'}</button>}<button className="text-button" disabled={!!busy} onClick={()=>setSelected([])}>Clear selection</button><span>{selected.length} selected · up to 25 per batch</span></div>
        {discovery.documents.length>0&&<div className="import-document-list" aria-label="CDS report links">{discovery.documents.map(documentRow)}</div>}
        {!!discovery.other_documents?.length&&<details className="import-optional"><summary>Other {noun(discovery.other_documents)==='PDF'?'PDF':'report'} links · {discovery.other_documents.length}</summary><p className="fine-print">These links were not clearly identified as CDS reports. They are not included in Select all. If a report is missing above, open these files to check and select it individually.</p><div className="import-document-list" aria-label="Other PDF links">{discovery.other_documents.map(documentRow)}</div></details>}
        <Button disabled={!!busy||!selected.length} onClick={extract}>Extract Section C from {plural(selected.length,noun(selectedDocuments))}</Button></>}
    </>}
    {skipped.length>0&&<div className="import-skipped" role="status"><strong>{plural(skipped.length,noun(skipped))} {skipped.length===1?'was':'were'} skipped after checking the content</strong>{skipped.map(f=><div key={f.url}><p><b>{f.title}</b>: {f.message}</p><a href={f.url} target="_blank" rel="noreferrer">Open skipped {kind(f)}<ExternalLink size={13}/></a></div>)}</div>}
    {failures.map(f=><div className="import-failure" key={f.url}><strong>Could not extract: {f.title}</strong><p>{f.message}</p><a href={f.url} target="_blank" rel="noreferrer">Open {kind(f)}<ExternalLink size={13}/></a></div>)}
    {drafts.length>0&&<section className="import-review"><h3>Review before saving</h3><div className="import-identity"><label><span>Save under</span><Select value={target} onValueChange={v=>{setTarget(v);setAllowReplace(false);if(v!=='new')setSchoolName(schools.find(s=>s.school_id===v)?.school??'');setDrafts(d=>d.map(r=>({...r,existing:false})));}} disabled={!!busy||drafts.some(d=>d.saved)}><SelectTrigger aria-label="Save under school"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">A new school</SelectItem>{schools.map(s=><SelectItem value={s.school_id} key={s.school_id}>{s.school}</SelectItem>)}</SelectContent></Select></label><label><span>School name</span><Input aria-label="School name" value={schoolName} onChange={e=>setSchoolName(e.target.value)} disabled={target!=='new'||!!busy||drafts.some(d=>d.saved)} placeholder="Name of institution and campus"/></label></div>
      {readiness.reasons.length>0&&<div className="import-save-requirements" id="import-save-requirements" aria-live="polite"><h4>Before saving</h4><ul>{readiness.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>{replacements>0&&<Button variant="outline" disabled={!!busy} onClick={()=>{setDrafts(rows=>rows.map(d=>d.existing?{...d,include:false}:d));setAllowReplace(false);}}>Exclude saved reports</Button>}</div>}
      {drafts.map((d,index)=>{const isExpanded=expanded[d.url]??(drafts.length===1&&!busy);return <details className="import-draft" data-source-url={d.url} key={d.url} open={isExpanded} onToggle={event=>{const open=event.currentTarget.open;if(open!==isExpanded)setExpanded(rows=>({...rows,[d.url]:open}));}}><summary><span><b>Fall {d.report.year||'year needs review'}</b> · {Object.keys(d.report.metrics).length} figures · {d.report.factors.length} factor ratings</span><span className="import-draft-state">{d.saved?'Saved':d.existing?'Already in library':missingHeadlineCounts(d.report).length?'Missing required counts':d.approved?'Reviewed':'Needs review'}</span></summary>{isExpanded&&<div><div className="import-review-toolbar"><label><Checkbox checked={d.include} disabled={d.saved||!!busy} aria-label={`Include report ${d.report.year}`} onCheckedChange={v=>setDrafts(rows=>rows.map((r,i)=>i===index?{...r,include:v===true}:r))}/> Include this report</label><a href={d.report.source_url} target="_blank" rel="noreferrer">Open original {d.report.source_type==='xlsx'?'spreadsheet':'PDF'}<ExternalLink size={14}/></a><label>Fall cohort<Input type="number" min={1900} max={2100} aria-label={`Review fall year ${index+1}`} value={d.report.year||''} disabled={d.saved||!!busy} onChange={e=>update(index,r=>{r.year=Number(e.target.value);})}/></label></div>
        <p className="fine-print">Source report: <strong>{d.sourceTitle}</strong></p>
        {d.archiveYear!==null&&d.archiveYear!==d.report.year&&<div className="import-year-warning"><p>The archive identifies this {d.report.source_type==='xlsx'?'spreadsheet':'PDF'} as Fall {d.archiveYear}, while its C1 text says Fall {d.report.year}. Check the source and choose the correct cohort before saving.</p><Button variant="outline" disabled={d.saved||!!busy} onClick={()=>update(index,r=>{r.year=d.archiveYear!;r.warnings.push(`Fall cohort changed to archive year ${d.archiveYear} during review; original C1 year text is preserved.`);})}>Use archive Fall {d.archiveYear}</Button></div>}
        {d.report.school&&<p className="fine-print">{d.report.source_type==='xlsx'?'Workbook':'PDF'} identifies the institution as: <strong>{d.report.school}</strong>.</p>}
        <div className="import-headline">{head.map(key=>numericField(d,index,key,true))}</div><p className="fine-print">Admission rate: {format('admit_rate',typeof d.report.metrics.applicants==='number'&&d.report.metrics.applicants>0&&typeof d.report.metrics.admitted==='number'?100*d.report.metrics.admitted/d.report.metrics.applicants:undefined)}. Rates are recalculated from reviewed counts when saved.</p>
        <details className="import-optional"><summary>Test scores, waitlists & other figures</summary><div className="import-metrics-grid">{optional.map(key=>numericField(d,index,key))}{textFields.map(key=><label className="import-metric" key={key}><span>{labels[key]??key}</span><Input aria-label={`${labels[key]??key} for ${d.report.year}`} value={d.report.metrics[key]??''} disabled={d.saved||!!busy} placeholder="Not extracted" onChange={e=>update(index,r=>setReviewedMetric(r,key,e.target.value===''?null:e.target.value))}/><a href={source(d.report,key)} target="_blank" rel="noreferrer">{sectionFor(key)}<ExternalLink size={12}/></a></label>)}</div></details>
        {extraGroups.map(group=><details className="import-optional" key={group}><summary>{group}</summary><div className="import-metrics-grid">{Object.entries(extraMetrics).filter(([key,def])=>def.group===group&&!key.endsWith('_rate')&&!['ed_share','merit_participation'].includes(key)).map(([key,def])=>def.unit==='text'?<label className="import-metric" key={key}><span>{def.label}</span><Input aria-label={`${def.label} for ${d.report.year}`} value={d.report.metrics[key]??''} disabled={d.saved||!!busy} placeholder="Not extracted" onChange={e=>update(index,r=>setReviewedMetric(r,key,e.target.value===''?null:e.target.value))}/><a href={source(d.report,key)} target="_blank" rel="noreferrer">{def.section}<ExternalLink size={12}/></a></label>:numericField(d,index,key))}</div></details>)}
        <details className="import-optional"><summary>Admissions factor ratings · C7</summary><div className="import-factor-review">{factorNames.map(name=>{const f=d.report.factors.find(f=>f.label===name);const page=f?.page??d.report.sections.find(s=>/\bC\s*7\b/.test(s.text))?.page??d.report.sections[0].page;return <label key={name}><a href={pageLink(d.report,page)} target="_blank" rel="noreferrer">{name}<ExternalLink size={12}/></a><select aria-label={`${name} rating for ${d.report.year}`} value={f?.rating??''} disabled={d.saved||!!busy} onChange={e=>update(index,r=>{r.factors=r.factors.filter(f=>f.label!==name);if(e.target.value)r.factors.push({label:name,rating:e.target.value,page});})}><option value="">Not extracted</option>{['Very important','Important','Considered','Not considered'].map(r=><option key={r}>{r}</option>)}</select></label>;})}</div></details>
        <details className="import-optional"><summary>Extracted source text & form answers</summary>{[...d.report.sections,...d.report.additional_sections??[]].map((s,i)=><details key={`${s.page}:${i}`} className="source-page"><summary>{d.report.source_type==='xlsx'?`Worksheet ${s.source_label??worksheet(s.page)}`:d.report.source_type==='pdf'?`PDF page ${s.page}`:`Source page ${s.page}`}<a href={pageLink(d.report,s.page,s)} target="_blank" rel="noreferrer">{d.report.source_type==='xlsx'?'Original workbook':'Original page'}</a></summary><pre>{s.text}</pre>{s.form_fields.length>0&&<dl className="form-answers">{s.form_fields.map(f=><div key={f.name}><dt>{f.label||f.name}</dt><dd>{f.value}</dd></div>)}</dl>}</details>)}</details>
        <div className="import-source-notes"><Info size={16}/><div>{d.report.warnings.map(w=><p key={w}>{w}</p>)}</div></div><label className="import-approved"><Checkbox checked={d.approved} disabled={d.saved||!!busy} aria-label={`Reviewed report ${d.report.year}`} onCheckedChange={v=>setDrafts(rows=>rows.map((r,i)=>i===index?{...r,approved:v===true}:r))}/> I checked this report’s figures, school, and fall year against its source.</label>
      </div>}</details>;})}
      {replacements>0&&allowReplace&&<p className="import-replacement-note">{replacements} selected report{replacements===1?' already exists':'s already exist'} in the library. Saving will replace those records with the reviewed version.</p>}
      <label className="import-approved"><Checkbox checked={allowReplace} onCheckedChange={v=>setAllowReplace(v===true)} disabled={!!busy} aria-label="Replace existing reports"/> Replace existing reports for the same school and fall year, if any.</label>
      <div className="import-save-bar"><div className="import-save-status"><span>{chosen.length} report{chosen.length===1?'':'s'} selected for saving</span>{readiness.reasons.length>0&&<button className="text-button" onClick={()=>document.getElementById('import-save-requirements')?.scrollIntoView({block:'start',behavior:'smooth'})}>See what’s needed to save</button>}</div><Button disabled={!canSave} aria-describedby={readiness.reasons.length?'import-save-requirements':undefined} onClick={save}>Save {chosen.length} reviewed report{chosen.length===1?'':'s'}</Button></div>
    </section>}
  </DialogContent></Dialog>;
}
