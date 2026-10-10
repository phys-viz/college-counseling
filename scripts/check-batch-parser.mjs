import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const make=(rows)=>normalizePDF([{page:1,text:rows.join('\n'),lines:rows.map(text=>({text,words:[]})),form_fields:[]}],{url:'https://example.edu/CDS_2025.pdf',title:'CDS2025',year:2025},'https://example.edu/cds','fixture');
const header=['C1 First-time, first-year students who applied in Fall 2025','Men Women Total'];
let r=make([...header,'Applicants 100 200 310','Offered admission 50 100 150','Full-time enrolled 40 70 110','Part-time enrolled 1 2 3','C2 Waiting list']);
assert.equal(r.metrics.applicants,undefined,'Inconsistent explicit total must not become a reported count');
assert(r.warnings.some(w=>w.includes('applicants')&&w.includes('disagree')));
assert.equal(r.metrics.enrolled,113);assert.equal(r.metrics.male_enrolled,41);assert.equal(r.metrics.female_enrolled,72);
r=make([...header,'Applicants 100 310','Full-time enrolled 40 70 110','Part-time enrolled - - -','C2 Waiting list']);
assert.equal(r.metrics.applicants,undefined,'A missing column must not shift the overall total into a gender');
assert.equal(r.metrics.enrolled,undefined,'An unreported part-time status is not zero');
assert.equal(r.metrics.female_applicants,undefined);
r=make(['C1 Applications Fall 2025','Applicants 100 200 300','Offered admission 50 100 150','C2 Waiting list']);
assert.equal(r.metrics.applicants,undefined,'Compact rows require an independently recognized header');
r=make(['C1 Applications Fall 2025','Total first-time, first-year men who applied 100','Total first-time, first-year women who applied 200 305','C2 Waiting list']);
assert.equal(r.metrics.applicants,undefined,'A merged total must reconcile before its extra cell is removed');
const noC1=['C. FIRST-TIME, FIRST-YEAR (FRESHMAN) ADMISSION','Applications','Total first-time, first-year who applied 100'];
assert.throws(()=>make(noC1),/Section C could not be located/,'A heading alone is insufficient for the C1 fallback');
r=make(['C1 Applications Fall 2025','Total first-time, first-year men who applied 100','Total first-time, first-year women who applied 200','C9 Scores','Percent submitting SAT scores 86.7%','Number submitting SAT scores 6,013','Percent submitting ACT scores 31%','C10 Class rank']);
assert.equal(r.metrics.sat_submitted,86.7);assert.equal(r.metrics.sat_submitted_count,6013);assert.equal(r.metrics.act_submitted,31);assert.equal(r.metrics.act_submitted_count,undefined);
const f=JSON.parse(fs.readFileSync('scripts/fixtures/batch-b/bentley-university-2023.json','utf8'));
r=normalizePDF(f.pages,{url:f.source_url,title:'Bentley CDS2023',year:2023},f.index_url,f.sha256);
assert.equal(r.metrics.male_applicants,undefined);assert.equal(r.metrics.female_applicants,4268);
assert(r.warnings.some(w=>w.includes('male_applicants')&&w.includes('6273')&&w.includes('6213')));
assert.equal(r.metrics.applicants,undefined);
console.log('PASS: compact totals/status reconciliation, missing versus zero, ambiguous merged cells, scoped C1 fallback, separately labeled SAT/ACT submissions and original Bentley gender conflict');
for(const [batch,sid,year,counts] of [
 ['d','university-of-massachusetts-amherst',2002,[20449,11783,3335]],
 ['d','fordham-university',2011,[31792,13478,1986]],
 ['d','fordham-university',2022,[null,null,2594]],
 ['e','university-of-alabama',2025,[61994,44124,8127]],
 ['e','university-of-delaware',2007,[20615,11452,3592]],
 ['e','university-of-delaware',2014,[25032,16491,4179]],
 ['f','university-of-georgia',2005,[12326,7982,4712]],
 ['f','university-of-georgia',2015,[21945,11604,5274]],
]){
 const f=JSON.parse(fs.readFileSync(`scripts/fixtures/batch-${batch}/${sid}-${year}.json`,'utf8'));
 const report=normalizePDF(f.pages,{url:f.source_url,title:'Original CDS',year},f.index_url,f.sha256);
 for(const [i,k]of ['applicants','admitted','enrolled'].entries())if(counts[i]!==null)assert.equal(report.metrics[k],counts[i],`${sid} ${year} ${k}`);
 if(sid==='university-of-delaware'&&year===2014)assert(report.sections.every(s=>s.page>=6),'Revision list on page 2 is excluded from the response table starting on page 6');
}
r=make(['C1 Fall 2025','Total full-time men who enrolled 10','Total part-time men who enrolled 1','Total full-time women who enrolled 20','Total part-time women who enrolled 2 34','C2 Waiting list']);assert.equal(r.metrics.enrolled,undefined,'Unreconciled appended grand total stays missing');
console.log('PASS: original spaced comma, decorative response mark, merged grand enrollment, revision list and explicit inclusive status fixtures; unresolved merged total stays missing');
const osu=JSON.parse(fs.readFileSync('scripts/fixtures/batch-d/ohio-state-university-columbus-2023.json','utf8'));
const osur=normalizePDF(osu.pages,{url:osu.source_url,title:'Ohio State original',year:2023},osu.index_url,osu.sha256);
for(const [key,value]of Object.entries({sat_band_1400_1600:39,act_band_30_36:51,reading_band_700_800:32,math_band_700_800:52,rank_submitted:27}))assert.equal(osur.metrics[key],value,'Independently read OSU p27–28 '+key);
assert.equal(osur.metrics.act_band_30_36,51,'ACT English 48% must not replace ACT Composite 51%');
console.log('PASS: paired SAT/ACT Composite domains, wrapped reading/math headers and class-rank reporter percentage');
const jmu=JSON.parse(fs.readFileSync('scripts/fixtures/batch-f/james-madison-university-1999.json','utf8'));
const jm=normalizePDF(jmu.pages,{url:jmu.source_url,title:'JMU original',year:1999},jmu.index_url,jmu.sha256);
for(const key of ['top_tenth','top_quarter','top_half'])assert.equal(jm.metrics[key],undefined,'JMU 1999 counts and rank-band annotations are not cumulative percentages: '+key);
r=make(['C1 Fall 2025','Total men who applied 100','Total women who applied 200','C10 Rank','Percent in top tenth of high school graduating class 85%','Percent in top quarter of high school graduating class 98%','Percent in top half of high school graduating class 100% Top half +','C11 GPA']);
assert.equal(r.metrics.top_tenth,85);assert.equal(r.metrics.top_quarter,98);assert.equal(r.metrics.top_half,100);
r=make(['C1 Fall 2025','Total men who applied 100','Total women who applied 200','C10 Rank','Percent in top half of high school graduating class Top half + bottom half = 100%','C11 GPA']);
assert.equal(r.metrics.top_half,undefined,'A blank answer followed by a sum instruction is not 100%');
console.log('PASS: original JMU rank-band annotations and blank-answer sum instructions stay missing; labeled percentages remain supported');
