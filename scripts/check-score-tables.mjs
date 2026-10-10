import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
// Verbatim C9 source text; expected values were read from each printed table.
const run=(name)=>{const f=JSON.parse(fs.readFileSync(`scripts/fixtures/scores/${name}.json`,'utf8'));return normalizePDF(f.pages.map(p=>({...p,lines:p.text.split('\n').map(text=>({text,words:[]})),form_fields:[]})),{url:f.source_url,title:`CDS${f.year}`,year:f.year},f.index_url,'fixture').metrics;};
const expect=(name,values)=>{const m=run(name);for(const [key,value] of Object.entries(values))assert.equal(m[key],value,`${name} ${key}`);return m;};

// 25th/50th/75th plus a trailing Average column on a wrapped header; reading label wraps around its scores.
expect('bentley-university-2025',{sat_25:1230,sat_50:1310,sat_75:1370,reading_25:610,reading_50:650,reading_75:690,math_25:610,math_50:670,math_75:710,act_25:29,act_50:31,act_75:33,
  act_band_30_36:65,act_band_24_29:30,act_band_18_23:5,act_band_below_6:0});
// 25th, 75th, Median, Average: the median is the 50th percentile and printed third.
expect('bentley-university-2021',{sat_25:1260,sat_50:1330,sat_75:1403,act_25:28,act_50:30,act_75:32});
// 25th, 75th, Mean: the mean is never a percentile (formerly stored as the 75th).
expect('university-of-alabama-2021',{sat_25:1080,sat_50:undefined,sat_75:1370,math_75:690,act_25:21,act_75:31});
// Decimal means must not split into extra integer columns.
expect('university-of-alabama-2016',{act_25:23,act_75:31,math_25:490,math_75:620});
// A stacked header (50th printed above 25th/75th) keeps the established 3-column reading.
expect('cornell-2023',{sat_25:1480,sat_50:1520,sat_75:1550,act_25:33,act_50:34,act_75:35});
// Current- and prior-year percentile pairs: the current year comes first.
expect('clemson-2012',{reading_25:550,reading_75:650,act_25:25,act_75:30});
// A blank optional 50th percentile and a blank Mean column.
expect('university-of-notre-dame-2022',{math_25:740,math_50:undefined,math_75:790,act_25:32,act_75:35});
expect('university-of-notre-dame-2007',{math_25:660,math_75:760,act_25:31,act_75:34});
// A printed possible-score scale is not a score.
expect('university-of-michigan-ann-arbor-2020',{sat_25:1340,sat_75:1520,sat_50:undefined});
// "SAT Evidence-Based 570 650" with "Reading and Writing" on the next line.
expect('james-madison-university-2019',{reading_25:570,reading_75:650,sat_25:1130,sat_75:1280});
// One value in a multi-column distribution row cannot be placed in a column from text alone.
expect('washington-and-lee-university-2016',{act_band_30_36:88.05,act_band_24_29:11.95,act_band_18_23:undefined});
expect('university-of-massachusetts-boston-2020',{reading_band_400_499:21,math_band_400_499:16,reading_band_300_399:undefined,math_band_300_399:undefined});
// An unrecognized ACT table after SAT Composite must not disqualify the composite rows.
expect('george-washington-university-2025',{sat_band_1400_1600:49.77,sat_band_1200_1399:43.06,sat_band_800_999:1.59});
console.log('PASS: C9 score columns mapped by printed header (average/median/mean/scale columns), stacked and prior-year headers, blank cells, wrapped labels and ambiguous distribution rows');

// Saved-record enrichment: additive, hash-pinned, reviewed corrections only while the saved value is unchanged.
const {savedScoreMetrics}=await import('../lib/saved-scores.ts');
const {deriveExtraMetrics}=await import('../lib/extract-additional.ts');
const {validateReports}=await import('../lib/validate-import.ts');
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const saved=(id,year)=>structuredClone(seed.find(r=>r.school_id===id&&r.year===year));
const bentley=saved('bentley-university',2025),core=structuredClone(bentley.metrics);savedScoreMetrics(bentley);
assert.equal(bentley.metrics.sat_25,1230);assert.equal(bentley.metrics.sat_75,1370);assert.match(bentley.evidence.sat_25.method,/^source-hash-verified score enrichment/);assert.equal(bentley.evidence.sat_25.page,13);
for(const [k,v] of Object.entries(core))assert.equal(bentley.metrics[k],v,`Bentley saved ${k} preserved`);
const alabama=saved('university-of-alabama',2021);savedScoreMetrics(alabama);
assert.equal(alabama.metrics.sat_75,1370);assert.equal(alabama.metrics.sat_50,undefined);assert.equal(alabama.metrics.act_75,31);assert(alabama.warnings.some(w=>w.includes('mean as the 75th')));
const edited=saved('university-of-alabama',2021);edited.metrics.sat_75=1360;edited.metrics.sat_50=1250;savedScoreMetrics(edited);
assert.equal(edited.metrics.sat_75,1360,'A counselor edit is not overwritten');assert.equal(edited.metrics.sat_50,1250);
const omitted=saved('bentley-university',2025);omitted.omitted_metrics=['sat_25'];savedScoreMetrics(omitted);assert.equal(omitted.metrics.sat_25,undefined,'Reviewed omissions stay unfilled');
const moved={...saved('bentley-university',2025),sha256:'different source'};savedScoreMetrics(moved);assert.equal(moved.metrics.sat_25,undefined,'Source hash mismatch must not attach cached figures');
const wlu=saved('washington-and-lee-university',2022);savedScoreMetrics(wlu);assert.equal(wlu.metrics.sat_band_1000_1199,undefined);
const gwu=saved('george-washington-university',2021);savedScoreMetrics(gwu);assert.equal(gwu.metrics.reading_band_400_499,0.5);assert(gwu.warnings.some(w=>w.includes('may belong to SAT Math')));
const enriched=seed.map(r=>deriveExtraMetrics(savedScoreMetrics(structuredClone(r))));
for(let i=0;i<enriched.length;i+=100)validateReports(enriched.slice(i,i+100));
console.log('PASS: saved score enrichment is additive and hash-pinned, applies reviewed Alabama/W&L corrections only to unchanged values, and all enriched seed reports validate');
