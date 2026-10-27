import type {Report} from './report-types';
import type {SourceDocument} from './source-types';
import {normalizePDF,type PDFLine,type PDFPage,type PDFWord} from './extract-pdf';
import {screenPDFReport,UnrecognizedReportError} from './pdf-report-screening';
import {cellText,readWorkbook,type Workbook,type WorkbookCell} from './xlsx';

export type WorksheetWord=PDFWord&{cell:string};
export type WorksheetPage=Omit<PDFPage,'lines'>&{worksheet:string;lines:(Omit<PDFLine,'words'>&{words:WorksheetWord[]})[]};
// The CDS template names its worksheets CDS-A … CDS-J; some publishers use
// "C - FTIC Admission". Welcome, Answer Sheet and Definitions sheets are not report sections.
export const worksheetLetter=(name:string)=>(/^CDS[-_ ]?([A-J])$/i.exec(name.trim())??/^([A-J])(?:\s*[-–_]\s*\S.*)?$/i.exec(name.trim()))?.[1].toUpperCase()??null;
const regions=['In-State','Out-of-State','International','Unknown'];

/** Lay out CDS worksheets in the line/word shape the shared PDF parser reads.
 * Page numbers follow the template (CDS-A=1 … CDS-J=10), not workbook order.
 * x comes from column widths and y from the row number, matching the offline
 * openpyxl adapters, so column-position rules (C7 marks) behave identically. */
export function worksheetPages(book:Workbook,warnings:string[]=[]):WorksheetPage[] {
  const pages:WorksheetPage[]=[];
  for(const sheet of book.sheets) {
    const letter=worksheetLetter(sheet.name);if(!letter)continue;
    const page=letter.charCodeAt(0)-64;if(pages.some(p=>p.page===page))continue;
    const header=sheet.cells.filter(c=>c.row===1);
    const headed=(pattern:RegExp)=>header.find(c=>pattern.test(cellText(c)))?.column;
    // Newer templates append a question/answer dictionary beside the printed
    // report; its rows must not be merged into the printed questions.
    const dictionary=headed(/^question num(?:b)?er$/i);
    const maxColumn=Math.max(0,...sheet.cells.map(c=>c.column));
    const positions=[0];for(let c=1;c<=maxColumn;c++)positions.push(positions[c-1]+(sheet.widths.get(c)??13)*7);
    const word=(c:WorkbookCell,str=cellText(c,book.date1904)):WorksheetWord=>({str,x:positions[c.column-1],y:-c.row*20,width:positions[c.column]-positions[c.column-1],cell:`${sheet.name}!${c.ref}`});
    const rows=new Map<number,WorkbookCell[]>();for(const c of sheet.cells)rows.set(c.row,[...rows.get(c.row)??[],c]);
    const lines:WorksheetPage['lines']=[];
    if(dictionary===1) {
      // Some publishers supply only the dictionary. Its numbered questions fix
      // the template position: C120–C131 are C1 residency rows (in-state,
      // out-of-state, international, unknown), whose labels repeat the overall
      // total's wording. Label them by region, never as additional totals.
      const label=headed(/^question$/i)??2,answer=headed(/^answer$/i)??3,residency=headed(/^residency$/i);let section=-1;
      for(const [,cells] of [...rows].filter(([n])=>n>1)) {
        const at=(column:number)=>cells.find(c=>c.column===column);
        const code=/^([A-J])(\d{1,2})(\d{2})$/.exec(String(at(1)?.value??'').trim()),labelCell=at(label),answerCell=at(answer);
        const c1=letter==='C'&&code?.[2]==='1',answered=!!answerCell&&cellText(answerCell)!=='';
        // Unfilled C1 rows stay visible so optional gender cells are not read as complete.
        if(!code||!labelCell||!answered&&!c1)continue;
        let text=cellText(labelCell);
        const question=Number(code[3]),region=c1&&question>=20&&question<=31?regions[Math.floor((question-20)/3)]:null;
        if(region) {
          const stated=residency&&at(residency)?cellText(at(residency)!):'';
          if(stated&&!stated.toLowerCase().replace(/[^a-z]/g,'').startsWith(region.toLowerCase().replace(/[^a-z]/g,''))){warnings.push(`${sheet.name}!${labelCell.ref}: question ${code[0]} is numbered as ${region} but labeled “${stated}”. This row is not used; check the original workbook.`);continue;}
          text=`${region} ${text}`;
        }
        if(Number(code[2])!==section){section=Number(code[2]);const heading=`${letter}${section} Source question group`;lines.push({text:heading,words:[{str:heading,x:0,y:-labelCell.row*20,width:100,cell:`${sheet.name}!${at(1)!.ref}`}]});}
        const words=[word(labelCell,text),...answered?[word(answerCell!)]:[]];lines.push({text:words.map(w=>w.str).join(' '),words});
      }
    } else for(const [,cells] of rows) {
      const words=cells.filter(c=>!dictionary||c.column<dictionary).map(c=>word(c));
      if(words.length)lines.push({text:words.map(w=>w.str).join(' '),words});
    }
    pages.push({page,worksheet:sheet.name,text:lines.map(l=>l.text).join('\n'),lines,form_fields:[]});
  }
  return pages.sort((a,b)=>a.page-b.page);
}

