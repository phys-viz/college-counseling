import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {discoverSources}=await import('../lib/discover-sources.ts');
const {screenPDFReport}=await import('../lib/pdf-report-screening.ts');
const original=globalThis.fetch;
async function discover(html,url='https://example.edu/statistics') {
 globalThis.fetch=async value=>String(value).startsWith('https://cloudflare-dns.com/')?Response.json({Status:0,Answer:new URL(value).searchParams.get('type')==='A'?[{type:1,data:'93.184.216.34'}]:[]}):new Response(html);
 return discoverSources(url);
}
try {
 const d=await discover(fs.readFileSync('scripts/fixtures/import-discovery/mixed-generic-links.html','utf8'));
 assert.deepEqual(d.documents.map(d=>[new URL(d.url).pathname,d.year]),[['/files/8732.pdf',2025],['/files/5810.pdf',2024],['/download',2023]],'Year links inside the CDS heading hierarchy are identified without meaningful filenames');
 assert.deepEqual(d.other_documents.map(d=>new URL(d.url).pathname),['/cds/files/4499.pdf','/outside-2020.pdf','/other.pdf'],'Ambiguous body links remain recoverable, including sibling sections');
 assert(![...d.documents,...d.other_documents].some(d=>/policy|privacy|feedback|navigation|footer/i.test(d.url)));
 const titleOnly=await discover('<html><head><title>Common Data Set</title></head><body><a href="/f.pdf">2025-26</a><footer><a href="/g.pdf">2024-25</a></footer></body></html>');
 assert.deepEqual(titleOnly.documents.map(d=>d.year),[2025]);assert.equal(titleOnly.other_documents.length,0);
 const noEvidence=await discover('<a href="/files/report.pdf">Download report</a>','https://example.edu/cds');
 assert.equal(noEvidence.documents.length,0);assert.equal(noEvidence.other_documents.length,1,'A URL directory alone must not promote a generic file');
 const nested=await discover('<h1>Common Data Set</h1><h2>2025-26</h2><a href="/a.pdf">PDF</a><h2>Policies</h2><a href="/b.pdf">2025-26</a>');
 assert.deepEqual(nested.documents.map(d=>new URL(d.url).pathname),['/a.pdf']);assert.equal(nested.other_documents.length,1);
 const repeated=await discover('<h1>Reports</h1><a href="/r.pdf">Unlabeled</a><h2>Common Data Set</h2><a href="/r.pdf">2025-26</a>');
 assert.equal(repeated.documents.length,1);assert.equal(repeated.other_documents.length,0,'A later identified link promotes the same URL once');
 console.log('PASS: heading hierarchy, generic downloads, boundaries, title-only archives, footer/navigation exclusion, uncertain links, URL deduplication');
} finally {globalThis.fetch=original;}
const p=text=>({text,form_fields:[]});
assert.equal(screenPDFReport([p('Privacy policy. '.repeat(40))]),'unrecognized');
assert.equal(screenPDFReport([p('Common Data Set 2025-2026\nC1 Applicants')]),'possible-report');
assert.equal(screenPDFReport([p('C1 Students who applied\nTotal first-year males 600')]),'possible-report');
assert.equal(screenPDFReport([p('C. FIRST–TIME, FIRST–YEAR ADMISSION\nFall 2002')]),'possible-report');
assert.equal(screenPDFReport([{text:'',form_fields:[{name:'AP_RECD_1ST_N',value:'500'}]}]),'possible-report');
assert.equal(screenPDFReport([p('')]),'needs-review');
assert.equal(screenPDFReport([p('Welcome to the research office. '.repeat(15)),p('')]),'needs-review','Mixed scanned reports must retain review/OCR errors');
assert.equal(screenPDFReport([p('Common Data Set 2022\nB. ENROLLMENT\nB1 Enrollment')]),'possible-report','A Section B-only report is CDS-like, but the normalizer still rejects it for missing Section C');
console.log('PASS: content screening distinguishes unrelated text, CDS titles/structure/forms, and unreadable or mixed scanned reports');
