import type {PDFLine} from './extract-pdf';
type Line=PDFLine&{page:number};
type Count={value:number;page:number;method:string};
const integer=(s:string)=>/^\d[\d,]*$/.test(s)?Number(s.replaceAll(',','')):null;
const gender=(s:string)=>/^men$/i.test(s)?'male':/^women$/i.test(s)?'female':/^(?:another|other)$/i.test(s)?'another_gender':/^unknown$/i.test(s)?'unknown_gender':/^total$/i.test(s)?'total':null;

/** Compact C1 tables use Applicants/Offered admission rather than long Total
 * labels. Read complete ordered columns only, and reconcile explicit totals.
 * A dash or an absent status is never a zero. */
export function compactC1Columns(lines:Line[]) {
 const counts:Record<string,Count[]>={},totals:Record<string,Count[]>={applicants:[],admitted:[],enrolled:[]};
 let columns:string[]=[];let headerPage=0;
 const statuses=new Map<string,{full?:Count;part?:Count}>();
 const add=(key:string,c:Count)=>{(counts[key]??=[]).push(c);};
 for(const [i,l] of lines.entries()) {
  if(/\bMen\b.*\bWomen\b/i.test(l.text)&&!/^Total\b/i.test(l.text)) {
   const header=lines.slice(Math.max(0,i-2),i+3).filter(h=>h.page===l.page&&!/\d/.test(h.text)&&!/^Total\b/i.test(h.text));
   const tokens=header.flatMap(h=>h.words).filter(w=>gender(w.str));
   if(tokens.length)columns=[...new Set(tokens.sort((a,b)=>a.x-b.x).map(w=>gender(w.str)!))];
   else {
    const text=header.map(h=>h.text).join(' ');
    columns=['male','female',...(/\bAnother\b.*\bGender\b|\bOther\b/i.test(text)?['another_gender']:[]),...(/\bUnknown\b/i.test(text)?['unknown_gender']:[]),...(/\bTotal\b/i.test(text)?['total']:[])];
   }
   headerPage=l.page;
  }
  if(/\bIn[- ]State\b/i.test(l.text))columns=[];
  const match=l.text.match(/^(Applicants|Applied|Admitted|Offered admission|Full[- ]time enrolled|Part[- ]time enrolled|Enrolled)\s+([\d,\s]+)$/i);
  if(!match||l.page!==headerPage||!columns.includes('male')||!columns.includes('female'))continue;
  const cells=match[2].trim().split(/\s+/).map(integer);
  if(cells.length!==columns.length||cells.some(v=>v===null))continue;
  const key=/Applicants|Applied/i.test(match[1])?'applicants':/Admitted|Offered/i.test(match[1])?'admitted':'enrolled';
  const status=/^Full/i.test(match[1])?'full':/^Part/i.test(match[1])?'part':null;
  const values=new Map(columns.map((g,j)=>[g,cells[j]!]));
  const sum=[...values].filter(([g])=>g!=='total').reduce((n,[,v])=>n+v,0);
  for(const [g,v] of values) {
   const c={value:v,page:l.page,method:'PDF compact C1 '+(g==='total'?'explicit Total column':'complete gender column')};
   if(status) {
    const k=g+':'+headerPage,s=statuses.get(k)??{};
    // Repeated status rows cannot silently replace one another.
    if(s[status]){columns=[];continue;}
    s[status]=c;statuses.set(k,s);
   } else if(g==='total')totals[key].push(c);else add(g+'_'+key,c);
  }
  const c={value:sum,page:l.page,method:'sum of complete compact C1 gender columns'};
  if(status) {
   const k='sum:'+headerPage,s=statuses.get(k)??{};
   if(!s[status]){s[status]=c;statuses.set(k,s);}
  } else totals[key].push(c);
 }
 for(const [key,s] of statuses)if(s.full&&s.part) {
  const g=key.split(':')[0],c={value:s.full.value+s.part.value,page:s.full.page,method:'sum of explicit full-time and part-time compact C1 '+(g==='total'?'Total columns':'gender counts')};
  if(g==='total'||g==='sum')totals.enrolled.push(c);else add(g+'_enrolled',c);
 }
 return {counts,totals};
}
