import assert from 'node:assert/strict';
import {normalizePDF} from '../lib/extract-pdf.ts';
const document={url:'https://school.edu/cds.pdf',title:'CDS 2025',year:2025};
function parse(text,form_fields=[]) {
 const lines=['C1 Students who applied in Fall 2025',...text,'C2 Waitlist'].map(text=>({text,words:[]}));
 return normalizePDF([{page:9,text:lines.map(l=>l.text).join('\n'),lines,form_fields}],document,'https://school.edu','test');
}
const genders=['Total first-year males who applied 4600','Total first-year females who applied 4362','Total students of unknown sex who applied 1'];
const residency=['In-State Out-of-State International Unknown','Total first-year students who applied 923 3568 4472 0'];
assert.equal(parse(genders).metrics.applicants,8963);
assert.equal(parse([...genders,...residency]).metrics.applicants,8963);
assert.equal(parse(residency).metrics.applicants,8963);
assert.equal(parse(['Total In-State Out-of-State International Unknown','Total first-year students who applied 52703 13042 39067 594']).metrics.applicants,52703,'A Total column is separate from the residency breakdown');
assert.equal(parse(['Total In-State Out-of-State International Unknown','Total first-year students who applied 8963 923 3568 4472 0']).metrics.applicants,8963);
assert.equal(parse(['Total In-State Out-of-State International Unknown','Total first-year students who applied 9000 923 3568 4472 0']).metrics.applicants,undefined);
assert.equal(parse(['Total first-year males who applied 4600']).metrics.applicants,undefined);
assert.equal(parse(['Total first-year male who applied 4600','Total first-year female who applied 4362']).metrics.applicants,8962);
assert.equal(parse(['Total first-year men who applied 4600','Total first-year women who applied 4362']).metrics.applicants,8962);
assert.equal(parse(['In-State Out-of-State International Unknown','Total first-year students who applied 923 3568 4472']).metrics.applicants,undefined);
const conflict=parse([...genders,'Total first-year students who applied 9000']);
assert.equal(conflict.metrics.applicants,undefined);assert(conflict.warnings.some(w=>w.includes('totals disagree')));assert.equal(conflict.metrics.admit_rate,undefined);
const field=(name,value)=>({name,value});
assert.equal(parse([],[field('AP_RECD_1ST_MEN_N','4600')]).metrics.applicants,undefined);
assert.equal(parse([],[field('AP_RECD_1ST_MEN_N','4600'),field('AP_RECD_1ST_WMN_N','4362'),field('AP_RECD_1ST_UNK_N','1')]).metrics.applicants,8963);
assert.equal(parse(genders,[field('AP_RECD_1ST_N','4600')]).metrics.applicants,undefined);
const enrolled=parse(['Total first-year males who enrolled 230','Total first-year females who enrolled 269','Total students of unknown sex who enrolled 0','Total full-time first-year males who enrolled 230','Total part-time first-year males who enrolled 0','Total full-time first-year females who enrolled 269','Total part-time first-year females who enrolled 0']);
assert.equal(enrolled.metrics.enrolled,499,'Status rows must not be counted again after overall gender rows');
console.log('PASS: male/female and men/women labels, unknown-sex counts, residency reconciliation, partial fields/columns, conflicting totals, no enrollment double counting');
