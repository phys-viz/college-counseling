import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {discoverSources}=await import('../lib/discover-sources.ts');
const original=globalThis.fetch;
const dns=url=>String(url).startsWith('https://cloudflare-dns.com/');
const dnsResponse=url=>Response.json({Status:0,Answer:new URL(url).searchParams.get('type')==='A'?[{type:1,data:'93.184.216.34'}]:[]});
try {
 for(const [id,url,years,workbooks] of [
  ['uf','https://ir.aa.ufl.edu/reports/cds-reports/',[2025,2024,2023],0],
  ['illinois','https://dair.illinois.edu/access-data/common-data-set/',[],4],
  ['umd','https://irpa.umd.edu/InstitutionalData/cds.html',[],19],
  ['bu','https://www.bu.edu/asir/bu-facts/common-data-set/',[2025],0],
  ['umass-amherst','https://www.umass.edu/uair/data/common-data-set',Array.from({length:27},(_,i)=>2025-i),0],
 ]) {
  const html=fs.readFileSync(`scripts/fixtures/import-discovery/${id}.html`,'utf8');
  globalThis.fetch=async value=>dns(value)?dnsResponse(value):new Response(html,{headers:{'content-type':'text/html'}});
  const result=await discoverSources(url);
  assert.deepEqual(result.documents.map(d=>d.year),years,id);
  if(workbooks)assert(result.notes.some(n=>n.startsWith(`${workbooks} linked reports use Excel spreadsheets`)),id);
 }
 const html=fs.readFileSync('scripts/fixtures/import-discovery/rutgers.html','utf8');
 globalThis.fetch=async value=>dns(value)?dnsResponse(value):new Response(html);
 const result=await discoverSources('https://oirds.rutgers.edu/ReportingCommonDataSet.html');
 const nb=result.documents.filter(d=>/New\s*Brunswick/i.test(decodeURIComponent(d.url)));
 assert.deepEqual(nb.map(d=>d.year),Array.from({length:12},(_,i)=>2023-i));
 assert(nb.every(d=>d.title==='New Brunswick Region'),'Campus labels must not include sibling table cells');
 assert(!nb.some(d=>/Camden|Newark/.test(d.title)));
 // Current files must not prevent a linked historical archive from being read.
 const visited=[];
 globalThis.fetch=async value=>{
  if(dns(value))return dnsResponse(value);
  visited.push(String(value));
  return new Response(String(value).endsWith('/archive')?'<h1>Common Data Set archive</h1><a href="/CDS_2024.pdf">2024-25</a>':'<h1>Common Data Set</h1><a href="/CDS_2025.pdf">2025-26</a><a href="/archive">Archived Common Data Sets</a>');
 };
 assert.deepEqual((await discoverSources('https://example.edu/cds')).documents.map(d=>d.year),[2025,2024]);
 assert(visited.includes('https://example.edu/archive'));
 globalThis.fetch=async value=>dns(value)?dnsResponse(value):new Response('PK-workbook');
 const direct=await discoverSources('https://example.edu/CDS_2025.xlsx');
 assert.equal(direct.documents.length,0);assert(direct.notes.some(n=>n.includes('Excel spreadsheet')));
 globalThis.fetch=async value=>dns(value)?dnsResponse(value):new Response('<h1>Common Data Set</h1><a href="https://drive.google.com/drive/folders/example">View CDS reports</a><a href="https://acrobat.adobe.com/id/example">Common Data Set</a>');
 assert((await discoverSources('https://example.edu/cds')).notes.some(n=>n.includes('hosted document viewer')));
 globalThis.fetch=async value=>dns(value)?dnsResponse(value):new Response('<h1>Common Data Set</h1><a href="/CDS_2025.docx">2025–26 Common Data Set</a><a href="/media/123/download">2025 Common Data Set Appendix</a><a href="/media/124/download">2025 meeting notes</a>');
 const word=await discoverSources('https://example.edu/cds');assert.equal(word.documents.length,0);assert(word.notes.some(n=>n.includes('Word documents')));
 console.log('PASS: UF, Illinois, Rutgers campus/year, Maryland workbook options, full BU reports, current plus historical archive, direct workbook and hosted-viewer guidance');
} finally {globalThis.fetch=original;}
