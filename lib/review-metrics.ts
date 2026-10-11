import type {Report} from './report-types';
import {metricSection} from './metric-definitions';

/** An empty review input is an intentional omission, not an extraction gap. */
export function setReviewedMetric(report:Report,key:string,value:number|string|null) {
  const omitted=new Set(report.omitted_metrics??[]);
  if(value===null){
    delete report.metrics[key];delete report.evidence[key];omitted.add(key);
  }else{
    omitted.delete(key);report.metrics[key]=value;
    const section=metricSection(key),previous=report.evidence[key];
    report.evidence[key]={...previous,section,page:previous?.page??report.sections.find(s=>new RegExp(`\\b${section}\\b`).test(s.text))?.page??null,method:'user reviewed/edited'};
  }
  if(omitted.size)report.omitted_metrics=[...omitted];else delete report.omitted_metrics;
}
