import {parseHTML} from 'linkedom/worker';
import {fetchPublicSource,sourceURL} from './public-source';
import {sourceYear,type SourceDiscovery,type SourceDocument} from './source-types';
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
// A filename underscore is a separator even though it is a regex word character.
// Also recognize historical CDS+year filenames, without matching names like cdsmith.
const cdsLabel=/common[\s_-]*data[\s_-]*set|(?:^|[^a-z0-9])cds(?=$|[^a-z0-9]|(?:19|20)\d{2})/i;
const workbook=/\.(?:xlsx?|xlsm)(?:[?#]|$)/i;
const wordDocument=/\.docx(?:[?#]|$)/i;
function linkedYear(url:URL,label:string,accessibleLabel:string,context:string) {
  // Campus archive rows can contain several neighboring report years. A file's
  // own label/name takes precedence over those sibling cells and upload dates.
  let filename=url.pathname.split('/').pop()??'';
  try{filename=decodeURIComponent(filename);}catch{/* Keep an invalidly escaped filename as supplied. */}
  return sourceYear(accessibleLabel)??sourceYear(label)??sourceYear(filename)??sourceYear(url.href)??sourceYear(context);
}
export async function discoverSources(value:string,signal?:AbortSignal):Promise<SourceDiscovery> {
  const first=await fetchPublicSource(value,25_000_000,signal);
  if(new TextDecoder().decode(first.bytes.slice(0,5))==='%PDF-')return {index_url:first.url,title:'Common Data Set PDF',documents:[{url:first.url,title:decodeURIComponent(new URL(first.url).pathname.split('/').pop()??'PDF report'),year:sourceYear(first.url)}],notes:[]};
  if(workbook.test(first.url))return {index_url:first.url,title:'Common Data Set spreadsheet',documents:[],notes:['This source is an Excel spreadsheet. Automatic extraction currently supports PDFs; use a reviewed source adapter or JSON import for spreadsheet data.']};
  if(wordDocument.test(first.url))return {index_url:first.url,title:'Common Data Set Word document',documents:[],notes:['This source is a Word document. Automatic extraction currently supports PDFs; use a reviewed source adapter or JSON import for Word data.']};
  if(first.bytes.length>3_000_000)throw new Error('The webpage is too large. Use the Common Data Set archive page or a direct PDF link.');
  const documents=new Map<string,SourceDocument>(),pages:string[]=[];
  const spreadsheets=new Set<string>(),wordDocuments=new Set<string>(),viewers=new Set<string>();let nonPDF=0;
  function parse(bytes:Uint8Array,base:string,follow:boolean) {
    const {document}=parseHTML(new TextDecoder().decode(bytes));
    let linkBase=base;
    const declaredBase=document.querySelector('base[href]')?.getAttribute('href');
    if(declaredBase)try{linkBase=sourceURL(new URL(declaredBase,base).href).href;}catch{/* Ignore invalid base URLs. */}
    const anchors=[...document.querySelectorAll('a[href],option[value]')];
    const pageIsCDS=cdsLabel.test(clean(document.querySelector('h1')?.textContent??document.title??''));
    const hasCDSLinks=anchors.some(el=>cdsLabel.test((el.textContent??'')+' '+(el.getAttribute('href')??el.getAttribute('value')??'')+' '+(el.getAttribute('aria-label')??''))&&/\.pdf(?:[?#]|$)/i.test(el.getAttribute('href')??el.getAttribute('value')??''));
    for(const el of anchors) {
      const href=el.getAttribute(el.tagName==='OPTION'?'value':'href');if(!href)continue;
      let url:URL;try{url=sourceURL(new URL(href,linkBase).href);}catch{continue;}
      const label=clean(el.textContent??''),accessibleLabel=clean(el.getAttribute('aria-label')??el.getAttribute('title')??'');
      let context=clean(el.closest('li,tr')?.textContent??label).slice(0,400);
      const adjacent=clean(el.closest('p')?.previousElementSibling?.textContent??'');
      if(sourceYear(context)===null&&/^(?:Fall\s+)?(?:19|20)\d{2}(?:\s*[-\u2013]\s*(?:\d{2}|\d{4}))?$/i.test(adjacent))context=adjacent+' '+context;
      const relevant=cdsLabel.test(label+' '+accessibleLabel+' '+context+' '+url.pathname)||pageIsCDS&&sourceYear(label)!==null;
      if(relevant&&/\bappendix\b/i.test(label+' '+accessibleLabel))continue;
      if(workbook.test(url.href)) {if(relevant)spreadsheets.add(url.href);continue;}
      if(wordDocument.test(url.href)) {if(relevant)wordDocuments.add(url.href);continue;}
      if(relevant&&(/^(?:drive\.google\.com|acrobat\.adobe\.com)$/.test(url.hostname)||/(?:^|\.)box\.com$/.test(url.hostname)&&!/\.pdf(?:[?#]|$)/i.test(url.href))) {viewers.add(url.href);continue;}
      const publicDownload=cdsLabel.test(label+' '+accessibleLabel+' '+context)&&linkedYear(url,label,accessibleLabel,context)!==null&&/\/(?:media\/\d+\/)?download\/?$/i.test(url.pathname);
      if(/\.pdf(?:[?#]|$)/i.test(url.href)||publicDownload||/\bpdf\b/i.test(label)&&/common.?data|\bcds\b/i.test(context+' '+url.href)) {
        // Mixed survey pages also link IPEDS feedback, calendars and guides.
        // Prefer explicitly labeled CDS files when such links exist.
        if(hasCDSLinks&&!relevant)continue;
        const year=linkedYear(url,label,accessibleLabel,context);
        documents.set(url.href,{url:url.href,title:accessibleLabel||label||context||decodeURIComponent(url.pathname.split('/').pop()??'PDF report'),year});
      } else if(follow&&url.href!==base&&cdsLabel.test(label+' '+url.pathname)) {
        if(el.tagName==='OPTION'&&sourceYear(label)!==null)nonPDF++;
        else if(new URL(base).hostname===url.hostname&&!pages.includes(url.href))pages.push(url.href);
      }
    }
    return clean(document.querySelector('h1')?.textContent??document.title??'Common Data Set archive');
  }
  const title=parse(first.bytes,first.url,true),notes:string[]=[];
  // Follow a few relevant archive links, rather than crawling an institution's entire site.
  if(pages.length) {
    const results=await Promise.allSettled(pages.slice(0,4).map(async url=>{
      const page=await fetchPublicSource(url,3_000_000,signal);parse(page.bytes,page.url,false);
    }));
    if(results.some(r=>r.status==='rejected'))notes.push('Some archive pages could not be opened. You can try their direct PDF links.');
  }
  if(spreadsheets.size)notes.push(`${spreadsheets.size} linked report${spreadsheets.size===1?' uses':'s use'} Excel spreadsheets. Automatic extraction currently supports PDFs; spreadsheets require a reviewed source adapter or JSON import.`);
  if(wordDocuments.size)notes.push(`${wordDocuments.size} linked report${wordDocuments.size===1?' uses':'s use'} Word documents. Automatic extraction currently supports PDFs; Word documents require a reviewed source adapter or JSON import.`);
  if(viewers.size)notes.push('Some reports are linked through a hosted document viewer or folder. Open the archive to obtain a public PDF download link, then paste that link here.');
  if(nonPDF)notes.push(`${nonPDF} older archive entries use webpages rather than PDFs. This importer extracts PDF reports.`);
  const isSection=(d:SourceDocument)=>/^(?:Section\s+)?[A-J][.\s-]/i.test(d.title)||/\bCDS[-_ ]\d{4}[-_ ]\d{4}[-_ ][A-J](?:[-_ ]updated)?\.pdf(?:[?#]|$)/i.test(d.url);
  const completeYears=new Set([...documents.values()].filter(d=>!isSection(d)&&d.year!==null).map(d=>d.year));
  const all=[...documents.values()].filter(d=>!isSection(d)||d.year===null||!completeYears.has(d.year)).sort((a,b)=>(b.year??0)-(a.year??0));
  if(all.length>80)notes.push('Showing the first 80 PDF links. Use a more specific archive page for additional reports.');
  return {index_url:first.url,title,documents:all.slice(0,80),notes};
}
