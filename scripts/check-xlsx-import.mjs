// Browser spreadsheet importer: lib/xlsx.ts reads cached .xlsx cell values and
// lib/extract-xlsx.ts lays CDS worksheets out for the shared Section C parser.
// Synthetic workbooks cover each layout rule and its ambiguity; tracked original
// workbooks in data/sources are checked against independently reviewed values.
// Cached originals under .sites-runtime (from collection scripts) are checked
// against their reviewed seed records when present. Nothing is saved.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import './register-ts.mjs';
import {workbook,zip} from './fixtures/xlsx-builder.mjs';
const {readWorkbook,cellText,isWorkbookArchive,WorkbookFormatError}=await import('../lib/xlsx.ts');
const {extractXLSX,worksheetPages,worksheetLetter}=await import('../lib/extract-xlsx.ts');
const {canonicalC1}=await import('../lib/extract-gender.ts');
const {UnrecognizedReportError}=await import('../lib/pdf-report-screening.ts');
const {validateReports}=await import('../lib/validate-import.ts');

const doc=(year=2017)=>({url:'https://example.edu/cds.xlsx',title:'CDS workbook',year});
const extract=(bytes,year)=>extractXLSX(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),doc(year),'https://example.edu/cds',new AbortController().signal,()=>{});
const sheetD=[['A1','D. TRANSFER ADMISSION'],['A2','D1'],['B2','Does your institution enroll transfer students?']];
const sheetA=[['A1','A. GENERAL INFORMATION'],['B3','Name of College/University:'],['C3','Example University']];

