'use client';
import {useEffect,useRef,useState} from 'react';
import {ExternalLink,FileText,Info,Search} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {Report} from '@/lib/report-types';
import {labels,format} from '@/lib/report-types';
import {extraMetrics,metricSection,metricUnit} from '@/lib/metric-definitions';
import type {SourceDiscovery,SourceDocument} from '@/lib/source-types';
import {validateReports} from '@/lib/validate-import';
import {setReviewedMetric} from '@/lib/review-metrics';
import {extractPDF,factorNames} from '@/lib/extract-pdf';

type Draft={url:string;report:Report;include:boolean;approved:boolean;saved:boolean;existing:boolean;error:string};
type School={school_id:string;school:string};
const cleanName=(s:string)=>s.toLowerCase().replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]/g,'');
const slug=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const head=['applicants','admitted','enrolled'];
const optional=['waitlist_offered','waitlist_accepted','waitlist_admitted','ed_applicants','ed_admitted','sat_25','sat_50','sat_75','reading_25','reading_50','reading_75','math_25','math_50','math_75','act_25','act_50','act_75','sat_submitted','act_submitted','sat_submitted_count','act_submitted_count','top_tenth','top_quarter','top_half','rank_submitted','fee'];
const textFields=['test_policy','rd_deadline','ed_deadline','ed_notification'];
const sectionFor=metricSection;
const extraGroups=[...new Set(Object.values(extraMetrics).map(d=>d.group))];
const source=(r:Report,key?:string)=>r.source_url+(r.source_type==='pdf'&&(key?r.evidence[key]?.page:0)?`#page=${r.evidence[key!].page}`:'');

