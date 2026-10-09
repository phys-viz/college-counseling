'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Copy,Download,ExternalLink,Info} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {trendFormat,trendDisplay,trendContext,trendDetails,trendMetrics,trendSource,trendValue,trendUnit,trendNote,isScoreRange,type TrendMetric,type TrendReport,type TrendResults} from '@/lib/trend-types';
import {ScoreRangePlot} from './score-visuals';
import MetricPicker from './metric-picker';
import SchoolLegend from './school-legend';
import {schoolBrand} from '@/lib/school-branding';
import {copyTrendImage,exportTrendCSV,exportTrendImage} from '@/lib/export-trend';
import {fetchJSON} from '@/lib/fetch-json';

type YearRow={year:number;primary:number|null;comparison:number|null;reports:(TrendReport|undefined)[]};
function Choice({label,value,onChange,options}:{label:string;value:string;onChange:(s:string)=>void;options:{value:string;label:string}[]}) {
  return <label className="trend-choice"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></label>;
}
function PointDetails({row,metric}:{row:YearRow;metric:TrendMetric}) {
  return <><strong>Fall {row.year}</strong>{row.reports.map(r=>r&&<div key={r.school_id}><b style={{color:schoolBrand(r.school_id,r.school).color}}>{r.school}</b><strong>{trendDisplay(r,metric)}</strong>{trendContext(r,metric)&&<span>{trendContext(r,metric)}</span>}{trendDetails(r,metric).map(detail=><span key={detail}>{detail}</span>)}</div>)}</>;
}

