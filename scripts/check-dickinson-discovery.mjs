import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {discoverSources}=await import('../lib/discover-sources.ts');
const original=globalThis.fetch;
const index='https://www.dickinson.edu/info/20084/institutional_research/3487/statistics';
const html=fs.readFileSync('scripts/fixtures/import-discovery/dickinson.html','utf8');
const dns=value=>String(value).startsWith('https://cloudflare-dns.com/');
const response=value=>Response.json({Status:0,Answer:new URL(value).searchParams.get('type')==='A'?[{type:1,data:'93.184.216.34'}]:[]});
try {
 globalThis.fetch=async value=>dns(value)?response(value):new Response(html,{headers:{'content-type':'text/html'}});
 const result=await discoverSources(index);
 assert.equal(result.documents.length,10,'Only the ten CDS reports, excluding the footer policy PDF');
 assert.deepEqual(result.documents.map(d=>d.year),Array.from({length:10},(_,i)=>2025-i));
 assert(result.documents.every(d=>/\/cds[_\d]/i.test(new URL(d.url).pathname)));
 assert(!result.documents.some(d=>/non-discrimination|policy/i.test(d.url+' '+d.title)));
 // Underscores are filename separators, compact CDS+year is also a report,
 // while incidental character sequences must not count as a CDS label.
 globalThis.fetch=async value=>dns(value)?response(value):new Response('<h1>Statistics</h1><a href="/cds_2025.pdf">2025-2026</a><a href="/cds20242025pdf.pdf">2024-2025</a><a href="/musiccds_2023.pdf">Music catalog</a><a href="/cdsmith_2022.pdf">Directory</a><a href="/policy.pdf">Policy</a>');
 assert.deepEqual((await discoverSources('https://example.edu/statistics')).documents.map(d=>d.year),[2025,2024]);
 console.log('PASS: Dickinson has ten CDS reports; footer policy excluded; separated/compact CDS filenames recognized without incidental matches');
}finally{globalThis.fetch=original;}

