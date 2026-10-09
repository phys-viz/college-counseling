import assert from 'node:assert/strict';
import './register-ts.mjs';
const {discoverSources}=await import('../lib/discover-sources.ts');
const original=globalThis.fetch;
try{
 globalThis.fetch=async url=>String(url).startsWith('https://cloudflare-dns.com/')?Response.json({Status:0,Answer:new URL(url).searchParams.get('type')==='A'?[{type:1,data:'93.184.216.34'}]:[]}):new Response(`<html><h1>External Survey Reporting</h1><a href="/CDS_2025_2026.pdf">Common Data Set (CDS) 2025-26</a><a href="/CDS_2024_2025.pdf">Common Data Set 2024-25</a><a href="/feedback-2023.pdf">IPEDS Data Feedback Report 2023</a><a href="/survey-calendar.pdf">Calendar for Surveys</a></html>`,{headers:{'content-type':'text/html'}});
 const result=await discoverSources('https://example.edu/surveys');assert.equal(result.documents.length,2);assert.deepEqual(result.documents.map(d=>d.year),[2025,2024]);
 console.log('PASS: mixed survey archive includes only explicitly identified CDS reports');
}finally{globalThis.fetch=original;}
