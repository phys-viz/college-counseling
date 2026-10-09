import {extraMetrics,metricUnit,type MetricUnit} from './metric-definitions';
export const trendMetrics = [
  {value:'admit_rate',label:'Admission rate'},
  {value:'applicants',label:'Applications'},
  {value:'enrolled',label:'Enrollment'},
  {value:'yield_rate',label:'Enrollment yield'},
  {value:'sat_range',label:'SAT composite · middle 50%'},{value:'reading_range',label:'SAT reading · middle 50%'},{value:'math_range',label:'SAT math · middle 50%'},{value:'act_range',label:'ACT composite · middle 50%'},
  {value:'sat_50',label:'SAT composite · reported median'},{value:'sat_submitted',label:'Students submitting SAT'},
  {value:'application_growth',label:'Applications · annual growth'},{value:'admit_rate_change',label:'Admission rate · annual change'},{value:'admit_rate_5yr',label:'Admission rate · five-year average'},
  {value:'ed_rate',label:'Early decision admission rate'},{value:'ed_share',label:'Share of admits through ED'},{value:'waitlist_rate',label:'Waitlist admission rate'},
  ...(['in_state_admit_rate','out_state_admit_rate','international_admit_rate','gpa_average','retention_rate','graduation_4_rate','graduation_6_rate','tuition_private','tuition_in_state','tuition_out_state','housing_food','average_grant','need_met','average_merit_grant','merit_participation','transfer_admit_rate','student_faculty_ratio','class_under_20_rate','class_50_plus_rate'] as const).map(value=>({value,label:extraMetrics[value].label})),
] as const;
export type TrendMetric = typeof trendMetrics[number]['value'];
export type TrendReport = {
  school_id:string;school:string;year:number;source_url:string;index_url:string;source_type:string;
  metrics:Record<string,number>;
  evidence:Record<string,{section:string;page:number|null;method:string;source_url?:string;source_type?:string}>;
  reporting?:{cost_year?:string;aid_year?:string;retention_cohort?:number;graduation_cohort?:number};
  previous?:{year:number;source_url:string;source_type:string;page:number|null;applicants?:number;admit_rate?:number};
};
export type TrendResults = {reports:TrendReport[];schools:{school_id:string;school:string}[]};
export function trendValue(report:TrendReport|undefined,metric:TrendMetric):number|null {
  if(isScoreRange(metric))return scoreRange(report,metric.replace('_range',''))?.low??null;
  const value=report?.metrics[metric];
  return typeof value==='number'&&Number.isFinite(value)?value:null;
}
export function trendSource(report:TrendReport,metric:string) {
  const key=isScoreRange(metric)?metric.replace('_range','_25'):metric,e=report.evidence[key],page=e?.page;
  return (e?.source_url??report.source_url)+((e?.source_type??report.source_type)==='pdf'&&page?`#page=${page}`:'');
}
export function trendFormat(metric:TrendMetric,value:number|null) {
  if(value===null)return 'Not reported';
  const unit=trendUnit(metric);
  return unit==='percent'?`${value.toFixed(2)}%`:unit==='points'?`${value>0?'+':''}${value.toFixed(2)} pp`:unit==='dollars'?`$${value.toLocaleString('en-US',{maximumFractionDigits:0})}`:unit==='gpa'?value.toFixed(2):unit==='ratio'?`${value}:1`:value.toLocaleString('en-US');
}
export function scoreRange(report:Pick<TrendReport,'metrics'>|undefined,key:string):{low:number;median:number|null;high:number}|null {
 const low=report?.metrics[key+'_25'],high=report?.metrics[key+'_75'],median=report?.metrics[key+'_50'];
 return typeof low==='number'&&typeof high==='number'&&low<=high?{low,high,median:typeof median==='number'&&median>=low&&median<=high?median:null}:null;
}
export const isScoreRange=(metric:string)=>metric.endsWith('_range');
export function trendContext(r:TrendReport,metric:TrendMetric){const v=r.reporting;
 if(metric.includes('tuition')||metric==='housing_food')return v?.cost_year?`Cost year ${v.cost_year}`:'Cost year: see original source';
 if(['average_grant','need_met','average_merit_grant','merit_participation'].includes(metric))return v?.aid_year?`Aid year ${v.aid_year}`:'Aid reporting period: see original source';
 if(metric==='retention_rate')return v?.retention_cohort?`Entering cohort ${v.retention_cohort}`:'Entering cohort: see original source';
 if(metric.includes('graduation'))return v?.graduation_cohort?`Entering cohort ${v.graduation_cohort}`:'Entering cohort: see original source';
 return '';
}
export const trendUnit=(metric:TrendMetric):MetricUnit=>metric==='admit_rate_change'?'points':metric==='application_growth'||metric==='admit_rate_5yr'?'percent':isScoreRange(metric)?'score':metricUnit(metric);
export function trendDisplay(report:TrendReport|undefined,metric:TrendMetric){if(!isScoreRange(metric))return trendFormat(metric,trendValue(report,metric));const range=scoreRange(report,metric.replace('_range',''));return range?`${range.low}–${range.high}${range.median!==null?` · median ${range.median}`:''}`:'Not reported';}
export function trendNote(metric:TrendMetric){
 if(isScoreRange(metric)||metric==='sat_50')return 'Reported percentiles describe enrolled students who submitted that test. Bars show the 25th–75th range; dots show reported medians only. Historical SAT scales may differ.';
 if(metric==='application_growth')return 'Annual application growth = (current applications / previous-year applications − 1) × 100. Missing prior years remain gaps.';
 if(metric==='admit_rate_change')return 'Annual admission-rate change is measured in percentage points against the preceding calendar year.';
 if(metric==='admit_rate_5yr')return 'Average of five consecutive annual admission rates, including the selected year. All five years must be reported.';
 if(metric==='ed_share')return 'ED admits / all admits. This is the share of offers made through ED, not the share of enrolled seats or a personal admissions advantage.';
 if(metric==='ed_rate')return 'ED admitted / ED applicants. Early and regular applicant pools differ.';
 if(metric==='waitlist_rate')return 'Waitlist admitted / students accepting a waitlist place.';
 if(metric==='admit_rate')return 'Admission rate = admitted ÷ applicants. Historical institution-wide rates are not an individual student’s chance.';
 if(metric==='yield_rate')return 'Enrollment yield = enrolled ÷ admitted. Counts refer to first-time, first-year students.';
 if(metric.includes('tuition')||['housing_food','average_grant','need_met','average_merit_grant','merit_participation'].includes(metric))return 'Costs and aid retain their source reporting years, which may differ from admissions. Grants describe recipients; aid packages can include loans or work. These figures are not a family’s net price.';
 if(metric.includes('graduation')||metric==='retention_rate')return 'Outcomes describe the entering cohort specified in each source, rather than students entering in the report’s fall admissions year.';
 if(metric==='gpa_average')return 'Source-reported high-school GPA for enrolled GPA reporters. School weighting and reporting practices differ.';
 return extraMetrics[metric]?`Source-reported ${extraMetrics[metric].label.toLowerCase()}. Check the population and reporting year in the original source.`:'Counts refer to first-time, first-year students in each fall cohort.';
}

