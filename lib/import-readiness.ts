import type {Report} from './report-types';
export type ReviewDraft={report:Report;include:boolean;approved:boolean;saved:boolean;existing:boolean};
const headlineLabels={applicants:'Applications',admitted:'Students admitted',enrolled:'Students enrolled'};
export function missingHeadlineCounts(report:Report) {
  return Object.entries(headlineLabels).filter(([key])=>{const n=report.metrics[key];return typeof n!=='number'||!Number.isInteger(n)||n<0;}).map(([,label])=>label);
}
/** Explain every condition that disables saving, without changing a draft or
 * treating extraction as counselor approval. Full schema validation still runs
 * before any write and on the API. */
export function importReadiness(drafts:ReviewDraft[],schoolName:string,allowReplace:boolean) {
  const selected=drafts.filter(d=>d.include&&!d.saved),reasons:string[]=[];
  const years=(rows:ReviewDraft[])=>[...new Set(rows.map(d=>d.report.year))].sort((a,b)=>a-b).join(', ');
  if(!selected.length)reasons.push('Include at least one unsaved report.');
  if(selected.length&&!schoolName.trim())reasons.push('Choose a saved school or enter the school name.');
  const missing=selected.filter(d=>missingHeadlineCounts(d.report).length);
  for(const d of missing)reasons.push(`Fall ${d.report.year}: enter valid whole-number counts for ${missingHeadlineCounts(d.report).join(', ')}.`);
  const invalidYears=selected.filter(d=>!Number.isInteger(d.report.year)||d.report.year<1900||d.report.year>2100);
  if(invalidYears.length)reasons.push('Enter a valid fall year for each selected report.');
  const duplicates=[...new Set(selected.map(d=>d.report.year))].filter(year=>selected.filter(d=>d.report.year===year).length>1);
  if(duplicates.length)reasons.push(`More than one selected PDF is assigned to Fall ${duplicates.join(', ')}. Check the archive labels and correct the fall years or exclude a duplicate.`);
  const unreviewed=selected.filter(d=>!d.approved);
  if(unreviewed.length)reasons.push(`Open and check the review confirmation for Fall ${years(unreviewed)}.`);
  const existing=selected.filter(d=>d.existing);
  if(existing.length&&!allowReplace)reasons.push(`Fall ${years(existing)} ${existing.length===1?'is':'are'} already saved. Exclude saved reports to add only missing years, or explicitly choose replacement.`);
  return {selected,existing,reasons,canSave:reasons.length===0};
}