export default function SchoolImport({open,onOpenChange,schools,onSaved}:{open:boolean;onOpenChange:(v:boolean)=>void;schools:School[];onSaved:()=>void}) {
  const [url,setURL]=useState(''),[discovery,setDiscovery]=useState<SourceDiscovery|null>(null),[selected,setSelected]=useState<string[]>([]),[years,setYears]=useState<Record<string,string>>({});
  const [schoolName,setSchoolName]=useState(''),[target,setTarget]=useState('new'),[drafts,setDrafts]=useState<Draft[]>([]);
  const [busy,setBusy]=useState<'discover'|'extract'|'save'|null>(null),[progress,setProgress]=useState(''),[error,setError]=useState(''),[failures,setFailures]=useState<{url:string;title:string;message:string}[]>([]),[allowReplace,setAllowReplace]=useState(false);
  const controller=useRef<AbortController|null>(null);const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!open)controller.current?.abort();return()=>{controller.current?.abort();};},[open]);
  async function discover(event:React.FormEvent) {
    event.preventDefault();setBusy('discover');setError('');setDrafts([]);setFailures([]);setDiscovery(null);setProgress('Opening the school archive…');setAllowReplace(false);
    setTarget('new');setSchoolName('');
    const abort=new AbortController();controller.current=abort;
    try {
      const res=await fetch('/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.trim(),mode:'discover'}),signal:abort.signal});
      const data=await res.json() as SourceDiscovery&{error?:string};if(!res.ok)throw new Error(data.error);
      setDiscovery(data);setSelected(data.documents.length?[data.documents[0].url]:[]);setYears(Object.fromEntries(data.documents.map(d=>[d.url,d.year?String(d.year):''])));
      if(!data.documents.length)setError('No linked PDFs were found. Paste the school’s Common Data Set archive page or a direct PDF link.');
    }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'The school page could not load.');}finally{setBusy(null);setProgress('');}
  }
  async function extract() {
    if(!discovery)return;setBusy('extract');setError('');setFailures([]);setDrafts([]);setAllowReplace(false);
    const abort=new AbortController();controller.current=abort;let detectedTarget=target;
    let knownYears=new Set<number>(),identified=false;
    try {
      for(const [i,doc] of discovery.documents.filter(d=>selected.includes(d.url)).entries()) {
        if(abort.signal.aborted)break;
        setProgress(`Report ${i+1} of ${selected.length}: downloading ${doc.title}…`);
        try {
          const res=await fetch('/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:doc.url,mode:'download'}),signal:abort.signal});
          if(!res.ok){const body=await res.json() as {error:string};throw new Error(body.error);}
          const finalURL=decodeURIComponent(res.headers.get('X-Source-URL')??doc.url);
          const document:SourceDocument={...doc,url:finalURL,year:years[doc.url]?Number(years[doc.url]):null};
          const report=await extractPDF(await res.arrayBuffer(),document,discovery.index_url,abort.signal,text=>setProgress(`Report ${i+1} of ${selected.length} · ${text}`));
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
          setDrafts(v=>[...v,{url:doc.url,report,include:true,approved:false,saved:false,existing:knownYears.has(report.year),error:''}]);
        }catch(e){if(!abort.signal.aborted)setFailures(v=>[...v,{url:doc.url,title:doc.title,message:e instanceof Error?e.message:'This PDF could not be extracted.'}]);}
      }
      if(abort.signal.aborted)setError('Extraction canceled. Reports already extracted remain available for review.');
    }finally{setBusy(null);setProgress('');}
  }
  function update(index:number,mutate:(r:Report)=>void) {setDrafts(v=>v.map((d,i)=>{if(i!==index)return d;const report=structuredClone(d.report);mutate(report);return {...d,report,approved:false,error:''};}));}
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
  const chosen=drafts.filter(d=>d.include&&!d.saved),replacements=chosen.filter(d=>d.existing).length;
  const canSave=chosen.length>0&&chosen.every(d=>d.approved&&head.every(k=>typeof d.report.metrics[k]==='number'))&&!!schoolName.trim()&&(!replacements||allowReplace)&&!busy;
  function numericField(d:Draft,index:number,key:string,required=false) {
    return <label className={'import-metric '+(required&&d.report.metrics[key]===undefined?'needs-value':'')} key={key}><span>{labels[key]??key}{required?' *':''}</span><Input type="number" min={0} step={['percent','gpa','dollars','units','ratio'].includes(metricUnit(key))?'any':'1'} aria-label={`${labels[key]??key} for ${d.report.year}`} value={d.report.metrics[key]??''} disabled={d.saved||!!busy} placeholder="Not extracted" onChange={e=>changeMetric(index,key,e.target.value)}/><a href={source(d.report,key)} target="_blank" rel="noreferrer">{d.report.evidence[key]?.section??sectionFor(key)}{d.report.evidence[key]?.page?` · page ${d.report.evidence[key].page}`:''}<ExternalLink size={12}/></a></label>;
  }
  return <Dialog open={open} onOpenChange={v=>{if(busy==='save')return;onOpenChange(v);}}><DialogContent className="school-import-dialog"><DialogTitle>Add school data from a website</DialogTitle><DialogDescription>Find Common Data Set PDFs, review the extracted Section C answers, and save them to your shared library.</DialogDescription>
    <form className="import-link-form" onSubmit={discover}><label><span>School’s Common Data Set webpage or PDF link</span><Input ref={input} type="url" required aria-label="School website or PDF link" value={url} onChange={e=>setURL(e.target.value)} placeholder="https://school.edu/common-data-set" disabled={!!busy}/></label><Button type="submit" disabled={!!busy||!url.trim()}><Search size={16}/> Find reports</Button></form>
    <p className="fine-print">Use the institution’s Common Data Set archive page rather than its homepage. You can also paste a direct PDF link.</p>
    {busy&&<div className="import-progress" role="status"><span>{progress}</span>{busy!=='save'&&<Button variant="outline" onClick={()=>controller.current?.abort()}>Cancel</Button>}</div>}
    {!busy&&progress&&<p className="import-success" role="status">{progress}</p>}
    {error&&<p className="import-error" role="alert">{error}</p>}
    {discovery&&<>
      <div className="import-section-heading"><h3>{discovery.documents.length} PDF report{discovery.documents.length===1?'':'s'} found</h3><a href={discovery.index_url} target="_blank" rel="noreferrer">Open archive<ExternalLink size={13}/></a></div>
      {discovery.notes.map(note=><p className="fine-print" key={note}>{note}</p>)}
      {discovery.documents.length>0&&<><div className="import-document-actions"><button className="text-button" disabled={!!busy} onClick={()=>setSelected(discovery.documents.slice(0,25).map(d=>d.url))}>Select {discovery.documents.length>25?'newest 25':'all'}</button><button className="text-button" disabled={!!busy} onClick={()=>setSelected([])}>Clear selection</button><span>{selected.length} selected · up to 25 per batch</span></div>
        <div className="import-document-list">{discovery.documents.map(doc=><div className="import-document" key={doc.url}><Checkbox aria-label={`Select PDF ${doc.title}`} checked={selected.includes(doc.url)} disabled={!!busy||selected.length>=25&&!selected.includes(doc.url)} onCheckedChange={()=>setSelected(v=>v.includes(doc.url)?v.filter(s=>s!==doc.url):[...v,doc.url])}/><a href={doc.url} target="_blank" rel="noreferrer"><FileText size={16}/><span>{doc.title}</span><ExternalLink size={13}/></a><label><span>Fall year</span><Input type="number" min={1900} max={2100} aria-label={`Fall year for ${doc.title}`} value={years[doc.url]??''} placeholder="Check PDF" disabled={!!busy} onChange={e=>setYears(v=>({...v,[doc.url]:e.target.value}))}/></label></div>)}</div>
        <Button disabled={!!busy||!selected.length} onClick={extract}>Extract Section C from {selected.length} PDF{selected.length===1?'':'s'}</Button></>}
    </>}
    {failures.map(f=><div className="import-failure" key={f.url}><strong>Could not extract: {f.title}</strong><p>{f.message}</p><a href={f.url} target="_blank" rel="noreferrer">Open PDF<ExternalLink size={13}/></a></div>)}
    {drafts.length>0&&<section className="import-review"><h3>Review before saving</h3><div className="import-identity"><label><span>Save under</span><Select value={target} onValueChange={v=>{setTarget(v);setAllowReplace(false);if(v!=='new')setSchoolName(schools.find(s=>s.school_id===v)?.school??'');setDrafts(d=>d.map(r=>({...r,approved:false,existing:false})));}} disabled={!!busy||drafts.some(d=>d.saved)}><SelectTrigger aria-label="Save under school"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">A new school</SelectItem>{schools.map(s=><SelectItem value={s.school_id} key={s.school_id}>{s.school}</SelectItem>)}</SelectContent></Select></label><label><span>School name</span><Input aria-label="School name" value={schoolName} onChange={e=>{setSchoolName(e.target.value);setDrafts(v=>v.map(d=>({...d,approved:false})));}} disabled={target!=='new'||!!busy||drafts.some(d=>d.saved)} placeholder="Name of institution and campus"/></label></div>
      {drafts.map((d,index)=><details className="import-draft" key={d.url} open={drafts.length===1||undefined}><summary><span><b>Fall {d.report.year||'year needs review'}</b> · {Object.keys(d.report.metrics).length} figures · {d.report.factors.length} factor ratings</span><span className="import-draft-state">{d.saved?'Saved':d.existing?'Already in library':d.approved?'Reviewed':'Needs review'}</span></summary><div className="import-review-toolbar"><label><Checkbox checked={d.include} disabled={d.saved||!!busy} aria-label={`Include report ${d.report.year}`} onCheckedChange={v=>setDrafts(rows=>rows.map((r,i)=>i===index?{...r,include:v===true}:r))}/> Include this report</label><a href={d.report.source_url} target="_blank" rel="noreferrer">Open original PDF<ExternalLink size={14}/></a><label>Fall cohort<Input type="number" min={1900} max={2100} aria-label={`Review fall year ${index+1}`} value={d.report.year||''} disabled={d.saved||!!busy} onChange={e=>update(index,r=>{r.year=Number(e.target.value);})}/></label></div>
        {d.report.school&&<p className="fine-print">PDF identifies the institution as: <strong>{d.report.school}</strong>.</p>}
        <div className="import-headline">{head.map(key=>numericField(d,index,key,true))}</div><p className="fine-print">Admission rate: {format('admit_rate',typeof d.report.metrics.applicants==='number'&&d.report.metrics.applicants>0&&typeof d.report.metrics.admitted==='number'?100*d.report.metrics.admitted/d.report.metrics.applicants:undefined)}. Rates are recalculated from reviewed counts when saved.</p>
        <details className="import-optional"><summary>Test scores, waitlists & other figures</summary><div className="import-metrics-grid">{optional.map(key=>numericField(d,index,key))}{textFields.map(key=><label className="import-metric" key={key}><span>{labels[key]??key}</span><Input aria-label={`${labels[key]??key} for ${d.report.year}`} value={d.report.metrics[key]??''} disabled={d.saved||!!busy} placeholder="Not extracted" onChange={e=>update(index,r=>setReviewedMetric(r,key,e.target.value===''?null:e.target.value))}/><a href={source(d.report,key)} target="_blank" rel="noreferrer">{sectionFor(key)}<ExternalLink size={12}/></a></label>)}</div></details>
        {extraGroups.map(group=><details className="import-optional" key={group}><summary>{group}</summary><div className="import-metrics-grid">{Object.entries(extraMetrics).filter(([key,def])=>def.group===group&&!key.endsWith('_rate')&&!['ed_share','merit_participation'].includes(key)).map(([key,def])=>def.unit==='text'?<label className="import-metric" key={key}><span>{def.label}</span><Input aria-label={`${def.label} for ${d.report.year}`} value={d.report.metrics[key]??''} disabled={d.saved||!!busy} placeholder="Not extracted" onChange={e=>update(index,r=>setReviewedMetric(r,key,e.target.value===''?null:e.target.value))}/><a href={source(d.report,key)} target="_blank" rel="noreferrer">{def.section}<ExternalLink size={12}/></a></label>:numericField(d,index,key))}</div></details>)}
        <details className="import-optional"><summary>Admissions factor ratings · C7</summary><div className="import-factor-review">{factorNames.map(name=>{const f=d.report.factors.find(f=>f.label===name);const page=f?.page??d.report.sections.find(s=>/\bC\s*7\b/.test(s.text))?.page??d.report.sections[0].page;return <label key={name}><a href={`${d.report.source_url}#page=${page}`} target="_blank" rel="noreferrer">{name}<ExternalLink size={12}/></a><select aria-label={`${name} rating for ${d.report.year}`} value={f?.rating??''} disabled={d.saved||!!busy} onChange={e=>update(index,r=>{r.factors=r.factors.filter(f=>f.label!==name);if(e.target.value)r.factors.push({label:name,rating:e.target.value,page});})}><option value="">Not extracted</option>{['Very important','Important','Considered','Not considered'].map(r=><option key={r}>{r}</option>)}</select></label>;})}</div></details>
        <details className="import-optional"><summary>Extracted source text & form answers</summary>{[...d.report.sections,...d.report.additional_sections??[]].map(s=><details key={s.page} className="source-page"><summary>PDF page {s.page}<a href={`${d.report.source_url}#page=${s.page}`} target="_blank" rel="noreferrer">Original page</a></summary><pre>{s.text}</pre>{s.form_fields.length>0&&<dl className="form-answers">{s.form_fields.map(f=><div key={f.name}><dt>{f.label||f.name}</dt><dd>{f.value}</dd></div>)}</dl>}</details>)}</details>
        <div className="import-source-notes"><Info size={16}/><div>{d.report.warnings.map(w=><p key={w}>{w}</p>)}</div></div><label className="import-approved"><Checkbox checked={d.approved} disabled={d.saved||!!busy} aria-label={`Reviewed report ${d.report.year}`} onCheckedChange={v=>setDrafts(rows=>rows.map((r,i)=>i===index?{...r,approved:v===true}:r))}/> I checked this report’s figures, school, and fall year against its source.</label>
      </details>)}
      {replacements>0&&<p className="import-replacement-note">{replacements} selected report{replacements===1?' already exists':'s already exist'} in the library. Saving will replace those records with the reviewed version.</p>}
      <label className="import-approved"><Checkbox checked={allowReplace} onCheckedChange={v=>setAllowReplace(v===true)} disabled={!!busy} aria-label="Replace existing reports"/> Replace existing reports for the same school and fall year, if any.</label>
      <div className="import-save-bar"><span>{chosen.length} report{chosen.length===1?'':'s'} selected for saving</span><Button disabled={!canSave} onClick={save}>Save {chosen.length} reviewed report{chosen.length===1?'':'s'}</Button></div>
    </section>}
  </DialogContent></Dialog>;
}
