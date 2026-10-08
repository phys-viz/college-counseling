import {discoverSources} from '@/lib/discover-sources';
import {fetchPublicSource} from '@/lib/public-source';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)return Response.json({error:'Cross-site requests are not allowed.'},{status:403});
  try {
    const text=await request.text();if(text.length>4000)return Response.json({error:'The link is too long.'},{status:400});
    const input=JSON.parse(text) as {url?:unknown;mode?:unknown};
    if(typeof input.url!=='string'||input.url.length>2000||!['discover','download'].includes(String(input.mode)))return Response.json({error:'Provide a school webpage or PDF link.'},{status:400});
    if(input.mode==='discover')return Response.json(await discoverSources(input.url,request.signal));
    const source=await fetchPublicSource(input.url,25_000_000,request.signal);
    if(new TextDecoder().decode(source.bytes.slice(0,5))!=='%PDF-')return Response.json({error:'This link did not return a PDF. Use the document download link.'},{status:400});
    return new Response(source.bytes.buffer as ArrayBuffer,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Source-URL':encodeURIComponent(source.url)}});
  } catch(e) {return Response.json({error:e instanceof Error?e.message:'The source could not be opened.'},{status:400});}
}