// 1. Printed CDS-C layout (Illinois 2017-2020 pattern): bare "Unknown" rows under
// each men/women pair, part-time N/A, an appended answer dictionary whose header is
// misspelled "Question Numer", percent/date formats, formulas and factor marks.
const printedC=[
 ['A1','C. FIRST-TIME, FIRST-YEAR (FRESHMAN) ADMISSION'],['Z1','Question Numer'],['AA1','Question'],['AB1','Answer'],
 ['A3','C1'],['B3','First-time, first-year (freshmen) students: Provide the number of degree-seeking, first-time, first-year students who applied, were admitted, and enrolled (full- or part-time) in Fall 2017.'],
 ['A5','C1'],['B5','Total first-time, first-year (freshman) men who applied'],['E5',22007],['Z5','C.101'],['AA5','Total first-time, first-year men who applied'],['AB5',22007],
 ['A6','C1'],['B6','Total first-time, first-year (freshman) women who applied'],['E6',16911],
 ['B7','Unknown'],['E7',47],
 ['A8','C1'],['B8','Total first-time, first-year (freshman) men who were admitted'],['E8',12436],
 ['A9','C1'],['B9','Total first-time, first-year (freshman) women who were admitted'],['E9',11504],
 ['B10','Unknown'],['E10',{f:'34',v:34}],
 ['A11','C1'],['B11','Total full-time, first-time, first-year (freshman) men who enrolled'],['E11',4036],
 ['A12','C1'],['B12','Total part-time, first-time, first-year (freshman) men who enrolled'],['E12','N/A'],
 ['A14','C1'],['B14','Total full-time, first-time, first-year (freshman) women who enrolled'],['E14',3482],
 ['A15','C1'],['B15','Total part-time, first-time, first-year (freshman) women who enrolled'],['E15','N/A'],['F15',{f:'IF(1=0,"x","")',v:'',t:'str'}],['G15',{f:'SUM(E5:E7)'}],
 ['A17','C2'],['B17','Number of qualified applicants offered a place on waiting list'],['E17',2274],
 ['A30','C7'],['B30','Relative importance of each of the following academic and nonacademic factors in your first-time, first-year, degree-seeking admissions decisions.'],
 ['C31','Very Important'],['D31','Important'],['E31','Considered'],['F31','Not Considered'],
 ['B32','Rigor of secondary school record'],['C32','X'],['B33','Class rank'],['F33','X'],['B34','Application Essay'],['D34','X'],
 ['A40','C9'],['B40','SAT Composite'],['C40',1260],['D40',1350],['E40',1450],
 ['A41','C9'],['B41','Percent Submitting SAT Scores'],['C41',0.4128,1],['D41','Number Submitting SAT Scores'],['E41',3719],
 ['A50','C10'],['B50','Percent in top tenth of high school graduating class'],['C50',0.551,4],
 ['A60','C14'],['B60','Application closing date (fall)'],['C60',43831,2],
 ['A61','C14'],['B61','Priority date'],['C61',43831,3],
];
const book1=workbook({'CDS-A':sheetA,'Answer Sheet':[['A1','Question Number'],['A2','C101']],'CDS-D':sheetD,'CDS-C ':printedC,'CDS Definitions':[['A1','C1 definitions']]});
assert(isWorkbookArchive(book1));
const parsed=await readWorkbook(book1);
assert.deepEqual(parsed.sheets.map(s=>worksheetLetter(s.name)),['A',null,'D','C',null],'Only CDS-A … CDS-J worksheets are report sections');
assert.deepEqual(['CDS-A','C - FTIC Admission','A - General Information','CDS_J','Answer Sheet','CDS Definitions','Welcome','CDS-CHANGES','Sheet1'].map(worksheetLetter),['A','C','A','J',null,null,null,null,null]);
const pages1=worksheetPages(parsed);
assert.deepEqual(pages1.map(p=>[p.page,p.worksheet]),[[1,'CDS-A'],[3,'CDS-C '],[4,'CDS-D']],'Template letters, not workbook order, number the source worksheets');
const c=pages1.find(p=>p.page===3);
assert(!c.text.includes('C.101')&&!c.text.includes('Question Numer'),'The appended answer dictionary is excluded, including its misspelled header');
assert(c.lines.find(l=>l.text.startsWith('C1 Total first-time, first-year (freshman) men who applied')).text.endsWith('applied 22007'));
assert.equal(c.lines.find(l=>l.text.startsWith('C9 Percent Submitting SAT')).text,'C9 Percent Submitting SAT Scores 41.28% Number Submitting SAT Scores 3719','Percent formats are scaled');
assert(c.text.includes('Application closing date (fall) 01/01')&&!c.text.includes('01/01/2020 Priority')&&c.text.includes('Priority date 01/01/2020'),'Dates print only the parts their format shows');
assert(!/\bSUM\b|IF\(/.test(c.text)&&!c.lines.some(l=>l.words.some(w=>!w.str.trim())),'Formulas are never shown; blank cached results and uncached formulas are skipped');
const word=c.lines.find(l=>l.text.startsWith('Rigor')).words.at(-1);
assert.deepEqual([word.str,word.cell,word.x,word.width],['X','CDS-C !C32',(6+40)*7,14*7],'Cells keep worksheet references and column-width geometry');
const r1=await extract(book1);
assert.deepEqual([r1.metrics.applicants,r1.metrics.admitted,r1.metrics.enrolled],[38965,23974,7518],'Bare Unknown rows complete the applied/admitted totals');
assert.equal(r1.metrics.unknown_gender_applicants,47);assert.equal(r1.metrics.unknown_gender_admitted,34);
assert.equal(r1.year,2017);assert.equal(r1.school,'Example University');assert.equal(r1.source_type,'xlsx');
assert.deepEqual([r1.metrics.sat_25,r1.metrics.sat_50,r1.metrics.sat_75,r1.metrics.sat_submitted,r1.metrics.sat_submitted_count],[1260,1350,1450,41.28,3719]);
assert.equal(r1.metrics.top_tenth,55.1);assert.equal(r1.metrics.rd_deadline,'01/01');assert.equal(r1.metrics.waitlist_offered,2274);
assert.deepEqual(r1.factors.map(f=>[f.label,f.rating]),[['Rigor of secondary school record','Very important'],['Class rank','Not considered'],['Application essay','Important']],'C7 marks map to printed rating columns');
assert.equal(r1.evidence.applicants.page,3);assert.match(r1.evidence.applicants.method,/^Worksheet CDS-C : .*worksheet/);assert(!/\bPDF\b/.test(JSON.stringify(r1.evidence)));
assert(r1.sections.every(s=>s.text.startsWith('Worksheet ')),'Retained sections list worksheet cells');assert(r1.sections[0].text.includes('CDS-C !E7=47'));
assert(r1.warnings.some(w=>w.includes('formulas are not recalculated'))&&!r1.warnings.some(w=>/\bPDF\b(?! pages)/.test(w)));
validateReports([{...structuredClone(r1),school_id:'example-university',school:'Example University',report_label:'2017–18'}]);
console.log('PASS: printed worksheet layout, appended-dictionary exclusion, formats, formulas, geometry, C1 unknown rows, factors and provenance');

// 2. Bare "Unknown" rows are adopted only directly beneath a men/women row on the
// same worksheet. Enrolled unknowns have no full/part-time status, so the gender
// sum is withheld rather than undercounted.
const L=(text,page=3)=>({text,page,words:[]});
assert.equal(canonicalC1([L('Total first-time, first-year who applied 100'),L('Unknown 12')])[1].text,'Unknown 12','Never beneath an overall/residency total');
assert.equal(canonicalC1([L('Total first-time, first-year women who applied 50'),L('Unknown 3',4)])[1].text,'Unknown 3','Never across worksheets or pages');
assert.equal(canonicalC1([L('Total first-time, first-year women who applied 50'),L('Fall 2017 note'),L('Unknown 3')])[2].text,'Unknown 3','Only the adjacent row');
assert.equal(canonicalC1([L('Total first-time, first-year women who applied 50'),L('Unknown: 3')])[1].text,'Total first-time, first-year unknown gender who applied 3');
const enrolledUnknown=printedC.flatMap(cell=>cell[0]==='B16'?[]:[cell]).concat([['B16','Unknown'],['E16',5]]);
const r2=await extract(workbook({'CDS-C':enrolledUnknown,'CDS-D':sheetD}));
assert.equal(r2.metrics.enrolled,undefined,'An enrolled unknown row without status leaves enrolled for review');
assert(r2.warnings.some(w=>w.startsWith('Some headline counts')));assert.equal(r2.metrics.applicants,38965);
console.log('PASS: bare Unknown row adjacency, page and status ambiguity');

// 3. Dictionary-only workbooks (VT/Illinois 2024): numbered questions place C120–C131
// residency rows, whose labels repeat the overall wording. An explicit Residency
// column that contradicts the numbering removes the row with a warning.
const dictionary=[['A1','Question Number'],['B1','Question'],['C1','Answer'],['I1','Residency'],
 ['A2','C101'],['B2','Total first-time, first-year men who applied'],['C2',100],
 ['A3','C102'],['B3','Total first-time, first-year women who applied'],['C3',90],
 ['A4','C104'],['B4','Total first-time, first-year unknown gender who applied'],['C4',10],
 ['A5','C105'],['B5','Total first-time, first-year men who were admitted'],['C5',50],
 ['A6','C106'],['B6','Total first-time, first-year women who were admitted'],['C6',45],
 ['A7','C108'],['B7','Total first-time, first-year unknown gender who were admitted'],
 ['A8','C117'],['B8','Total first-time, first-year students who applied'],['C8',200],['I8','All Undergraduates'],
 ['A9','C118'],['B9','Total first-time, first-year students who were admitted'],['C9',95],
 ['A10','C119'],['B10','Total first-time, first-year students who enrolled'],['C10',40],
 ['A11','C120'],['B11','Total first-time, first-year who applied'],['C11',120],['I11','In-State Undergraduates'],
 ['A12','C123'],['B12','Total first-time, first-year who applied'],['C12',80],['I12','International Undergraduates'],
 ['A13','C701'],['B13','Rigor of secondary school record'],['C13','Very Important'],
 ['A14','C702'],['B14','Class rank'],
 ['A15','C905'],['B15','SAT Composite: 25th Percentile'],['C15',1390],['A16','C907'],['B16','SAT Composite: 75th Percentile'],['C16',1520]];
const iSheet=ratio=>[['A1','I. INSTRUCTIONAL FACULTY AND CLASS SIZE'],['A5','I2'],['B5',`Fall 2024 Student to Faculty ratio: ${ratio}`]];
const dictionaryBook=workbook({'CDS-C':dictionary,'CDS-D':[['A1','Question Number'],['A2','D101'],['B2','Does your institution enroll transfer students?'],['C2','Y']],'CDS-I':iSheet('1 to 17')});
const notes=[],dpages=worksheetPages(await readWorkbook(dictionaryBook),notes);
const dc=dpages.find(p=>p.page===3).lines.map(l=>l.text);
assert(dc.includes('In-State Total first-time, first-year who applied 120'));assert(!dc.some(l=>l.includes(' 80')),'Contradicted residency row is omitted');
assert(dc.includes('Total first-time, first-year unknown gender who were admitted'),'Unfilled C1 rows remain visible');assert(!dc.includes('Class rank'),'Other unfilled answers are skipped');
assert(notes.length===1&&notes[0].includes('CDS-C!B12')&&notes[0].includes('International'));
const r3=await extract(dictionaryBook,2024);
assert.deepEqual([r3.metrics.applicants,r3.metrics.admitted,r3.metrics.enrolled],[200,95,40]);
assert.deepEqual([r3.metrics.sat_25,r3.metrics.sat_75],[1390,1520]);assert.equal(r3.factors[0]?.rating,'Very important');
assert(r3.warnings.some(w=>w.includes('CDS-C!B12')));
assert.equal(r3.metrics.student_faculty_ratio,undefined,'"1 to 17" is not a 1:1 ratio');
assert.equal((await extract(workbook({'CDS-C':dictionary,'CDS-D':sheetD,'CDS-I':iSheet('17 to 1')}),2024)).metrics.student_faculty_ratio,17);
console.log('PASS: dictionary-only numbering, residency contradiction, unfilled rows and ratio orientation');

// 4. Unsupported or unsafe files fail with specific messages.
const rejects=async(bytes,type,pattern)=>{await assert.rejects(extract(bytes),e=>e instanceof type&&pattern.test(e.message));};
await rejects(new Uint8Array([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,0,0,0,0]),WorkbookFormatError,/97–2003 \(\.xls\)/);
await rejects(zip({'word/document.xml':'<w:document/>'}),WorkbookFormatError,/not an Excel workbook/);
assert(!isWorkbookArchive(zip({'word/document.xml':'<w:document/>'})));
await rejects(new Uint8Array(Buffer.from('PK\x03\x04 broken')),WorkbookFormatError,/damaged/);
const bomb=zip({'xl/workbook.xml':'<workbook><sheets/></workbook>'+' '.repeat(5000)},{lie:{'xl/workbook.xml':100}});
await rejects(bomb,WorkbookFormatError,/expands beyond/);
await rejects(workbook({'Sheet1':[['A1','Budget 2024']]}),UnrecognizedReportError,/No Common Data Set worksheets.*Sheet1/);
await assert.rejects(extract(workbook({'CDS-A':sheetA,'CDS-B':[['A1','B. ENROLLMENT'],['A2','B1'],['B2','Common Data Set enrollment']]})),/no Section C worksheet/);
assert.equal(cellText({value:1234567,format:'General'}),'1234567','Whole numbers keep every digit');
assert.equal(cellText({value:0.29,format:'0%'}),'29%');assert.equal(cellText({value:45658,format:'mmmm d, yyyy'}),'01/01/2025');
console.log('PASS: .xls, Word archive, damaged ZIP, expansion limit, non-CDS workbook and missing Section C');

// 5. Tracked original workbooks against independently reviewed records.
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const read=file=>{const bytes=new Uint8Array(fs.readFileSync(file));return {bytes,sha:crypto.createHash('sha256').update(bytes).digest('hex')};};
const cornell22=read('data/sources/cornell-2022.xlsx'),reviewed22=seed.find(r=>r.school_id==='cornell'&&r.year===2022);
assert.equal(cornell22.sha,reviewed22.sha256);
const rc=await extract(cornell22.bytes,2022);
for(const key of ['applicants','admitted','enrolled','sat_25','sat_75','act_25','act_75'])assert.equal(rc.metrics[key],reviewed22.metrics[key],`Cornell 2022 ${key}`);
assert.equal(rc.factors.length,19);assert.equal(rc.factors.find(f=>f.label==='Application essay').rating,'Very important');
assert.equal(rc.metrics.rd_deadline,'01/02','Cornell 2022 prints 1/2 with an m/d format');assert.equal(rc.school,'Cornell University');
// Cornell 2023's workbook corroborates its separately reviewed PDF record.
const reviewed23=seed.find(r=>r.school_id==='cornell'&&r.year===2023),rc23=await extract(read('data/sources/cornell-2023.xlsx').bytes,2023);
assert.equal(reviewed23.source_type,'pdf');for(const key of ['applicants','admitted','enrolled','sat_25','sat_75'])assert.equal(rc23.metrics[key],reviewed23.metrics[key],`Cornell 2023 ${key}`);
// Clemson 2021's totals conflict with its breakdowns; the reviewed E20 total is offered, not chosen.
const clemson=read('data/sources/clemson-2021.xlsx'),review=JSON.parse(fs.readFileSync('data/archive-c1-review.json','utf8')).find(r=>r.school_id==='clemson'&&r.year===2021);
assert.equal(clemson.sha,review.sha256);const rk=await extract(clemson.bytes,2021);
for(const key of ['applicants','admitted','enrolled']){assert.equal(rk.metrics[key],undefined);assert(rk.warnings.some(w=>w.startsWith(`C1 ${key} totals disagree`)&&w.includes(String(review.totals[key]))),key);}
console.log('PASS: Cornell 2022/2023 and Clemson 2021 original workbooks match reviewed values or leave conflicts for review');

// 6. Optional cached originals (.sites-runtime): a headline count is either the
// reviewed value or left blank with a warning; it is never a different number.
const bySha=new Map(seed.map(r=>[r.sha256,r]));let checked=0,blank=0;
for(const dir of ['nyu','vt','batch-a','batch-b','batch-c','batch-e']) {
 const path=`.sites-runtime/${dir}`;if(!fs.existsSync(path))continue;
 for(const name of fs.readdirSync(path).filter(f=>f.endsWith('.xlsx'))) {
  const {bytes,sha}=read(`${path}/${name}`),reviewed=bySha.get(sha);if(!reviewed)continue;
  const r=await extract(bytes,reviewed.year);checked++;
  for(const key of ['applicants','admitted','enrolled']){
   if(r.metrics[key]===undefined){blank++;assert(r.warnings.some(w=>w.startsWith('Some headline counts')),`${name} ${key} needs a review warning`);}
   else assert.equal(r.metrics[key],reviewed.metrics[key],`${name} ${key}`);
  }
  if(sha==='fb80ec8ecb52f3c36cf559a17283d7608f91a526f10f2f08fb16dd85e72d3f2f')assert.deepEqual([r.metrics.applicants,r.metrics.admitted,r.metrics.enrolled,r.metrics.unknown_gender_applicants],[38965,23974,7518,47],'Illinois 2017 reviewed C1');
  if(reviewed.school_id==='virginia-tech'&&reviewed.year===2024)assert.equal(r.metrics.student_faculty_ratio,undefined,'VT 2024 prints "1 to 17"');
 }
}
console.log(checked?`PASS: ${checked} cached original workbooks agree with reviewed seed counts (${blank} contested counts left for review)`:'SKIP: no cached original workbooks under .sites-runtime; run the collection scripts to include them');
