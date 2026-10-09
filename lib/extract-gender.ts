import type {Report} from './report-types';
import type {PDFLine} from './extract-pdf';
type Line=PDFLine&{page:number};
const integer=(s:string)=>/^_*\d[\d,]*(?:\.0+)?_*$/.test(s.trim())?Number(s.replace(/[,_]/g,'')):null;
const group=(s:string)=>/unknowns?\s+(?:gender|sex)/i.test(s)?'unknown_gender':/another\s+gender|non.binary/i.test(s)?'another_gender':/\bwomen\b|\bfemales?\b/i.test(s)?'female':/\bmen\b|\bmales?\b/i.test(s)?'male':null;
const outcome=(s:string)=>/\bapplied\b|\bapplications by\b/i.test(s)?'applicants':/\badmitted\b|\boffers to\b|\boffered.*admission/i.test(s)?'admitted':/\benrolled\b/i.test(s)?'enrolled':null;

// Canonical matching text only. Raw source lines and coordinates remain intact.
export function canonicalC1(lines:Line[]):Line[]{
 let region='';
 return lines.map((l,i)=>{
  let text=l.text;
  // Narrow, tall residency cells can wrap the header and the final row verb.
  // Keep the physical source untouched, but reconcile all reported totals.
  if(/INTERNATIONAL\s+TOTAL\s*$/i.test(text)&&!/^Total\b/i.test(text)){
   const header=lines.slice(Math.max(0,i-3),i+3).filter(x=>x.page===l.page&&!/^Total\b/i.test(x.text)).map(x=>x.text).join(' ');
   if(/\bIN-\b|\bIN-\s/i.test(header)&&/\bOUT-/i.test(header)&&/\bSTATE\b/i.test(header))text='In-State Out-of-State International Total';
  }
  text=text.replace(/^subsequently offered admission\.\s+(?=Total first[- ]time, first[- ]year)/i,'');
  if(/First.Time, First.Year.*\b(?:In-State|Out-of-State|International|Unknown)(?:\s+Total)?\s*$/i.test(text)&&(text.match(/\b(?:In-State|Out-of-State|International|Unknown)\b/gi)??[]).length===1)region=text.match(/\b(In-State|Out-of-State|International|Unknown)(?:\s+Total)?\s*$/i)![1];
  if(/^Total\b/i.test(text)){
   text=text.replace(/\s+sum\s*=.*$/i,'').replace(/\s+\(\d+(?:\.\d+)?%.*$/,'').replace(/\s+(?:applications|of admitted|of adm)\)\s*$/i,'');
   text=text.replace(/^(Total) applications by (men|women)(.*)admission\s+/i,'$1 $2$3applied ').replace(/^(Total) offers to (men|women)(.*)admission\s+/i,'$1 $2$3admitted ').replace(/offered first-time, first-year(?:\s*\(freshman\))? admission\s+/i,'admitted ').replace(/applied for first-time, first-year(?:\s*\(freshman\))? admission\s+/i,'applied ');
   // Wrapped final verb or a single answer line, confined to this physical page.
   const next=lines[i+1];
   const after=lines[i+2];
   if(next?.page===l.page&&after?.page===l.page&&!/\b(?:applied|admitted|enrolled)\b/i.test(text)&&/^\d[\d,]*(?:\s+\d[\d,]*){1,4}$/.test(next.text)&&/^(?:who\s+)?(?:were\s+)?(?:applied|admitted|enrolled)$/i.test(after.text))text+=' '+after.text+' '+next.text;
   else if(next?.page===l.page&&/\bwho\s*$/.test(text)&&/^(?:were )?(?:applied|admitted|enrolled)(?:\s+\d[\d,]*(?:\.0+)?)?$/i.test(next.text))text+=' '+next.text;
   else if(l.words.length&&next?.page===l.page&&/\b(?:applied|admitted|enrolled)\s*$/.test(text)&&integer(next.text)!==null&&integer(lines[i-1]?.text??'')===null)text+=' '+next.text;
  }
  return {...l,text:region&&/^Total\b/i.test(text)?region+' '+text:text};
 });
}

