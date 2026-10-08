export const trendMetrics = [
  {value:'admit_rate',label:'Admission rate'},
  {value:'applicants',label:'Applications'},
  {value:'enrolled',label:'Enrollment'},
  {value:'yield_rate',label:'Enrollment yield'},
] as const;
export type TrendMetric = typeof trendMetrics[number]['value'];
export type TrendReport = {
  school_id:string;school:string;year:number;source_url:string;index_url:string;source_type:string;
  metrics:Partial<Record<TrendMetric|'admitted',number>>;
  evidence:Record<string,{section:string;page:number|null;method:string}>;
};
export type TrendResults = {reports:TrendReport[];schools:{school_id:string;school:string}[]};
export function trendValue(report:TrendReport|undefined,metric:TrendMetric):number|null {
  const value=report?.metrics[metric];
  return typeof value==='number'&&Number.isFinite(value)?value:null;
}
export function trendSource(report:TrendReport,metric:TrendMetric) {
  const page=report.evidence[metric]?.page;
  return report.source_url+(report.source_type==='pdf'&&page?`#page=${page}`:'');
}
export function trendFormat(metric:TrendMetric,value:number|null) {
  if(value===null)return 'Not reported';
  return metric.endsWith('_rate')?`${value.toFixed(2)}%`:value.toLocaleString('en-US');
}
