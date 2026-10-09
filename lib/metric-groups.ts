import {trendMetrics,type TrendMetric} from './trend-types';
import {isGenderMetric} from './gender-metrics';

export const metricGroups=[
 {id:'admissions',label:'Admissions',color:'#087b6c'},
 {id:'gender',label:'Gender admissions',color:'#a13c63'},
 {id:'scores',label:'Test scores',color:'#2857a4'},
 {id:'academics',label:'Academic profile',color:'#713b99'},
 {id:'costs',label:'Costs & financial aid',color:'#926000'},
 {id:'outcomes',label:'Student outcomes',color:'#29743d'},
 {id:'transfer',label:'Transfer admissions',color:'#52657d'},
] as const;
export type MetricGroup=typeof metricGroups[number]['id'];
export function metricGroup(key:TrendMetric):MetricGroup{
 if(isGenderMetric(key))return 'gender';
 if(key.startsWith('transfer_'))return 'transfer';
 if(/^(sat_|reading_|math_|act_)/.test(key))return 'scores';
 if(/^(gpa_|class_|student_faculty)/.test(key))return 'academics';
 if(/^(retention_|graduation_)/.test(key))return 'outcomes';
 if(/^(tuition_|housing_|average_|need_|merit_)/.test(key))return 'costs';
 return 'admissions';
}
export const groupedMetrics=metricGroups.map(group=>({...group,metrics:trendMetrics.filter(m=>metricGroup(m.value)===group.id).sort((a,b)=>a.label.localeCompare(b.label,'en',{sensitivity:'base'}))}));