export function extractGender(r:Report,lines:Line[],fields:Map<string,{name:string;value:string;page:number}>){
 const candidates=new Map<string,{value:number;page:number;method:string}[]>();
 const totals:Record<string,{value:number;page:number;method:string}[]>={applicants:[],admitted:[],enrolled:[]};
 const add=(key:string,value:number|null,page:number,method:string)=>{if(value!==null)candidates.set(key,[...candidates.get(key)??[],{value,page,method}]);};
 for(const [key,prefix] of [['applicants','AP_RECD_1ST_'],['admitted','AP_ADMT_1ST_'],['enrolled','EN_TOT_1ST_']]){
  for(const [g,suffix] of [['male','MEN_N'],['female','WMN_N'],['another_gender','NON_BINARY_N'],['unknown_gender','UNK_N']]){
   const direct=fields.get(prefix+suffix);
   if(direct)add(`${g}_${key}`,integer(direct.value),direct.page,'PDF gender form field '+direct.name);
   else if(key==='enrolled'){
    const ft=fields.get(prefix+'FT_'+suffix),pt=fields.get(prefix+'PT_'+suffix);
    if(ft&&pt&&integer(ft.value)!==null&&integer(pt.value)!==null)add(`${g}_${key}`,integer(ft.value)!+integer(pt.value)!,ft.page,'sum of full-time and part-time PDF gender form fields');
   }
  }
 }
 const rows=lines.filter(l=>/^Total\b/i.test(l.text)&&group(l.text)&&outcome(l.text));
 for(const g of ['male','female','another_gender','unknown_gender'])for(const key of ['applicants','admitted','enrolled']){
  const matching=rows.filter(l=>group(l.text)===g&&outcome(l.text)===key);
  const overall=matching.filter(l=>!/(?:full|part)\s*-\s*time/i.test(l.text));
  const value=(l:Line)=>{const m=l.text.match(/\b(?:applied|admitted|enrolled)(?:\s+in\s+Fall\s+\d{4})?\s*:?\s*([\d,_ .]+)$/i);const cells=m?.[1].trim().split(/\s+/).map(integer)??[];return cells.length===1?cells[0]:null;};
  if(overall.length)for(const l of overall)add(`${g}_${key}`,value(l),l.page,'PDF labeled gender count');
  if(key==='enrolled'){
   const ft=matching.filter(l=>/full\s*-\s*time/i.test(l.text)),pt=matching.filter(l=>/part\s*-\s*time/i.test(l.text));
   if(ft.length===1&&pt.length===1){
    let a=value(ft[0]);const b=/\benrolled\s+(?:n\s*\/\s*a|not applicable)\s*$/i.test(pt[0].text)?0:value(pt[0]);
    // NYU merged full-time and overall cells require an exact status reconciliation.
    if(a===null&&b!==null){const cells=ft[0].text.match(/enrolled\s+([\d,]+)\s+([\d,]+)$/i);if(cells&&integer(cells[1])!+b===integer(cells[2]))a=integer(cells[1]);}
    if(a!==null&&b!==null)add(`${g}_${key}`,a+b,ft[0].page,'sum of full-time and part-time PDF gender counts');
   }
  }
 }
 // Geometry maps numeric cells to gender headers, preserving empty columns and
 // keeping the overall Total column separate. Word positions come from PDF.js.
 let anchors:{g:string;x:number;width:number}[]=[];
 for(const [i,l] of lines.entries()){
  if(/\b(?:Men|Males?)\b/i.test(l.text)&&/\b(?:Women|Females?)\b/i.test(l.text)&&!/^Total\b/i.test(l.text)){
   const header=lines.slice(Math.max(0,i-2),i+3).filter(x=>x.page===l.page&&!/^Total\b/i.test(x.text));
   anchors=header.flatMap(h=>h.words).filter(w=>/^(?:Men|Women|Males?|Females?|Another|Unknown|Total)$/i.test(w.str)).map(w=>({g:group(w.str==='Another'?'another gender':w.str==='Unknown'?'unknown gender':w.str)??'total',x:w.x,width:w.width}));
  }
  if(/\bIn[- ]State\b/i.test(l.text))anchors=[];
  const key=outcome(l.text);if(!key||!/^Total\b/i.test(l.text)||group(l.text)||!anchors.some(a=>a.g==='male')||!anchors.some(a=>a.g==='female'))continue;
  const numbers=l.words.filter(w=>integer(w.str)!==null&&w.x>Math.min(...anchors.map(a=>a.x))-20);
  const mapped=new Map<string,number>();let valid=true;
  for(const w of numbers){const x=w.x+w.width/2;const sorted=anchors.map(a=>({...a,dist:Math.abs(x-(a.x+a.width/2))})).sort((a,b)=>a.dist-b.dist);const a=sorted[0];if(a.dist>40||mapped.has(a.g)){valid=false;break;}mapped.set(a.g,integer(w.str)!);}
  if(!valid)continue;
  for(const [g,v] of mapped)if(g!=='total')add(`${g}_${key}`,v,l.page,'PDF gender column aligned to header');
  const total=mapped.get('total');
  if(total!==undefined)totals[key].push({value:total,page:l.page,method:'PDF gender table Total column'});
  else if(mapped.size===new Set(anchors.map(a=>a.g)).size&&mapped.has('male')&&mapped.has('female'))totals[key].push({value:[...mapped.values()].reduce((a,b)=>a+b,0),page:l.page,method:'sum of complete PDF gender columns'});
 }
 // Saved records may retain text without word geometry. Only use complete
 // ordered columns under an explicit header; an omitted column is ambiguous.
 let columns:string[]=[];
 for(const [i,l] of lines.entries()){
  if(/\bMen\b.*\bWomen\b/i.test(l.text)&&!/^Total\b/i.test(l.text)){
   const header=lines.slice(Math.max(0,i-2),i+3).filter(x=>x.page===l.page&&!/^Total\b/i.test(x.text)).map(x=>x.text).join(' ');
   columns=['male','female',...(/\bAnother\b.*\bGender\b/i.test(header)?['another_gender']:[]),...(/\bUnknown\b.*\b(?:Gender|Sex)\b/i.test(header)?['unknown_gender']:[]),...(/\bTotal\b/i.test(header)?['total']:[])];
  }
  if(/\bIn[- ]State\b/i.test(l.text))columns=[];
  const key=outcome(l.text);if(l.words.length||!columns.length||!key||!/^Total\b/i.test(l.text)||group(l.text))continue;
  const m=l.text.match(/\b(?:applied|admitted|enrolled)(?:\s+in\s+Fall\s+\d{4})?\s+([\d,_ .]+)$/i),cells=m?.[1].trim().split(/\s+/).map(integer)??[];
  if(cells.length===columns.length&&cells.every(v=>v!==null))for(const [j,g] of columns.entries())if(g!=='total')add(`${g}_${key}`,cells[j],l.page,'preserved source text: complete gender columns');
 }
 for(const [key,list] of candidates){
  if(list.every(c=>c.value===list[0].value)){r.metrics[key]=list[0].value;r.evidence[key]={section:'C1',page:list[0].page,method:[...new Set(list.map(c=>c.method))].join('; cross-checked with ')};}
  else r.warnings.push(`C1 ${key}: reported gender counts disagree (${[...new Set(list.map(c=>c.value))].join(', ')}); left unfilled for review.`);
 }
 return totals;
}

