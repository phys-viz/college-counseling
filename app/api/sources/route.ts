import {discoverSources} from '@/lib/discover-sources';
import {fetchPublicSource} from '@/lib/public-source';
import {isLegacyWorkbook,isWorkbookArchive} from '@/lib/xlsx';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)return Response.json({error:'Cross-site requests are not allowed.'},{status:403});
  try {
    const text=await request.text();if(text.length>4000)return Response.json({error:'The link is too long.'},{status:400});
    const input=JSON.parse(text) as {url?:unknown;mode?:unknown};
    if(typeof input.url!=='string'||input.url.length>2000||!['discover','download'].includes(String(input.mode)))return Response.json({error:'Provide a school webpage or PDF link.'},{status:400});
    if(input.mode==='discover')return Response.json(await discoverSources(input.url,request.signal));
    const source=await fetchPublicSource(input.url,25_000_000,request.signal);
    // Content decides the format; the browser extracts PDFs and .xlsx workbooks.
    const format=new TextDecoder().decode(source.bytes.slice(0,5))==='%PDF-'?'pdf':isWorkbookArchive(source.bytes)?'xlsx':null;
    if(!format)return Response.json({error:isLegacyWorkbook(source.bytes)?'This is an Excel 97–2003 (.xls) workbook. Automatic extraction supports PDFs and .xlsx workbooks; use a reviewed source adapter or JSON import.':'This link did not return a PDF or Excel workbook. Use the document download link.'},{status:400});
    return new Response(source.bytes.buffer as ArrayBuffer,{headers:{'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Cache-Control':'no-store','X-Source-URL':encodeURIComponent(source.url),'X-Source-Format':format}});
  } catch(e) {return Response.json({error:e instanceof Error?e.message:'The source could not be opened.'},{status:400});}
}
