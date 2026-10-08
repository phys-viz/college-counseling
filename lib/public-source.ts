// These endpoints retrieve public documents only; never forward a visitor's credentials.
export function sourceURL(value:string) {
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(u.hostname)||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname))
    throw new Error('Use a public HTTP or HTTPS school webpage or PDF link.');
  u.hash='';return u;
}
function publicAddress(ip:string) {
  if(ip.includes(':'))return /^[23][0-9a-f]{3}:/i.test(ip)&&!ip.toLowerCase().startsWith('2001:db8:');
  const p=ip.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  const [a,b,c]=p;
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
async function checkDNS(host:string,signal:AbortSignal) {
  const responses=await Promise.all(['A','AAAA'].map(async type=>{
    const r=await fetch('https://cloudflare-dns.com/dns-query?'+new URLSearchParams({name:host,type}),{headers:{Accept:'application/dns-json'},signal});
    if(!r.ok)throw new Error('Could not verify the document server. Please retry.');
    return await r.json() as {Answer?:{type:number;data:string}[];Status:number};
  }));
  const addresses=responses.flatMap(r=>r.Answer??[]).filter(r=>r.type===1||r.type===28);
  if(!addresses.length||addresses.some(r=>!publicAddress(r.data)))throw new Error('The link must point to a public document server.');
}
export async function fetchPublicSource(value:string,maxBytes:number,signal?:AbortSignal):Promise<{url:string;bytes:Uint8Array;type:string}> {
  let url=sourceURL(value);const controller=new AbortController();
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)controller.abort();
  const timer=setTimeout(()=>controller.abort(),25000);
  try {
    for(let redirects=0;redirects<=5;redirects++) {
      await checkDNS(url.hostname,controller.signal);
      const r=await fetch(url.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'text/html,application/pdf;q=0.9'}});
      if([301,302,303,307,308].includes(r.status)) {
        const location=r.headers.get('location');await r.body?.cancel();if(!location)throw new Error('The source redirected without a document link.');
        url=sourceURL(new URL(location,url).href);continue;
      }
      if(!r.ok){await r.body?.cancel();throw new Error(`The school server returned ${r.status}. Try the direct PDF link.`);}
      if(Number(r.headers.get('content-length'))>maxBytes){await r.body?.cancel();throw new Error(`The document is too large (maximum ${Math.round(maxBytes/1_000_000)} MB).`);}
      const reader=r.body?.getReader();if(!reader)throw new Error('The source returned an empty response.');
      const chunks:Uint8Array[]=[];let length=0;
      try {while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes){await reader.cancel();throw new Error('The source exceeded the download size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return {url:url.href,bytes,type:r.headers.get('content-type')??''};
    }
    throw new Error('The source redirected too many times. Use its final PDF link.');
  } catch(e) {
    if(controller.signal.aborted)throw new Error('The document server took too long to respond. Try again or use a direct PDF link.');
    throw e;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
