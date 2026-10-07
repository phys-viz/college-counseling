export type Report = {
  school_id: string; school: string; year: number; report_label: string; source_url: string; index_url: string;
  source_type: string; sha256: string; extracted_at: string; review_status: string;
  metrics: Record<string, number | string>; evidence: Record<string,{section:string;page:number|null;method:string}>;
  factors: {label:string;rating:string;page:number}[];
  sections: {page:number;text:string;form_fields:{name:string;value:string;label?:string|null;rect?:number[]}[]}[];
  warnings:string[];
};
export type Summary = Omit<Report,'sections'>;
export const labels: Record<string,string> = {
  applicants:'Applications',admitted:'Students admitted',enrolled:'Students enrolled',admit_rate:'Admission rate',yield_rate:'Enrollment yield',
  waitlist_offered:'Waitlist offers',waitlist_accepted:'Accepted waitlist places',waitlist_admitted:'Admitted from waitlist',waitlist_rate:'Waitlist admission rate',
  ed_applicants:'Early decision applications',ed_admitted:'Early decision admits',ed_rate:'Early decision admission rate',
  sat_25:'SAT composite · 25th percentile',sat_50:'SAT composite · median',sat_75:'SAT composite · 75th percentile',
  reading_25:'SAT reading · 25th percentile',reading_50:'SAT reading · median',reading_75:'SAT reading · 75th percentile',
  math_25:'SAT math · 25th percentile',math_50:'SAT math · median',math_75:'SAT math · 75th percentile',
  act_25:'ACT composite · 25th percentile',act_50:'ACT composite · median',act_75:'ACT composite · 75th percentile',
  top_tenth:'In top 10% of high school class',top_quarter:'In top 25% of high school class',top_half:'In top 50% of high school class',rank_submitted:'Students reporting class rank',
  sat_submitted:'Students submitting SAT',act_submitted:'Students submitting ACT',sat_submitted_count:'SAT submitters',act_submitted_count:'ACT submitters',
  fee:'Application fee',rd_deadline:'Regular application deadline',ed_deadline:'Early decision deadline',ed_notification:'Early decision notification',test_policy:'SAT / ACT policy',
};
export function format(key:string,value:unknown) {
  if(value===undefined || value===null || value==='') return 'Not reported';
  if(typeof value==='string') return value;
  if(typeof value!=='number') return 'Not reported';
  if(key.endsWith('_rate') || ['top_tenth','top_quarter','top_half','rank_submitted','sat_submitted','act_submitted'].includes(key)) return `${value.toFixed(1)}%`;
  if(key==='fee') return `$${value.toFixed(0)}`;
  return value.toLocaleString('en-US');
}