export default function Trends({refresh}:{refresh:number}) {
  const [school,setSchool]=useState('cornell'),[comparison,setComparison]=useState('none');
  const [metric,setMetric]=useState<TrendMetric>('admit_rate'),[start,setStart]=useState('2010'),[end,setEnd]=useState('2015');
  const [data,setData]=useState<TrendResults|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [showLabels,setShowLabels]=useState(true),[focused,setFocused]=useState<YearRow|null>(null),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const [axisMode,setAxisMode]=useState('auto'),[axisMin,setAxisMin]=useState(''),[axisMax,setAxisMax]=useState(''),[copied,setCopied]=useState(false);
  const figure=useRef<HTMLDivElement>(null);
  const from=Number(start),to=Number(end);
  const valid=!!start&&!!end&&Number.isInteger(from)&&Number.isInteger(to)&&from>=1900&&to<=2100&&from<=to;
  useEffect(()=>{
    setFocused(null);setExportError('');if(!valid)return;
    const abort=new AbortController();setLoading(true);setError('');
    const params=new URLSearchParams({school,from:String(from),to:String(to)});if(comparison!=='none')params.append('school',comparison);
    fetchJSON<TrendResults>('/api/trends?'+params,abort.signal).then(setData).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'The trend data could not load.');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[school,comparison,from,to,valid,refresh,retry]);
  useEffect(()=>{setFocused(null);setExportError('');setCopied(false);},[metric,school,comparison,start,end,axisMode,axisMin,axisMax,showLabels]);
  const ids=comparison==='none'?[school]:[school,comparison];
  const names=ids.map(id=>data?.schools.find(s=>s.school_id===id)?.school??(id==='cornell'?'Cornell University':id));
  const brands=ids.map((id,i)=>schoolBrand(id,names[i])),colors=brands.map(b=>b.color);
  const rows=useMemo(()=>{
    if(!valid)return [];
    const map=new Map((data?.reports??[]).map(r=>[`${r.school_id}:${r.year}`,r]));
    return Array.from({length:to-from+1},(_,i)=>{
      const year=from+i,primary=map.get(`${school}:${year}`),second=map.get(`${comparison}:${year}`);
      return {year,primary:trendValue(primary,metric),comparison:trendValue(second,metric),reports:comparison==='none'?[primary]:[primary,second]};
    });
  },[data,from,to,valid,school,comparison,metric]);
  const hasData=rows.some(r=>r.primary!==null||r.comparison!==null);
  const unit=trendUnit(metric),percentage=unit==='percent'||unit==='points',metricLabel=trendMetrics.find(m=>m.value===metric)!.label;
  const subtitle=`${names.join(' vs. ')} · Fall ${from}${from===to?'':`–${to}`}`;
  const note=trendNote(metric);
  const missing=rows.reduce((n,r)=>n+(r.primary===null?1:0)+(comparison!=='none'&&r.comparison===null?1:0),0);
  const filename=`${ids.join('-vs-')}-${metric}-${from}-${to}`;
  const customAxisValid=axisMin.trim()!==''&&axisMax.trim()!==''&&Number.isFinite(Number(axisMin))&&Number.isFinite(Number(axisMax))&&Number(axisMin)<Number(axisMax);
  const axisValid=isScoreRange(metric)||axisMode!=='custom'||customAxisValid;
  const signedMetric=metric==='application_growth'||metric==='admit_rate_change';
  const plotValues=rows.flatMap(r=>[r.primary,r.comparison]).filter((v):v is number=>v!==null);
  const axisDomain:[number|'auto',number|'auto']=axisMode==='custom'&&customAxisValid?[Number(axisMin),Number(axisMax)]:axisMode==='zero'?(signedMetric?[Math.min(0,...plotValues),Math.max(0,...plotValues)]:[0,'auto']):['auto','auto'];
  const axisLabel=isScoreRange(metric)?'':axisMode==='custom'&&customAxisValid?`Y-axis: ${trendFormat(metric,Number(axisMin))} to ${trendFormat(metric,Number(axisMax))}`:axisMode==='zero'?(signedMetric?'Y-axis includes zero':'Y-axis starts at zero'):'Y-axis: automatic range';
  const ready=valid&&axisValid&&!loading&&!error&&hasData;
  function changeMetric(value:TrendMetric){setMetric(value);setAxisMode('auto');setAxisMin('');setAxisMax('');}
  function changeAxis(value:string){
    if(value==='custom'){
      const values=rows.flatMap(r=>[r.primary,r.comparison]).filter((v):v is number=>v!==null);
      const low=Math.min(...values),high=Math.max(...values),padding=low===high?Math.max(Math.abs(low)*.05,1):(high-low)*.1;
      setAxisMin(String(Number((low-padding).toFixed(2))));setAxisMax(String(Number((high+padding).toFixed(2))));
    }
    setAxisMode(value);
  }
  async function exportImage(kind:'png'|'svg'|'copy') {
    const chart=figure.current?.querySelector<SVGSVGElement>('svg.recharts-surface,svg.score-range-chart');if(!chart)return;
    setExporting(true);setExportError('');setCopied(false);
    const options={title:`${metricLabel} · Fall ${from}${from===to?'':`–${to}`}`,subtitle:'College research · College Admissions research library',names,brands,reports:(data?.reports??[]).filter(r=>ids.includes(r.school_id)&&r.year>=from&&r.year<=to),metric,note:[axisLabel,note].filter(Boolean).join('. '),name:filename,axisLabel};
    try {if(kind==='copy'){await copyTrendImage(chart,options);setCopied(true);}else await exportTrendImage(chart,kind,options);}
    catch(e){setExportError(kind==='copy'?'Could not copy the graph. Allow clipboard access in your browser, or use Download PNG.':e instanceof Error?e.message:'Chart download failed. Try SVG or CSV.');}finally{setExporting(false);}
  }
  function dot(props:{cx?:number;cy?:number;payload?:YearRow},series:number) {
    const {cx,cy,payload}=props,r=payload?.reports[series];if(cx===undefined||cy===undefined||!r||trendValue(r,metric)===null)return <g/>;
    const value=trendValue(r,metric)!;if(axisMode==='custom'&&customAxisValid&&(value<Number(axisMin)||value>Number(axisMax)))return <g/>;
    const description=`${r.school}, Fall ${r.year}: ${trendFormat(metric,trendValue(r,metric))}. Open original source.`;
    return <g key={`${r.school_id}:${r.year}`}><a className="trend-point" href={trendSource(r,metric)} target="_blank" rel="noreferrer" aria-label={description} tabIndex={0} onFocus={()=>setFocused(payload!)} onBlur={()=>setFocused(null)}>
      <title>{description}</title><circle cx={cx} cy={cy} r={10} fill="transparent"/>
      {series===0?<circle cx={cx} cy={cy} r={4.5} fill="#fff" stroke={colors[series]} strokeWidth={2}/>:<path d={`M ${cx} ${cy-5} L ${cx+5} ${cy} L ${cx} ${cy+5} L ${cx-5} ${cy} Z`} fill="#fff" stroke={colors[series]} strokeWidth={2}/>}
    </a>{showLabels&&<text x={cx} y={cy+(series===0?-14:23)} fill={colors[series]} fontFamily="Arial, Helvetica, sans-serif" fontSize={13} fontWeight={600} textAnchor="middle" pointerEvents="none">{trendFormat(metric,trendValue(r,metric))}</text>}</g>;
  }
  return <section className="trends" aria-label="Admissions trends">
    <div className="trend-controls">
      <Choice label="Trend school" value={school} onChange={v=>{setSchool(v);if(v===comparison)setComparison('none');}} options={data?.schools.map(s=>({value:s.school_id,label:s.school}))??[{value:'cornell',label:'Cornell University'}]}/>
      <MetricPicker value={metric} onChange={changeMetric}/>
      <Choice label="Compare with" value={comparison} onChange={setComparison} options={[{value:'none',label:'No comparison'},...(data?.schools??[]).filter(s=>s.school_id!==school).map(s=>({value:s.school_id,label:s.school}))]}/>
      <div className="trend-year-range"><label><span>From year</span><Input aria-label="From year" type="number" min={1900} max={2100} step={1} value={start} onChange={e=>setStart(e.target.value)}/></label><label><span>To year</span><Input aria-label="To year" type="number" min={1900} max={2100} step={1} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    </div>
    {!valid?<div className="empty" role="alert"><h2>Check the year range</h2><p>Enter whole years between 1900 and 2100, with the starting year no later than the ending year.</p></div>:loading?<div className="empty" role="status">Loading trend data…</div>:error?<div className="empty" role="alert"><h2>Trend data could not load</h2><p>{error}</p><Button onClick={()=>setRetry(v=>v+1)}>Retry chart</Button></div>:!hasData?<div className="empty"><h2>No reported values in this range</h2><p>Choose another year range or school.</p></div>:<>
      <div className="trend-figure" ref={figure}>
        <div className="trend-heading"><div><h2>{metricLabel}</h2><p>{subtitle}</p></div><label className="trend-label-toggle"><Checkbox checked={showLabels} onCheckedChange={v=>setShowLabels(v===true)} aria-label="Show point labels"/> Show point labels</label></div>
        <SchoolLegend names={names} brands={brands}/>
        {!isScoreRange(metric)&&<div className="trend-axis-controls"><Choice label="Y-axis view" value={axisMode} onChange={changeAxis} options={[{value:'auto',label:'Automatic range'},{value:'zero',label:signedMetric?'Include zero':'Start at zero'},{value:'custom',label:'Custom range'}]}/>{axisMode==='custom'&&<div className="trend-axis-range"><label><span>Y-axis minimum</span><Input aria-label="Y-axis minimum" type="number" step="any" value={axisMin} onChange={e=>setAxisMin(e.target.value)}/></label><label><span>Y-axis maximum</span><Input aria-label="Y-axis maximum" type="number" step="any" value={axisMax} onChange={e=>setAxisMax(e.target.value)}/></label></div>}{axisMode!=='auto'&&<Button variant="ghost" onClick={()=>setAxisMode('auto')}>Reset axis</Button>}<p>{axisLabel}</p></div>}
        {!axisValid&&<p className="trend-export-error" role="alert">Enter a minimum and maximum, with the minimum smaller than the maximum. The chart uses automatic range until both are valid.</p>}
        <p className="trend-axis-caption">{isScoreRange(metric)?'Bars: 25th–75th percentiles · dots: reported medians':metricLabel+(unit==='percent'?' (%)':unit==='points'?' (percentage points)':unit==='dollars'?' (US dollars)':'')}</p>
        {isScoreRange(metric)?<div className="trend-scroll score-range-scroll"><ScoreRangePlot rows={rows} metric={metric} names={names} colors={colors} showLabels={showLabels}/></div>:
        <div className="trend-scroll"><div className="trend-plot" style={{minWidth:Math.max(650,rows.length*(showLabels?70:28))}}>
          <ResponsiveContainer width="100%" height={370}>
            <LineChart data={rows} margin={{top:30,right:42,bottom:12,left:22}} accessibilityLayer>
              <CartesianGrid stroke="#e3eaf2" strokeDasharray="3 3" vertical={false}/>
              <XAxis dataKey="year" type="number" domain={from===to?[from-.5,to+.5]:[from,to]} ticks={rows.map(r=>r.year)} allowDecimals={false} tick={{fill:'#536880',fontSize:13}} axisLine={{stroke:'#ccd8e5'}} tickLine={false} minTickGap={18}/>
              <YAxis domain={axisDomain} allowDataOverflow={axisValid&&axisMode!=='auto'} allowDecimals={percentage||unit==='gpa'||unit==='ratio'} tick={{fill:'#536880',fontSize:13}} axisLine={false} tickLine={false} width={78} tickFormatter={v=>trendFormat(metric,Number(v))}/>
              <Tooltip content={({active,payload})=>{const row=payload?.[0]?.payload as YearRow|undefined;return active&&row?<div className="trend-tooltip"><PointDetails row={row} metric={metric}/></div>:null;}}/>
              <Line dataKey="primary" name={names[0]} type="linear" stroke={colors[0]} strokeWidth={2.5} connectNulls={false} isAnimationActive={false} activeDot={false} dot={props=>dot(props,0)}/>
              {comparison!=='none'&&<Line dataKey="comparison" name={names[1]} type="linear" stroke={colors[1]} strokeWidth={2.5} strokeDasharray="6 4" connectNulls={false} isAnimationActive={false} activeDot={false} dot={props=>dot(props,1)}/>}
            </LineChart>
          </ResponsiveContainer>
        </div></div>}
        <p className="trend-x-caption">{isScoreRange(metric)?'Test score · each row is a fall cohort':'CDS report fall year'}</p>
        {focused&&<div className="trend-focus-details" role="status"><PointDetails row={focused} metric={metric}/></div>}
        <div className="trend-notes"><Info size={18}/><div><p>{note}</p><p>{isScoreRange(metric)?'Click a range or table value to open the original source.':'Hover for metric details. Click a point or table value to open the original source.'}{missing>0?` ${missing} missing ${missing===1?'value is':'values are'} shown as gaps.`:''}</p></div></div>
      </div>
      <div className="trend-downloads"><span>Share the current graph</span><Button variant="outline" disabled={!ready||exporting} onClick={()=>exportImage('copy')}><Copy size={16}/> Copy graph</Button><Button variant="outline" disabled={!ready||exporting} onClick={()=>exportImage('png')}><Download size={16}/> Download PNG</Button><Button variant="outline" disabled={!ready||exporting} onClick={()=>exportImage('svg')}>Download SVG</Button><Button variant="outline" disabled={!ready||exporting} onClick={()=>exportTrendCSV(data?.reports??[],ids,from,to,metric,filename)}>Download chart data</Button></div>
      {copied&&<p role="status">Graph copied. Paste it into an email or document.</p>}
      {exportError&&<p role="alert" className="trend-export-error">{exportError}</p>}
      {exporting&&<p role="status">Preparing your chart…</p>}
      <section className="results-panel trend-data"><div className="panel-header"><h2>Chart data & sources</h2><span className="muted">{rows.length} report {rows.length===1?'year':'years'}</span></div><Table><TableHeader><TableRow><TableHead>Report fall year</TableHead>{names.map(name=><TableHead key={name}>{name}<br/>{metricLabel}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.year}><TableCell>{row.year}</TableCell>{row.reports.map((r,i)=><TableCell key={ids[i]}>{r&&trendValue(r,metric)!==null?<><a className="table-metric trend-source" href={trendSource(r,metric)} target="_blank" rel="noreferrer">{trendDisplay(r,metric)}<ExternalLink size={13}/><span className="sr-only">Original source for {r.school}, Fall {r.year}</span></a>{trendContext(r,metric)&&<span className="reporting-context">{trendContext(r,metric)}</span>}{r.previous&&['application_growth','admit_rate_change'].includes(metric)&&<a className="prior-source" href={r.previous.source_url+(r.previous.source_type==='pdf'&&r.previous.page?`#page=${r.previous.page}`:'')} target="_blank" rel="noreferrer">{r.previous.year} baseline source</a>}</>:<span className="muted">Not reported</span>}</TableCell>)}</TableRow>)}</TableBody></Table></section>
    </>}
  </section>;
}
