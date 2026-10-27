import type {SourcePage} from './report-types';

type Page=Pick<SourcePage,'text'|'form_fields'>;
export class UnrecognizedReportError extends Error {
  constructor(message='No recognizable CDS content found. Open this PDF to check whether it is an unrelated file or an unsupported report.') {
    super(message);
    this.name='UnrecognizedReportError';
  }
}

/** Inspect extracted content, never the filename. This screens documents, not figures.
 * Ambiguous scans keep the ordinary OCR/layout error rather than being called unrelated.
 * A CDS title, response labels, or known form fields is enough to proceed to normalization;
 * missing or contradictory answers still require the existing review workflow.
 */
export function screenPDFReport(pages:Page[]):'possible-report'|'unrecognized'|'needs-review' {
  const text=pages.map(p=>p.text).join('\n').normalize('NFKC').replace(/[\u00ad\u2010-\u2015\u2212]/g,'-');
  if(/\bcommon[\s_-]+data[\s_-]+set\b/i.test(text)||
    /^(?:CDS\s*(?:-\s*)?)?[A-J]\s*\d{1,2}(?:[.\s:-]|$)/im.test(text)||
    /\bFIRST[- ]TIME,?\s*FIRST[- ]YEAR(?:\s*\(FRESHMAN\))?\s+ADMISSION/i.test(text)||
    pages.some(p=>p.form_fields.some(f=>/^(?:AP_RECD_1ST|AP_ADMT_1ST|EN_TOT_1ST|FRSH_HS_RANK|SUBMIT_SAT1|SUBMIT_ACT)(?:_|$)/i.test(f.name))))return 'possible-report';
  if(text.trim().length<200||pages.some(p=>p.text.trim().length<80))return 'needs-review';
  return 'unrecognized';
}
