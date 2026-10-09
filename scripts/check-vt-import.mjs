import assert from 'node:assert/strict';import fs from 'node:fs';import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');const {repairCDSGlyphs}=await import('../lib/pdf-glyphs.ts');const {validateReports}=await import('../lib/validate-import.ts');const {canonicalC1}=await import('../lib/extract-gender.ts');
for(const year of [2019,2022,2023,2024,2025]){
 const f=JSON.parse(fs.readFileSync(`scripts/fixtures/vt/${year}.json`,'utf8'));
 const r=normalizePDF(f.pages,{url:f.source_url,title:'VT CDS',year},f.index_url,f.sha256);
 for(const [i,k] of ['applicants','admitted','enrolled'].entries())assert.equal(r.metrics[k],year===2023&&k==='applicants'?undefined:f.expected.counts[i],`${year} ${k}`);
 if(year===2023){assert(r.warnings.some(w=>w.includes('47208, 47207')));assert.equal(r.metrics.reading_25,620);assert.equal(r.metrics.reading_50,660);assert.equal(r.metrics.reading_75,700);assert.equal(r.metrics.male_applicants,26966);assert.equal(r.metrics.female_applicants,20135);assert.equal(r.metrics.another_gender_applicants,107);}
 if(year===2019){assert.equal(r.metrics.male_enrolled,4353);assert.equal(r.metrics.female_enrolled,3298);}
 if(year===2025){assert.equal(r.metrics.unknown_gender_applicants,231);assert.equal(r.metrics.unknown_gender_admitted,157);assert.equal(r.metrics.unknown_gender_enrolled,41);}
 assert.equal(r.metrics.sat_25,undefined,'Unreported SAT composite stays missing');
 console.log('PASS: VT fixture',year);
}
const raw=JSON.parse(fs.readFileSync('scripts/fixtures/vt/2019-glyphs.json','utf8')).pages.find(p=>p.page===7).items;
const repaired=repairCDSGlyphs(raw);assert(repaired.some(i=>i.str.includes('Common Data Set 2019-2020')));assert(repaired.some(i=>i.str==='18859'));
const plain=[{str:'Common Data Set 2025-2026',fontName:'normal'}];assert.deepEqual(repairCDSGlyphs(plain),plain);
const mixed=[...raw,{str:'Normal title 123',fontName:'untouched'}];assert.equal(repairCDSGlyphs(mixed).at(-1).str,'Normal title 123');
const records=JSON.parse(fs.readFileSync('data/reports.json','utf8')).filter(r=>r.school_id==='virginia-tech');assert.equal(records.length,5);validateReports(structuredClone(records));
for(const r of records){assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.equal(r.year,Number(r.report_label.slice(0,4)));assert(r.sections.length>0);if(r.source_type==='xlsx')assert(r.sections[0].text.includes('Worksheet'));}
const dictionary=records.find(r=>r.year===2024);assert.equal(dictionary.metrics.unknown_gender_applicants,undefined);assert.equal(dictionary.metrics.sat_submitted_count,3010);assert(dictionary.sections[0].text.includes('CDS-C!C49=52296'));
console.log('PASS: original malformed font fixture, untouched ordinary/mixed font, verified seed and worksheet provenance');

const wrappedRows=[{text:'Total first-time, first-year (degree-seeking)',page:1,words:[]},{text:'19,048 24,645 3,514 47,207',page:1,words:[]},{text:'who applied',page:1,words:[]}];
assert(canonicalC1(wrappedRows)[0].text.endsWith('who applied 19,048 24,645 3,514 47,207'));
const acrossPages=structuredClone(wrappedRows);acrossPages[2].page=2;assert.equal(canonicalC1(acrossPages)[0].text,wrappedRows[0].text,'Never join rows across physical pages');
const unrelated=structuredClone(wrappedRows);unrelated[2].text='SAT Math';assert.equal(canonicalC1(unrelated)[0].text,wrappedRows[0].text,'Only a final C1 verb can complete a row');
console.log('PASS: wrapped row recognition excludes different-page and unrelated values');
