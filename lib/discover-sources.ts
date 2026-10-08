import {parseHTML} from 'linkedom/worker';
import {fetchPublicSource,sourceURL} from './public-source';
import {sourceYear,type SourceDiscovery,type SourceDocument} from './source-types';
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
export async function discoverSources(value:string,signal?:AbortSignal):Promise<SourceDiscovery> {
  const first=await fetchPublicSource(value,25_000_000,signal);
  if(new TextDecoder().decode(first.bytes.slice(0,5))==='%PDF-')return {index_url:first.url,title:'Common Data Set PDF',documents:[{url:first.url,title:decodeURIComponent(new URL(first.url).pathname.split('/').pop()??'PDF report'),year:sourceYear(first.url)}],notes:[]};
  if(first.bytes.length>3_000_000)throw new Error('The webpage is too large. Use the Common Data Set archive page or a direct PDF link.');
  const documents=new Map<string,SourceDocument>(),pages:string[]=[];
  let nonPDF=0;
  function parse(bytes:Uint8Array,base:string,follow:boolean) {
    const {document}=parseHTML(new TextDecoder().decode(bytes));
    for(const el of document.querySelectorAll('a[href],option[value]')) {
      const href=el.getAttribute(el.tagName==='OPTION'?'value':'href');if(!href)continue;
      let url:URL;try{url=sourceURL(new URL(href,base).href);}catch{continue;}
      const label=clean(el.textContent??''),context=clean(el.closest('li,tr')?.textContent??label).slice(0,400);
      if(/\.pdf(?:[?#]|$)/i.test(url.href)||/\bpdf\b/i.test(label)&&/common.?data|\bcds\b/i.test(context+' '+url.href)) {
        const year=sourceYear(context)??sourceYear(url.href);
        documents.set(url.href,{url:url.href,title:context||decodeURIComponent(url.pathname.split('/').pop()??'PDF report'),year});
      } else if(follow&&url.href!==base&&/common[\s_-]*data[\s_-]*set|\bcds\b/i.test(label+' '+url.pathname)) {
        if(el.tagName==='OPTION'&&sourceYear(label)!==null)nonPDF++;
        else if(new URL(base).hostname===url.hostname&&!pages.includes(url.href))pages.push(url.href);
      }
    }
    return clean(document.querySelector('h1')?.textContent??document.title??'Common Data Set archive');
  }
  const title=parse(first.bytes,first.url,true),notes:string[]=[];
  // Follow a few relevant archive links, rather than crawling an institution's entire site.
  if(!documents.size) {
    const results=await Promise.allSettled(pages.slice(0,4).map(async url=>{
      const page=await fetchPublicSource(url,3_000_000,signal);parse(page.bytes,page.url,false);
    }));
    if(results.some(r=>r.status==='rejected'))notes.push('Some archive pages could not be opened. You can try their direct PDF links.');
  }
  if(nonPDF)notes.push(`${nonPDF} older archive entries use webpages rather than PDFs. This importer extracts PDF reports.`);
  const all=[...documents.values()].sort((a,b)=>(b.year??0)-(a.year??0));
  if(all.length>80)notes.push('Showing the first 80 PDF links. Use a more specific archive page for additional reports.');
  return {index_url:first.url,title,documents:all.slice(0,80),notes};
}
