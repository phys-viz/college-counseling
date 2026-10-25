import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const {importReadiness,missingHeadlineCounts}=await import('../lib/import-readiness.ts');
const f=JSON.parse(fs.readFileSync('scripts/fixtures/dickinson/2024-c1.json','utf8'));
const r=normalizePDF(f.pages,{url:f.source_url,title:'2024-2025',year:2024},'https://www.dickinson.edu/info/20084/institutional_research/3487/statistics',f.sha256);
for(const [k,v] of Object.entries(f.expected)){assert.equal(r.metrics[k],v);assert.equal(r.evidence[k].page,8);}
assert.equal(r.metrics.unknown_gender_applicants,undefined);assert.equal(r.metrics.unknown_gender_enrolled,undefined,'Unfilled optional status cells remain missing');
const historical=JSON.parse(fs.readFileSync('scripts/fixtures/dickinson/2019-c1.json','utf8'));
const old=normalizePDF(historical.pages,{url:historical.source_url,title:'2019-2020',year:2019},r.index_url,historical.sha256);
assert.equal(old.year,2018,'Printed C1 cohort is retained until an explicit review correction');assert(old.warnings.some(w=>w.includes('archive link suggests 2019')));
for(const [k,v] of Object.entries(historical.expected))assert.equal(old.metrics[k],v);
const parse=(header,cells)=>{const lines=['C1 Students who applied in Fall 2024',header,'Total first-year students who applied '+cells,'C2 Waiting list'].map(text=>({text,words:[]}));return normalizePDF([{page:8,lines,text:lines.map(l=>l.text).join('\n'),form_fields:[]}],{url:f.source_url,title:'2024',year:2024},f.source_url,'fixture');};
assert.equal(parse('Total In-State Out-of-State','7258 1391 5867').metrics.applicants,7258);
assert.equal(parse('In-State Out-of-State Total','1391 5867 7258').metrics.applicants,7258);
assert.equal(parse('Total In-State Out-of-State','7258 1391 5800').metrics.applicants,undefined,'Contradictory components block the total');
assert.equal(parse('Total In-State Out-of-State','7258 1391').metrics.applicants,undefined,'Partial rows cannot become totals');
assert.equal(parse('In-State Out-of-State','1391 5867').metrics.applicants,undefined,'A domestic-only breakdown without explicit overall Total is insufficient');
const drafts=Array.from({length:10},(_,i)=>({report:{...structuredClone(r),year:2016+i},include:true,approved:false,saved:false,existing:i===9}));
drafts[3].report.year=2018;
let ready=importReadiness(drafts,'Dickinson College',false);
assert(ready.reasons.some(x=>x.includes('confirmation')));assert(ready.reasons.some(x=>x.includes('already saved')));assert(ready.reasons.some(x=>x.includes('More than one')));
for(const d of drafts)d.approved=true;drafts[3].report.year=2019;drafts[9].include=false;
assert(importReadiness(drafts,'Dickinson College',false).canSave,'Reviewed missing years save without replacing existing 2025');
assert(!importReadiness(drafts,'',false).canSave);
for(const value of [undefined,-1,1.5,NaN]){drafts[0].report.metrics.applicants=value;assert.equal(missingHeadlineCounts(drafts[0].report).length,1);assert(!importReadiness(drafts,'Dickinson College',false).canSave);}
console.log('PASS: original Dickinson 2024 two-residency totals, missing/contradictory values, and explicit save blockers for review, counts, school, duplicate years, and existing records');
