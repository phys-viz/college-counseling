import assert from 'node:assert/strict';import fs from 'node:fs';import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');const {repairCDSGlyphs,shiftedGlyphFonts}=await import('../lib/pdf-glyphs.ts');
// Tufts 2025-26 physical pages 11-12 (C1 and residency table). Page 11 prints the
// encoded title with ordinary spaces, so a page-level title test never repaired C1.
const f=JSON.parse(fs.readFileSync('scripts/fixtures/tufts/2025-glyphs.json','utf8'));
const items=f.pages.flatMap(p=>p.items),broken=shiftedGlyphFonts(items);
assert(!f.pages[0].items.some(i=>i.str.includes("&RPPRQ\u0003'DWD\u00036HW")),'Fixture keeps the page that lacks the encoded title evidence');
assert(f.pages[0].items.some(i=>i.str.startsWith('&\u0014\u0011')),'C1 label is shifted in the original');
const pages=f.pages.map(({page,items})=>{
 const words=repairCDSGlyphs(items,broken).map(i=>({str:i.str,x:i.transform[4],y:i.transform[5],width:i.width})).filter(w=>w.str.trim());
 const lines=[];
 for(const word of words.sort((a,b)=>b.y-a.y||a.x-b.x)){const line=lines.find(l=>Math.abs(l.words[0].y-word.y)<3);if(line)line.words.push(word);else lines.push({text:'',words:[word]});}
 for(const line of lines){line.words.sort((a,b)=>a.x-b.x);line.text=line.words.map(w=>w.str).join(' ').replace(/\s+/g,' ').trim();}
 return {page,text:lines.map(l=>l.text).join('\n'),lines,form_fields:[]};
});
assert(pages[0].lines.some(l=>l.text.startsWith('C1. First-time, first-year students')));
const r=normalizePDF(pages,{url:f.source_url,title:'2025-2026 Common Data Set',year:2025},f.index_url,f.sha256);
assert.equal(r.year,2025);assert.deepEqual(r.sections.map(s=>s.page),[11,12]);
// Values checked against the rendered pages. Gender rows omit applicants without
// gender data, as the form allows; the explicit residency Total is larger.
for(const [k,v] of Object.entries({male_applicants:14444,female_applicants:18947,unknown_gender_applicants:4,male_admitted:1568,female_admitted:2044,male_enrolled:777,female_enrolled:987,waitlist_offered:3061,waitlist_accepted:1193,waitlist_admitted:71}))assert.equal(r.metrics[k],v,k);
for(const [k,totals] of [['applicants','33395, 33415'],['admitted','3612, 3613'],['enrolled','1764, 1765']]){assert.equal(r.metrics[k],undefined,`Conflicting ${k} totals stay for review`);assert(r.warnings.some(w=>w.includes(`C1 ${k}`)&&w.includes(totals)),k);}
const plain=[{str:'Common Data Set 2025-2026',fontName:'normal'},{str:'C1 TOTAL 33415',fontName:'caps'}];assert.deepEqual(repairCDSGlyphs(plain),plain,'Ordinary text, including uppercase-only fonts, is untouched');
console.log('PASS: Tufts 2025 document-level font repair locates C1 without page title evidence; ordinary fonts untouched; publisher total conflict preserved');
