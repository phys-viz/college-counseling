'use client';
import type {Report} from '@/lib/report-types';
import type {TrendMetric,TrendReport} from '@/lib/trend-types';
import {scoreRange,trendDisplay,trendSource} from '@/lib/trend-types';
import {gpaBands,scoreBands} from '@/lib/metric-definitions';
const colors=['#087b6c','#3c61ad'];
function href(r:Report,key:string){const e=r.evidence[key];return (e?.source_url??r.source_url)+((e?.source_type??r.source_type)==='pdf'&&e?.page?`#page=${e.page}`:'');}
export function ScoreProfile({report}:{report:Report}){
 return <div className="score-profiles">{[['sat','SAT composite',400,1600],['reading','SAT reading',200,800],['math','SAT math',200,800],['act','ACT composite',1,36]].map(([key,label,min,max])=>{
  const k=String(key),metrics=Object.fromEntries(Object.entries(report.metrics).filter(([,v])=>typeof v==='number')) as Record<string,number>,range=scoreRange({metrics},k);if(!range)return <div className="score-profile" key={k}><strong>{label}</strong><p>Range not reported</p></div>;
  const lo=k==='sat'&&range.high>1600?600:Number(min),hi=k==='sat'&&range.high>1600?2400:Number(max),x=(v:number)=>30+(v-lo)/(hi-lo)*340;
  return <div className="score-profile" key={k}><div><strong>{label}</strong><a href={href(report,k+'_25')} target="_blank" rel="noreferrer">{range.low}–{range.high}</a></div><svg viewBox="0 0 400 76" role="img" aria-label={`${label}: 25th percentile ${range.low}, 75th percentile ${range.high}${range.median!==null?`, reported median ${range.median}`:', median not reported'}`}><line x1={30} x2={370} y1={32} y2={32} stroke="#ccd8e5"/><line x1={x(range.low)} x2={x(range.high)} y1={32} y2={32} stroke={colors[0]} strokeWidth={10} strokeLinecap="round"/>{[range.low,range.high].map(v=><line key={v} x1={x(v)} x2={x(v)} y1={21} y2={43} stroke={colors[0]} strokeWidth={2}/>)}{range.median!==null&&<circle className="reported-median" cx={x(range.median)} cy={32} r={6} fill="#fff" stroke="#172d48" strokeWidth={2}/>}<text x={30} y={65} fontSize={12} fill="#536880">{lo}</text><text x={370} y={65} textAnchor="end" fontSize={12} fill="#536880">{hi}</text></svg><p>{range.median!==null?`Reported median: ${range.median}`:'Median not reported'} · middle 50% of score submitters</p></div>;
 })}</div>;
}
export function Distribution({report,test}:{report:Report;test:keyof typeof scoreBands}){
 const values=scoreBands[test].map(([id,label])=>({key:`${test}_band_${id}`,label,value:report.metrics[`${test}_band_${id}`]}));
 if(!values.some(v=>typeof v.value==='number'))return <p className="fine-print">Score-band percentages were not reported or could not be extracted reliably for this assessment.</p>;
 return <div className="distribution" aria-label={`${test.toUpperCase()} score distribution`}>{values.map(v=><a key={v.key} href={href(report,v.key)} target="_blank" rel="noreferrer"><span>{v.label}</span><span className="distribution-track"><span style={{width:typeof v.value==='number'?`${v.value}%`:'0'}}/></span><strong>{typeof v.value==='number'?`${v.value.toFixed(1)}%`:'Not reported'}</strong></a>)}<p className="fine-print">Percentages describe enrolled submitters of this test. Blank bands stay unreported.</p></div>;
}
export function GPADistribution({report}:{report:Report}){
 return <div className="gpa-distributions">{[['all','All GPA reporters'],['scores','Test-score submitters reporting GPA'],['no_scores','Test non-submitters reporting GPA']].map(([population,label])=>{
  const values=gpaBands.map(([id,band])=>({key:`gpa_${id}_${population}`,label:band,value:report.metrics[`gpa_${id}_${population}`]}));
  if(!values.some(v=>typeof v.value==='number'))return null;
  return <section key={population}><h4>{label}</h4><div className="distribution" aria-label={label+' GPA distribution'}>{values.map(v=><a key={v.key} href={href(report,v.key)} target="_blank" rel="noreferrer"><span>{v.label}</span><span className="distribution-track"><span style={{width:typeof v.value==='number'?`${v.value}%`:'0'}}/></span><strong>{typeof v.value==='number'?`${v.value.toFixed(1)}%`:'Not reported'}</strong></a>)}</div></section>;
 })}</div>;
}
export function ScoreRangePlot({rows,metric,names,showLabels}:{rows:{year:number;reports:(TrendReport|undefined)[]}[];metric:TrendMetric;names:string[];showLabels:boolean}){
 const key=metric.replace('_range',''),maxScore=Math.max(...rows.flatMap(row=>row.reports.map(r=>r?.metrics[key+'_75']??0))),min=key==='act'?1:key==='sat'?(maxScore>1600?600:400):200,max=key==='act'?36:key==='sat'?(maxScore>1600?2400:1600):800;
 const width=1000,left=100,right=780,x=(value:number)=>left+(value-min)/(max-min)*(right-left),height=rows.length*names.length*48+60;
 const ticks=Array.from({length:5},(_,i)=>Math.round(min+(max-min)*i/4));
 return <svg className="score-range-chart" viewBox={`0 0 ${width} ${height}`} width="100%" style={{minWidth:750}} role="img" aria-label={`${metric.replace('_range','').toUpperCase()} percentile ranges by fall year`}>
  {ticks.map(v=><g key={v}><line x1={x(v)} x2={x(v)} y1={15} y2={height-35} stroke="#e3eaf2" strokeDasharray="3 3"/><text x={x(v)} y={height-10} textAnchor="middle" fontSize={13} fill="#536880">{v}</text></g>)}
  {rows.flatMap((row,i)=>row.reports.map((r,j)=>{const y=30+(i*names.length+j)*48,range=scoreRange(r,key);return <g key={`${row.year}:${j}`}><text x={10} y={y+5} fontSize={14} fill={colors[j]}>{row.year}{names.length>1?` ${j===0?'●':'◆'}`:''}</text>{range&&r?<a className="trend-point" href={trendSource(r,metric)} target="_blank" rel="noreferrer" aria-label={`${r.school}, Fall ${r.year}: ${trendDisplay(r,metric)}. Open original source.`} tabIndex={0}><title>{r.school}: {trendDisplay(r,metric)}</title><line x1={x(range.low)} x2={x(range.high)} y1={y} y2={y} stroke={colors[j]} strokeWidth={9} strokeLinecap="round"/>{[range.low,range.high].map(v=><line key={v} x1={x(v)} x2={x(v)} y1={y-10} y2={y+10} stroke={colors[j]} strokeWidth={2}/>)}{range.median!==null&&<circle className="reported-median" cx={x(range.median)} cy={y} r={6} fill="#fff" stroke={colors[j]} strokeWidth={2}/>}<text x={805} y={y+5} fontSize={13} fill={colors[j]}>{showLabels?`${range.low}–${range.high}${range.median!==null?` · ${range.median}`:''}`:''}</text></a>:<text x={left} y={y+5} fontSize={13} fill="#536880">Not reported</text>}</g>;}))}
 </svg>;
}