const worksheetMethod=(method:string)=>method.replace(/\bPDF\b/g,'worksheet');
export async function extractXLSX(buffer:ArrayBuffer,document:SourceDocument,indexURL:string,signal:AbortSignal,onProgress:(text:string)=>void):Promise<Report> {
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
  onProgress('Reading spreadsheet worksheets…');
  const book=await readWorkbook(new Uint8Array(buffer),signal);
  if(signal.aborted)throw new Error('Extraction canceled.');
  const notes:string[]=[],pages=worksheetPages(book,notes);
  if(!pages.length)throw new UnrecognizedReportError(`No Common Data Set worksheets (CDS-A … CDS-J) were found in this workbook. Its sheets are: ${book.sheets.map(s=>s.name).slice(0,12).join(', ')||'none'}.`);
  if(screenPDFReport(pages)==='unrecognized')throw new UnrecognizedReportError('No recognizable CDS content found in these worksheets. Open the workbook to check whether it is an unrelated file or an unsupported report.');
  if(!pages.some(p=>p.page===3))throw new Error('This workbook has no Section C worksheet (CDS-C). Try the full Common Data Set workbook.');
  onProgress('Reading Section C answers…');
  const r=normalizePDF(pages,document,indexURL,sha256);
  const byPage=new Map(pages.map(p=>[p.page,p]));
  // The A1 answer cell beside its printed label names the institution.
  if(!r.school)for(const line of byPage.get(1)?.lines??[]){const i=line.words.findIndex(w=>/^Name of College\/University\s*:?$/i.test(w.str.trim()));if(i>=0&&line.words.length===i+2&&line.words[i+1].str){r.school=line.words[i+1].str;break;}}
  r.source_type='xlsx';
  for(const e of Object.values(r.evidence))if(e.method!=='calculated'&&!e.method.startsWith('calculated:'))e.method=`Worksheet ${byPage.get(e.page??0)?.worksheet??'cells'}: ${worksheetMethod(e.method)}`;
  // Keep each source worksheet with its cell references as the review evidence.
  for(const section of [...r.sections,...r.additional_sections??[]]){const p=byPage.get(section.page);if(p)section.text=`Worksheet ${p.worksheet} (source worksheet ${p.page})\n`+p.lines.map(l=>l.words.map(w=>`${w.cell}=${w.str}`).join(' | ')).join('\n');}
  r.warnings=[...notes,...r.warnings.map(w=>w==='Automatically extracted from PDF fields and text. Review all figures against the source. Missing responses are not inferred.'?'Automatically extracted from cached worksheet cell values; formulas are not recalculated. Review all figures against the source. Missing responses are not inferred.':w.replace(/\bthe PDF's\b/g,"the workbook's").replace(/\boriginal PDF\b/g,'original workbook').replace(/\bPDF\b/g,'worksheet')),
    'Source page numbers identify worksheets CDS-A=1 through CDS-J=10, not printed PDF pages. Each retained worksheet lists its original cell references.'];
  return r;
}
