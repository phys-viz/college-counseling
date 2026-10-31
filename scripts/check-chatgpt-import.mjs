// Source-layout-independent JSON handoff. Uses synthetic, explicit source rows;
// no model or network calls and no writes to any saved report.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-ts.mjs';
const {parseChatGPTImport,aiReviewWarning}=await import('../lib/chatgpt-import.ts');
const {importReadiness}=await import('../lib/import-readiness.ts');
const {instructions,template}=await import('./write-chatgpt-import-kit.mjs');
const report=()=>({school:'Fixture College',year:2025,source_url:'https://fixture.edu/cds-2025.pdf',source_type:'pdf',
 metrics:{applicants:10000,admitted:2000,enrolled:500,waitlist_offered:0,rd_deadline:'January 1'},
 evidence:Object.fromEntries(['applicants','admitted','enrolled','waitlist_offered','rd_deadline'].map(key=>[key,{section:key==='waitlist_offered'?'C2':key==='rd_deadline'?'C14':'C1',page:5,method:'Explicit overall total / labeled date on physical page 5'}])),
 factors:[],sections:[{page:5,text:'C1 Fall 2025. Total applicants 10,000; Total admitted 2,000; Total enrolled 500. C2 Waitlist offered: 0. C14 Closing date: January 1.',form_fields:[]}],warnings:[]});
const envelope=(r=report())=>({atlas_import_version:1,reports:[r]});
const parse=r=>parseChatGPTImport(JSON.stringify(r));
const [r]=parse(envelope());
assert.equal(r.school_id,'fixture-college');assert.equal(r.metrics.admit_rate,20);assert.equal(r.metrics.yield_rate,25);assert.equal(r.metrics.waitlist_offered,0);assert.equal(r.metrics.rd_deadline,'January 1');
assert.equal(r.sha256,'');assert.equal(r.index_url,r.source_url);assert.equal(r.review_status,'AI-prepared draft; awaiting counselor review');
assert.deepEqual(r.sections,report().sections);assert(r.warnings.includes(aiReviewWarning));assert(r.warnings.some(w=>w.includes('hash')));
const approved=report();approved.review_status='APPROVED';approved.approved=true;approved.extracted_at='fabricated';approved.metrics.admit_rate=99;
const [unreviewed]=parse(envelope(approved));assert.match(unreviewed.review_status,/awaiting/);assert.notEqual(unreviewed.extracted_at,'fabricated');assert.equal(unreviewed.metrics.admit_rate,20);
const draft=report=>({report,include:true,approved:false,saved:false,existing:false});
assert.equal(importReadiness([draft(unreviewed)],r.school,false).canSave,false);
const missing=report();delete missing.metrics.enrolled;const [partial]=parse(envelope(missing));assert.equal(partial.metrics.enrolled,undefined);assert(importReadiness([{...draft(partial),approved:true}],r.school,false).reasons.some(s=>s.includes('Students enrolled')));
assert.equal(importReadiness([{...draft(r),approved:true,existing:true}],r.school,false).canSave,false);
assert.equal(importReadiness([{...draft(r),approved:true,existing:true}],r.school,true).canSave,true);
assert.equal(parse(report()).length,1);assert.equal(parse([report()]).length,1);assert.equal(parseChatGPTImport('\uFEFF'+JSON.stringify(envelope())).length,1);
const workbook=report();workbook.source_type='xlsx';workbook.sections[0].source_label='Admissions';workbook.sections[0].text='Admissions!B12=C1 Total applied | Admissions!E12=10000\nAdmissions!B13=Admitted | Admissions!E13=2000\nAdmissions!B14=Enrolled | Admissions!E14=500\nWaitlist offered 0 | Closing date January 1';
assert.equal(parse(envelope(workbook))[0].sections[0].source_label,'Admissions');
const companion=report();companion.metrics.tuition_private=50000;companion.evidence.tuition_private={section:'G1',page:2,method:'Tuition row',source_url:'https://fixture.edu/tuition.xlsx',source_type:'xlsx'};companion.additional_sections=[{page:2,text:'Tuition!B4=Private tuition | Tuition!C4=50000',form_fields:[],source_url:'https://fixture.edu/tuition.xlsx',source_type:'xlsx',source_label:'Tuition'}];
assert.equal(parse(envelope(companion))[0].evidence.tuition_private.source_url,'https://fixture.edu/tuition.xlsx');
for(const [mutate,error] of [
 [r=>r.metrics.applicants=null,/must be a number/],
 [r=>r.metrics.male_applicants=-1,/nonnegative/],
 [r=>r.metrics.applicants='10000',/must be a number/],
 [r=>r.metrics.unsupported_metric=1,/Unknown metric/],
 [r=>r.metrics.test_policy=1,/must be text/],
 [r=>delete r.evidence.applicants,/Evidence for applicants/],
 [r=>r.evidence.applicants.page=99,/missing from the source/],
 [r=>r.evidence.applicants.source_url='https://fixture.edu/other.pdf',/missing from the source/],
 [r=>r.sections=[null],/JSON object/],
 [r=>r.sections[0].form_fields=[null],/JSON object/],
 [r=>r.factors=[null],/JSON object/],
 [r=>r.factors=[{label:'Academic GPA',rating:'Important',page:99}],/factor needs a page/],
 [r=>r.warnings=[{}],/Warnings/],
 [r=>r.source_url='javascript:alert(1)',/real institution source/],
 [r=>r.source_url='https://example.edu/report.pdf',/real institution source/],
 [r=>r.source_type='exe',/metadata/],
 [r=>r.sha256='made-up',/sha256/],
 [r=>r.metrics.enrolled=3000,/inconsistent/],
 [r=>{r.metrics.act_25=40;r.evidence.act_25=r.evidence.applicants;},/score/],
 [r=>r.sections=[],/original Section C/],
 [r=>r.sections[0].text='',/original source text/],
]){const bad=report();mutate(bad);assert.throws(()=>parse(envelope(bad)),error);}
assert.throws(()=>parse({...envelope(),atlas_import_version:2}),/version/);
assert.throws(()=>parse({...envelope(),reports:{}}),/reports array/);
assert.throws(()=>parse({atlas_import_version:1,reports:[]}),/between 1 and 25/);
assert.throws(()=>parse({atlas_import_version:1,reports:Array.from({length:26},report)}),/between 1 and 25/);
assert.throws(()=>parse({atlas_import_version:1,reports:[report(),report()]}),/Duplicate school/);
assert.throws(()=>parse({atlas_import_version:1,reports:[report(),{...report(),school:'Another Campus',year:2024}]}),/one school/);
assert.throws(()=>parseChatGPTImport('```json\n{}\n```'),/valid JSON/);
assert.throws(()=>parseChatGPTImport(' '.repeat(5_000_001)),/too large/);
assert.throws(()=>parse(template),/example school/);
assert.equal(fs.readFileSync('public/chatgpt-import-instructions.txt','utf8'),instructions(),'Regenerate the guide when metric definitions change');
assert.deepEqual(JSON.parse(fs.readFileSync('public/chatgpt-import-template.json','utf8')),template);
console.log('PASS: AI drafts require review; source text and evidence preserved; zero/missing distinction; computed rates; arbitrary worksheet names and companion sources; malformed/unsupported/oversized/multiple-school files rejected; downloadable kit matches current metrics.');