export function calculateTrendChanges(reports:TrendReport[]){
    for(const r of reports){
      const previous=reports.find(p=>p.school_id===r.school_id&&p.year===r.year-1);
      if(previous){r.previous={year:previous.year,source_url:previous.source_url,source_type:previous.source_type,page:previous.evidence.applicants?.page??null,applicants:previous.metrics.applicants,admit_rate:previous.metrics.admit_rate};
        if(previous.metrics.applicants>0&&typeof r.metrics.applicants==='number'){r.metrics.application_growth=(r.metrics.applicants/previous.metrics.applicants-1)*100;r.evidence.application_growth={section:'C1',page:r.evidence.applicants?.page??null,method:'calculated against preceding calendar year'};}
        if(typeof previous.metrics.admit_rate==='number'&&typeof r.metrics.admit_rate==='number'){r.metrics.admit_rate_change=r.metrics.admit_rate-previous.metrics.admit_rate;r.evidence.admit_rate_change={section:'C1',page:r.evidence.admitted?.page??null,method:'calculated percentage-point change against preceding calendar year'};}
      }
      const window=Array.from({length:5},(_,i)=>reports.find(p=>p.school_id===r.school_id&&p.year===r.year-i));
      if(window.every(p=>typeof p?.metrics.admit_rate==='number')){r.metrics.admit_rate_5yr=window.reduce((sum,p)=>sum+p!.metrics.admit_rate,0)/5;r.evidence.admit_rate_5yr={section:'C1',page:r.evidence.admitted?.page??null,method:'mean of five consecutive annual admission rates'};}
    }
  return reports;
}
