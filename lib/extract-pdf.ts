import type {Report} from './report-types';
import type {SourceDocument} from './source-types';
import {enrichMetrics} from './extract-additional';
export type PDFWord={str:string;x:number;y:number;width:number};
export type PDFLine={text:string;words:PDFWord[]};
export type PDFPage={page:number;text:string;lines:PDFLine[];form_fields:Report['sections'][number]['form_fields']};
export const factorNames=['Rigor of secondary school record','Class rank','Academic GPA','Standardized test scores','Application essay','Recommendations','Interview','Extracurricular activities','Talent/ability','Character/personal qualities','First generation','Alumni/ae relation','Geographical residence','State residency','Religious affiliation/commitment','Racial/ethnic status','Volunteer work','Work experience',"Level of applicant’s interest"];
const number=(v:unknown)=>{const text=String(v??'').trim().replace(/[,$%]/g,'');return /^\d+(?:\.\d+)?$/.test(text)?Number(text):null;};
const ratings=['Very important','Important','Considered','Not considered'];

export function normalizePDF(pages:PDFPage[],document:SourceDocument,indexURL:string,sha256:string):Report {
  const sections:PDFPage[]=[];let started=false;
  for(const page of pages) {
    const start=page.lines.findIndex(l=>/^(?:CDS\s+)?C\s*1(?:[.\s-]|$)/i.test(l.text.trim()));
    if(!started&&start<0)continue;
    const lines=page.lines.slice(!started?start:0);started=true;
    const end=lines.findIndex(l=>/^(?:CDS\s+)?D\s*\.?\s*(?:1(?:[.\s]|$)|TRANSFER)/i.test(l.text.trim()));
    if(end>=0){if(end>0)sections.push({...page,lines:lines.slice(0,end),text:lines.slice(0,end).map(l=>l.text).join('\n'),form_fields:page.form_fields.filter(f=>!/^.*TFER/.test(f.name))});break;}
    sections.push({...page,lines,text:lines.map(l=>l.text).join('\n')});
  }
  if(!sections.length)throw new Error('Section C could not be located. This PDF may cover another section, contain scanned images, or use an unsupported layout. Try the full Common Data Set PDF.');
  const allFields=new Map(pages.flatMap(p=>p.form_fields.map(f=>[f.name,{...f,page:p.page}] as const)));
  const fields=new Map(sections.flatMap(p=>p.form_fields.map(f=>[f.name,{...f,page:p.page}] as const)));
  // Normalize typographic hyphens for matching, retaining the original source text above.
  const combined=sections.flatMap(p=>p.lines.map(l=>({...l,text:l.text.normalize('NFKC').replace(/[\u00ad\u2010-\u2015\u2212]/g,'-'),page:p.page})));
  function sectionLines(n:number) {
    const start=combined.findIndex(l=>new RegExp(`^(?:CDS\\s+)?C\\s*${n}(?:[.\\s]|$)`,'i').test(l.text.trim()));
    if(start<0)return [];
    const end=combined.findIndex((l,i)=>{const m=l.text.trim().match(/^(?:CDS\s+)?C\s*(\d+)(?:[A-Z]?(?:[.\s-]|$))/i);return i>start&&!!m&&Number(m[1])!==n;});
    return combined.slice(start,end<0?undefined:end).map(l=>({...l,text:l.text.replace(/^(?:CDS\s+)?C\s*\d+[A-Z]?(?:[.\s]+|$)/i,'')}));
  }
  const c1=sectionLines(1);const yearMatch=c1.map(l=>l.text).join(' ').match(/\bFall\s+((?:19|20)\d{2})\b/i);
  const year=yearMatch?Number(yearMatch[1]):document.year??0;
  const detectedName=allFields.get('NAME')?.value??allFields.get('INST_NAME')?.value??'';
  const r:Report={school_id:'pending',school:detectedName,year,report_label:year?`${year}–${String(year+1).slice(-2)}`:'Year needs review',source_url:document.url,index_url:indexURL,source_type:'pdf',sha256,extracted_at:new Date().toISOString(),review_status:'Automatically extracted; awaiting review',metrics:{},evidence:{},factors:[],sections:sections.map(({page,text,form_fields})=>({page,text,form_fields})),warnings:[]};
  const put=(key:string,value:number|string|null,section:string,page:number|null,method='PDF text')=>{if(value!==null){r.metrics[key]=value;r.evidence[key]={section,page,method};}};
  const mappings:Record<string,[string,string]>={applicants:['AP_RECD_1ST_N','C1'],admitted:['AP_ADMT_1ST_N','C1'],enrolled:['EN_TOT_1ST_N','C1'],waitlist_offered:['AP_RECD_WAIT_N','C2'],waitlist_accepted:['AP_ACPT_WAIT_N','C2'],waitlist_admitted:['AP_ADMT_WAIT_N','C2'],ed_applicants:['AP_RECD_EDEC_N','C21'],ed_admitted:['AP_ADMT_EDEC_N','C21'],fee:['AP_FEE_RES_D','C13'],top_tenth:['FRSH_HS_RANK_10_P','C10'],top_quarter:['FRSH_HS_RANK_25_P','C10'],top_half:['FRSH_HS_RANK_50_P','C10'],rank_submitted:['FRSH_HS_RANK_SUBMIT_P','C10'],sat_submitted:['SUBMIT_SAT1_P','C9'],act_submitted:['SUBMIT_ACT_P','C9'],sat_submitted_count:['SUBMIT_SAT1_N','C9'],act_submitted_count:['SUBMIT_ACT_N','C9']};
  for(const [key,[name,section]] of Object.entries(mappings)){const f=fields.get(name);if(f)put(key,number(f.value),section,f.page,'PDF form field');}
  for(const [key,prefix,verb] of [['applicants','AP_RECD_1ST_','applied'],['admitted','AP_ADMT_1ST_','admitted'],['enrolled','EN_TOT_1ST_','enrolled']]) {
    const candidates:{value:number;page:number;method:string}[]=[];
    const direct=fields.get(prefix+'N');
    if(direct&&number(direct.value)!==null)candidates.push({value:number(direct.value)!,page:direct.page,method:'PDF form field'});
    let vals=['MEN_N','WMN_N','NON_BINARY_N','UNK_N'].map(s=>fields.get(prefix+s)).filter(f=>f&&number(f.value)!==null);
    if(key==='enrolled'&&!vals.length)vals=['FT_MEN_N','PT_MEN_N','FT_WMN_N','PT_WMN_N','FT_NON_BINARY_N','PT_NON_BINARY_N','FT_UNK_N','PT_UNK_N'].map(s=>fields.get(prefix+s)).filter(f=>f&&number(f.value)!==null);
    // A single recognized gender field is a subgroup, never a cohort total.
    const bothFormGenders=vals.some(f=>/(?:^|_)MEN_N$/.test(f!.name))&&vals.some(f=>/(?:^|_)WMN_N$/.test(f!.name));
    if(bothFormGenders)candidates.push({value:vals.reduce((n,f)=>n+number(f!.value)!,0),page:vals[0]!.page,method:'sum of PDF form counts'});
    const genderLabel=/\b(?:men|women|males?|females?|another gender|unknown gender|unknown sex|non.binary|gender|sex)\b/i;
    const gender=c1.filter(l=>new RegExp(`^Total.*\\b${verb}\\b`,'i').test(l.text.trim())&&genderLabel.test(l.text));
    const overall=gender.filter(l=>!/(?:full|part)\s*-\s*time/i.test(l.text));
    const rows=overall.length?overall:gender;
    const found=rows.map(l=>({match:l.text.match(new RegExp(`\\b${verb}\\s*:?\\s*_*(\\d[\\d,]*)_*\\s*$`,'i')),line:l})).filter(x=>x.match);
    const bothTextGenders=found.some(x=>/\b(?:men|males?)\b/i.test(x.line.text))&&found.some(x=>/\b(?:women|females?)\b/i.test(x.line.text));
    if(bothTextGenders)candidates.push({value:found.reduce((n,x)=>n+number(x.match![1])!,0),page:found[0].line.page,method:'sum of PDF gender/status counts'});
    const c1Text=c1.map(l=>l.text).join(' ');
    const residencyHeader=/\bin[- ]state\b/i.test(c1Text)&&/\bout(?:-|\s)/i.test(c1Text)&&/\binternat(?:ional|-)/i.test(c1Text);
    for(const [index,line] of c1.entries()) {
      if(!new RegExp(`^Total.*\\b${verb}\\b`,'i').test(line.text.trim())||genderLabel.test(line.text))continue;
      const suffix=line.text.split(new RegExp(`\\b${verb}\\b`,'i')).at(-1)!.replace(/^\s*:?\s*/, '').trim();
      if(!/^[\d,]+(?:\s+[\d,]+)*$/.test(suffix))continue;
      const values=suffix.split(/\s+/).map(v=>number(v)!);
      if(values.length===1)candidates.push({value:values[0],page:line.page,method:'PDF overall total'});
      const header=c1.slice(0,index).findLast(l=>/\bin[- ]state\b/i.test(l.text));
      const hasTotalColumn=!!header&&/\bTotal\b/i.test(header.text);
      const totalFirst=!!header&&/\bTotal\b.*\bin[- ]state\b/i.test(header.text);
      // Some tables include an explicit Total column before their residency columns.
      // Others contain only the four residency counts, which must be summed.
      if(residencyHeader&&hasTotalColumn&&values.length>1&&values.length<=5)candidates.push({value:totalFirst?values[0]:values.at(-1)!,page:line.page,method:'PDF residency table Total column'});
      const breakdown=hasTotalColumn?(totalFirst?values.slice(1):values.slice(0,-1)):values;
      const componentCount=header&&/\bunknown\b/i.test(header.text)?4:3;
      if(breakdown.length===componentCount&&residencyHeader)candidates.push({value:breakdown.reduce((n,v)=>n+v,0),page:line.page,method:'sum of PDF residency counts'});
    }
    delete r.metrics[key];delete r.evidence[key];
    if(candidates.length&&candidates.every(c=>c.value===candidates[0].value)) {
      const first=candidates[0];put(key,first.value,'C1',first.page,[...new Set(candidates.map(c=>c.method))].join('; cross-checked with '));
    } else if(candidates.length)r.warnings.push(`C1 ${key} totals disagree across the PDF's reported breakdowns (${[...new Set(candidates.map(c=>c.value))].join(', ')}). Check the source and enter the correct total before saving.`);
  }
  const patterns:[string,number,RegExp][]=[
    ['waitlist_offered',2,/Number of qualified applicants (?:offered|placed).*?([\d,]+)\s*$/i],
    ['waitlist_accepted',2,/Number accepting a place.*?([\d,]+)\s*$/i],
    ['waitlist_admitted',2,/Number of wait.listed students admitted.*?([\d,]+)\s*$/i],
    ['ed_applicants',21,/Number of early decision applications received.*?([\d,]+)\s*$/i],
    ['ed_admitted',21,/Number of applicants admitted under early decision plan.*?([\d,]+)\s*$/i],
    ['fee',13,/Amount of (?:the )?application fee\s*:?\s*\$?\s*([\d.]+)\s*$/i],
    ['top_tenth',10,/Percent in top (?:tenth|10th).*?([\d.]+)%?\s*$/i],
    ['top_quarter',10,/Percent in top quarter.*?([\d.]+)%?\s*$/i],
    ['top_half',10,/Percent in top half[^%]*?([\d.]+)%/i],
    ['rank_submitted',10,/.*submitted.*high school.*rank.*?([\d.]+)%?\s*$/i],
  ];
  for(const [key,n,pattern] of patterns)if(r.metrics[key]===undefined)for(const line of sectionLines(n)){const match=line.text.match(pattern);if(match){if(n===21&&new RegExp(`\\bFall\\s+${match[1]}\\s*$`,'i').test(line.text))continue;put(key,number(match[1]),`C${n}`,line.page);break;}}
  for(const [key,prefix,label] of [['sat','SAT1_COMP',/^SAT (?:I )?Composite/i],['reading','SAT1_VERB',/^SAT (?:I )?(?:Evidence.Based Reading|Critical Reading|Verbal)/i],['math','SAT1_MATH',/^SAT (?:I )?Math/i],['act','ACT_COMP',/^ACT Composite/i]] as const) {
    for(const pct of [25,50,75]){const f=fields.get(`${prefix}_${pct}TH_P`);if(f)put(`${key}_${pct}`,number(f.value),'C9',f.page,'PDF form field');}
    if(r.metrics[`${key}_25`]!==undefined)continue;
    const scoreLines=sectionLines(9);
    for(const [i,line] of scoreLines.entries()) {
      if(!label.test(line.text.trim()))continue;
      let text=line.text;
      // A wrapped reading/writing label can place all score columns on the next line.
      const next=scoreLines[i+1];
      if(!/\b\d{2,4}\b/.test(text)&&next?.page===line.page&&/^(?:Writing\s*)?[\d\s,]+(?:\s*Writing)?$/i.test(next.text.trim()))text+=' '+next.text;
      text=text.replace(/\(\s*\d+\s*-\s*\d+\s*\)/g,'').replace(/(\d),(?=\d{3}\b)/g,'$1');
      const values=[...text.matchAll(/\b\d{2,4}\b/g)].map(m=>Number(m[0]));
      const min=key==='act'?1:200,max=key==='act'?36:key==='sat'?1600:800;
      if([2,3].includes(values.length)&&values.every(v=>v>=min&&v<=max)) {
        const pcts=values.length===3?[25,50,75]:[25,75];values.forEach((v,i)=>put(`${key}_${pcts[i]}`,v,'C9',line.page));break;
      }
    }
  }
  for(const key of ['sat','act'])if(r.metrics[`${key}_submitted`]===undefined)for(const line of sectionLines(9)) {
    const match=line.text.match(new RegExp(`^Submitting ${key} Scores\\s+([\\d.]+)%?\\s+(?:Number submitting ${key} scores\\s+)?([\\d,]+)`,'i'));
    if(match){put(`${key}_submitted`,number(match[1]),'C9',line.page);put(`${key}_submitted_count`,number(match[2]),'C9',line.page);break;}
  }
  for(const [prefix,names] of [['Q111_',factorNames.slice(0,6)],['Q112_',factorNames.slice(6)]] as const)names.forEach((label,i)=>{
    const f=fields.get(prefix+(i+1));const rating=f?({VI:ratings[0],I:ratings[1],C:ratings[2],NC:ratings[3]} as Record<string,string>)[f.value.trim()]:undefined;
    if(rating)r.factors.push({label,rating,page:f!.page});
  });
  if(!r.factors.length) {
    const lines=sectionLines(7);
    const header=lines.find(l=>/Very\s*Important/i.test(l.text)&&/Considered/i.test(l.text));
    if(header) {
      const words=header.words.flatMap(w=>{let used=0;return w.str.split(/\s+/).filter(Boolean).map(s=>{const word={...w,str:s,x:w.x+w.width*used/Math.max(1,w.str.length),width:w.width*s.length/Math.max(1,w.str.length)};used+=s.length+1;return word;});});
      const anchors=words.filter(w=>/^(Very|Important|Considered|Not)$/i.test(w.str));
      const very=anchors.find(w=>/^Very$/i.test(w.str));const important=anchors.filter(w=>/^Important$/i.test(w.str)).at(-1);const considered=anchors.find(w=>/^Considered$/i.test(w.str));const not=anchors.find(w=>/^Not$/i.test(w.str));
      if(very&&important&&considered&&not) {
        const xs=[very.x+25,important.x+important.width/2,considered.x+considered.width/2,not.x+20];
        for(const name of factorNames) {
          const normalized=name.toLowerCase().replace(/[’']/g,'');
          const line=lines.find(l=>l.text.toLowerCase().replace(/[’']/g,'').includes(normalized)||name==='Recommendations'&&/Recommendation\(s\)/i.test(l.text));
          if(!line)continue;const marks=line.words.filter(w=>/^[xX✓✔]$/.test(w.str.trim())&&w.x>very.x-10);
          if(marks.length===1){const x=marks[0].x+marks[0].width/2,index=xs.reduce((best,v,i)=>Math.abs(x-v)<Math.abs(x-xs[best])?i:best,0);r.factors.push({label:name,rating:ratings[index],page:line.page});}
        }
      }
    }
  }
  for(const [key,prefix,section] of [['rd_deadline','AP_DL_FRSH','C14'],['ed_deadline','AP_DL_EDEC_1','C21'],['ed_notification','AP_NOTF_DL_EDEC_1','C21']]) {
    const month=fields.get(prefix+'_MON'),day=fields.get(prefix+'_DAY');
    if(month&&day&&number(month.value)!==null&&number(day.value)!==null)put(key,`${month.value}/${day.value}`,section,month.page,'PDF form field');
  }
  const policy=fields.get('EXAM_CODE_S1A');if(policy)put('test_policy',({ADMS_REQ:'Required',ADMS_CONSIDER:'Not required; considered if submitted',ADMS_REC:'Recommended',ADMS_NCONSIDER:'Not considered'} as Record<string,string>)[policy.value.trim()]??null,'C8',policy.page,'PDF form field');
  for(const [key,n,d,section] of [['admit_rate','admitted','applicants','C1'],['yield_rate','enrolled','admitted','C1'],['ed_rate','ed_admitted','ed_applicants','C21'],['waitlist_rate','waitlist_admitted','waitlist_accepted','C2']])if(typeof r.metrics[n]==='number'&&typeof r.metrics[d]==='number'&&r.metrics[d]>0)put(key,100*Number(r.metrics[n])/Number(r.metrics[d]),section,r.evidence[n]?.page??null,'calculated');
  const missing=['applicants','admitted','enrolled'].filter(k=>r.metrics[k]===undefined);
  if(missing.length)r.warnings.push('Some headline counts could not be extracted reliably. Fill the highlighted fields from C1 before saving.');
  if(r.factors.length<factorNames.length)r.warnings.push('Some admissions factor ratings were not identified. Check C7 in the original PDF; blank or unrecognized ratings are not inferred.');
  if(!year)r.warnings.push('The fall cohort year could not be determined. Enter it from C1.');
  if(document.year&&year&&document.year!==year)r.warnings.push(`The archive link suggests ${document.year}, but C1 reports fall ${year}. Verify the cohort year.`);
  r.warnings.push('Automatically extracted from PDF fields and text. Review all figures against the source. Missing responses are not inferred.','Admissions policies may refer to a later application cycle than the reported cohort.');
  return enrichMetrics(r,pages);
}

export async function extractPDF(buffer:ArrayBuffer,document:SourceDocument,indexURL:string,signal:AbortSignal,onProgress:(text:string)=>void):Promise<Report> {
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
  const abort=()=>{void task.destroy();};signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();throw new Error('Extraction canceled.');}
  try {
    const doc=await task.promise;if(doc.numPages>200)throw new Error('This PDF has over 200 pages. Use the Common Data Set report rather than a full fact book.');
    const pages:PDFPage[]=[];
    for(let n=1;n<=doc.numPages;n++) {
      if(signal.aborted)throw new Error('Extraction canceled.');onProgress(`Reading PDF page ${n} of ${doc.numPages}…`);
      const page=await doc.getPage(n),content=await page.getTextContent(),annotations=await page.getAnnotations();
      const words:PDFWord[]=content.items.filter((i):i is import('pdfjs-dist/types/src/display/api').TextItem=>'str' in i).map(i=>({str:i.str,x:i.transform[4],y:i.transform[5],width:i.width})).filter(w=>w.str.trim());
      const lines:PDFLine[]=[];
      for(const word of words.sort((a,b)=>b.y-a.y||a.x-b.x)) {
        const line=lines.find(l=>Math.abs(l.words[0].y-word.y)<3);if(line)line.words.push(word);else lines.push({text:'',words:[word]});
      }
      for(const line of lines){line.words.sort((a,b)=>a.x-b.x);line.text=line.words.map(w=>w.str).join(' ').replace(/\s+/g,' ').trim();}
      const seen=new Set<string>();const form_fields:PDFPage['form_fields']=[];
      for(const annotation of annotations) {
        if(!annotation.fieldName||seen.has(annotation.fieldName))continue;
        const value=Array.isArray(annotation.fieldValue)?annotation.fieldValue.join(', '):String(annotation.fieldValue??'').trim();
        if(!value||['Off','false'].includes(value))continue;seen.add(annotation.fieldName);
        form_fields.push({name:annotation.fieldName,value,label:annotation.alternativeText??null,rect:annotation.rect});
      }
      pages.push({page:n,text:lines.map(l=>l.text).join('\n'),lines,form_fields});page.cleanup();
    }
    if(pages.reduce((n,p)=>n+p.text.length,0)<200)throw new Error('This appears to be an image-only PDF. Automatic extraction needs selectable text or filled form fields; OCR is not available yet.');
    return normalizePDF(pages,document,indexURL,sha256);
  } finally {signal.removeEventListener('abort',abort);await task.destroy();}
}