/** Add only missing gender fields from retained evidence; never replace saved
 * counts, counselor corrections, source text or existing gender metrics. */
export function enrichSavedGender(r:Report):Report{
 const source=r.sections.flatMap(p=>p.text.split('\n').map(text=>({text:text.replace(/(?:CDS-[A-J]![A-Z]+\d+=)/g,'').replace(/\s*\|\s*/g,' ').normalize('NFKC').replace(/[\u00ad\u2010-\u2015\u2212]/g,'-').replace(/^C\s*\d+[A-Z]?(?:[.\s]+|$)/i,'').replace(/\s+/g,' ').trim(),words:[],page:p.page})));
 const end=source.findIndex(l=>/^First.time.*wait.list|^Freshman wait.list|^Do you have a policy of placing students on a waiting list/i.test(l.text));
 const lines=canonicalC1(end>=0?source.slice(0,end):source);
 const fields=new Map(r.sections.flatMap(p=>p.form_fields.map(f=>[f.name,{...f,page:p.page}] as const)));
 const draft:Report={...r,metrics:{},evidence:{},warnings:[]};extractGender(draft,lines,fields);
 for(const [key,value] of Object.entries(draft.metrics))if(r.metrics[key]===undefined){r.metrics[key]=value;r.evidence[key]={...draft.evidence[key],method:'retained source evidence: '+draft.evidence[key].method};}
 for(const warning of draft.warnings)if(!r.warnings.includes(warning))r.warnings.push(warning);
 return r;
}
