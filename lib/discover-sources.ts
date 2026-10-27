import {parseHTML} from 'linkedom/worker';
import {fetchPublicSource,sourceURL} from './public-source';
import {sourceYear,type SourceDiscovery,type SourceDocument} from './source-types';
import {isLegacyWorkbook,isWorkbookArchive} from './xlsx';
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
// A filename underscore is a separator even though it is a regex word character.
// Also recognize historical CDS+year filenames, without matching names like cdsmith.
const cdsLabel=/common[\s_-]*data[\s_-]*set|(?:^|[^a-z0-9])cds(?=$|[^a-z0-9]|(?:19|20)\d{2})/i;
// .xlsx/.xlsm workbooks are extracted; Excel 97–2003 .xls files are not.
const workbook=/\.(?:xlsx|xlsm)(?:[?#]|$)/i;
const legacyWorkbook=/\.xls(?:[?#]|$)/i;
const filename=(url:string)=>{const name=new URL(url).pathname.split('/').pop()??'';try{return decodeURIComponent(name);}catch{return name;}};
const wordDocument=/\.docx(?:[?#]|$)/i;
const pageFurniture='nav,footer,aside,[role="navigation"],[role="contentinfo"],[role="complementary"]';
const unrelatedLabel=/\b(?:privacy|non[- ]?discrimination|harassment|accessibility|handbook|calendar|IPEDS|feedback|security|crime|meeting|minutes)\b/i;
function linkedYear(url:URL,label:string,accessibleLabel:string,context:string) {
  // Campus archive rows can contain several neighboring report years. A file's
  // own label/name takes precedence over those sibling cells and upload dates.
  let filename=url.pathname.split('/').pop()??'';
  try{filename=decodeURIComponent(filename);}catch{/* Keep an invalidly escaped filename as supplied. */}
  return sourceYear(accessibleLabel)??sourceYear(label)??sourceYear(filename)??sourceYear(url.href)??sourceYear(context);
}
export async function discoverSources(value:string,signal?:AbortSignal):Promise<SourceDiscovery> {
  const first=await fetchPublicSource(value,25_000_000,signal);
  if(new TextDecoder().decode(first.bytes.slice(0,5))==='%PDF-')return {index_url:first.url,title:'Common Data Set PDF',documents:[{url:first.url,title:filename(first.url)||'PDF report',year:sourceYear(first.url)}],notes:[]};
  if(isWorkbookArchive(first.bytes))return {index_url:first.url,title:'Common Data Set spreadsheet',documents:[{url:first.url,title:filename(first.url)||'Spreadsheet report',year:sourceYear(first.url),format:'xlsx'}],notes:[]};
  if(isLegacyWorkbook(first.bytes)||legacyWorkbook.test(first.url))return {index_url:first.url,title:'Common Data Set spreadsheet',documents:[],notes:['This source is an Excel 97–2003 (.xls) workbook. Automatic extraction supports PDFs and .xlsx workbooks; use a reviewed source adapter or JSON import for .xls data.']};
  if(workbook.test(first.url))return {index_url:first.url,title:'Common Data Set spreadsheet',documents:[],notes:['This link did not return a readable Excel workbook. Open it to check the download, or paste the archive page instead.']};
  if(wordDocument.test(first.url))return {index_url:first.url,title:'Common Data Set Word document',documents:[],notes:['This source is a Word document. Automatic extraction currently supports PDFs; use a reviewed source adapter or JSON import for Word data.']};
  if(first.bytes.length>3_000_000)throw new Error('The webpage is too large. Use the Common Data Set archive page or a direct PDF link.');
  const documents=new Map<string,SourceDocument>(),otherDocuments=new Map<string,SourceDocument>(),pages:string[]=[];
  const spreadsheets=new Set<string>(),wordDocuments=new Set<string>(),viewers=new Set<string>();let nonPDF=0;
  function parse(bytes:Uint8Array,base:string,follow:boolean) {
    const {document}=parseHTML(new TextDecoder().decode(bytes));
    let linkBase=base;
    const declaredBase=document.querySelector('base[href]')?.getAttribute('href');
    if(declaredBase)try{linkBase=sourceURL(new URL(declaredBase,base).href).href;}catch{/* Ignore invalid base URLs. */}
    // Track heading hierarchy rather than inheriting the subject of an entire
    // mixed statistics page. A heading in a sibling <section> does not apply.
    const headings:{level:number;text:string;owner:Element|null}[]=[];
    for(const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],a[href],option[value]')) {
      if(/^H[1-6]$/.test(el.tagName)||el.getAttribute('role')==='heading') {
        if(el.closest(pageFurniture))continue;
        const level=Number(el.getAttribute('aria-level')??el.tagName.slice(1))||2;
        while(headings.length&&headings[headings.length-1].level>=level)headings.pop();
        headings.push({level,text:clean(el.textContent??''),owner:el.closest('section,article')});continue;
      }
      const href=el.getAttribute(el.tagName==='OPTION'?'value':'href');if(!href)continue;
      let url:URL;try{url=sourceURL(new URL(href,linkBase).href);}catch{continue;}
      const label=clean(el.textContent??''),accessibleLabel=clean(el.getAttribute('aria-label')??el.getAttribute('title')??'');
      let context=clean(el.closest('li,tr')?.textContent??label).slice(0,400);
      const adjacent=clean(el.closest('p')?.previousElementSibling?.textContent??'');
      if(sourceYear(context)===null&&/^(?:Fall\s+)?(?:19|20)\d{2}(?:\s*[-\u2013]\s*(?:\d{2}|\d{4}))?$/i.test(adjacent))context=adjacent+' '+context;
      let filename=url.pathname.split('/').pop()??'';try{filename=decodeURIComponent(filename);}catch{/* Keep the original path. */}
      // Parent directories such as /cds/privacy.pdf are not document evidence.
      const archivePath=/\/(?:cds|common[-_ ]data[-_ ]set)\/(?:19|20)\d{2}(?:[-_]\d{2,4})?\//i.test(url.pathname.replace(/%20/gi,' '));
      const explicit=cdsLabel.test(label+' '+accessibleLabel+' '+context+' '+filename)||archivePath&&!unrelatedLabel.test(label+' '+accessibleLabel+' '+filename);
      const scope=headings.filter(h=>!h.owner||h.owner.contains(el));
      const nearest=scope[scope.length-1]?.text??clean(document.title??'');
      const inCDSSection=scope.some(h=>cdsLabel.test(h.text))||!scope.length&&cdsLabel.test(nearest);
      const archiveHeading=cdsLabel.test(nearest)||/^(?:(?:previous|past|historical|archived?|annual|pdf|older)\s+)*(?:reports?|years?|downloads?|archives?)\b/i.test(nearest)||/^(?:Fall\s+)?(?:19|20)\d{2}/.test(nearest);
      const furniture=!!el.closest(pageFurniture);
      const year=linkedYear(url,label,accessibleLabel,context)??(inCDSSection&&archiveHeading?sourceYear(nearest):null);
      const relevant=explicit||!furniture&&inCDSSection&&archiveHeading&&year!==null&&!unrelatedLabel.test(label+' '+accessibleLabel);
      if(relevant&&/\bappendix\b/i.test(label+' '+accessibleLabel))continue;
      if(legacyWorkbook.test(url.href)) {if(relevant)spreadsheets.add(url.href);continue;}
      if(wordDocument.test(url.href)) {if(relevant)wordDocuments.add(url.href);continue;}
      if(relevant&&(/^(?:drive\.google\.com|acrobat\.adobe\.com)$/.test(url.hostname)||/(?:^|\.)box\.com$/.test(url.hostname)&&!/\.(?:pdf|xlsx|xlsm)(?:[?#]|$)/i.test(url.href))) {viewers.add(url.href);continue;}
      const publicDownload=relevant&&year!==null&&/\/(?:media\/\d+\/)?download\/?$/i.test(url.pathname);
      if(/\.pdf(?:[?#]|$)/i.test(url.href)||workbook.test(url.href)||publicDownload||/\bpdf\b/i.test(label)&&/common.?data|\bcds\b/i.test(context+' '+url.href)) {
        const candidate:SourceDocument={url:url.href,title:accessibleLabel||label||context||filename||(workbook.test(url.href)?'Spreadsheet report':'PDF report'),year,...workbook.test(url.href)?{format:'xlsx' as const}:{}};
        if(relevant){documents.set(url.href,candidate);otherDocuments.delete(url.href);}
        // Ambiguous content links remain recoverable, but never join Select all.
        else if(!furniture&&!unrelatedLabel.test(label+' '+accessibleLabel)&&!documents.has(url.href))otherDocuments.set(url.href,candidate);
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
  if(spreadsheets.size)notes.push(`${spreadsheets.size} linked report${spreadsheets.size===1?' uses an Excel 97–2003 (.xls) workbook':'s use Excel 97–2003 (.xls) workbooks'}. Automatic extraction supports PDFs and .xlsx workbooks; .xls files require a reviewed source adapter or JSON import.`);
  if(wordDocuments.size)notes.push(`${wordDocuments.size} linked report${wordDocuments.size===1?' uses':'s use'} Word documents. Automatic extraction currently supports PDFs; Word documents require a reviewed source adapter or JSON import.`);
  if(viewers.size)notes.push('Some reports are linked through a hosted document viewer or folder. Open the archive to obtain a public PDF download link, then paste that link here.');
  if(nonPDF)notes.push(`${nonPDF} older archive entries use webpages rather than PDFs. This importer extracts PDF and .xlsx reports.`);
  const isSection=(d:SourceDocument)=>/^(?:Section\s+)?[A-J][.\s-]/i.test(d.title)||/\bCDS[-_ ]\d{4}[-_ ]\d{4}[-_ ][A-J](?:[-_ ]updated)?\.pdf(?:[?#]|$)/i.test(d.url);
  const completeYears=new Set([...documents.values()].filter(d=>!isSection(d)&&d.year!==null).map(d=>d.year));
  const all=[...documents.values()].filter(d=>!isSection(d)||d.year===null||!completeYears.has(d.year)).sort((a,b)=>(b.year??0)-(a.year??0));
  const other=[...otherDocuments.values()].filter(d=>!documents.has(d.url)).sort((a,b)=>(b.year??0)-(a.year??0));
  if(all.length>80)notes.push('Showing the first 80 PDF links. Use a more specific archive page for additional reports.');
  if(other.length>80)notes.push('Showing the first 80 other PDF links. Use a more specific archive page for additional links.');
  return {index_url:first.url,title,documents:all.slice(0,80),other_documents:other.slice(0,80),notes};
}
