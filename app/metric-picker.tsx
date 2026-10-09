'use client';
import {useId,useRef,useState} from 'react';
import {Check,ChevronsUpDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from '@/components/ui/command';
import {groupedMetrics,metricGroup} from '@/lib/metric-groups';
import {trendMetrics,type TrendMetric} from '@/lib/trend-types';

export default function MetricPicker({value,onChange}:{value:TrendMetric;onChange:(v:TrendMetric)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),id=useId();
 const trigger=useRef<HTMLButtonElement>(null);
 const selected=trendMetrics.find(m=>m.value===value)!,group=groupedMetrics.find(g=>g.id===metricGroup(value))!;
 return <div className="trend-choice metric-picker"><span id={id+'-label'}>Metric</span><Popover open={open} onOpenChange={v=>{setOpen(v);if(v)setQuery('');}}><PopoverTrigger asChild><Button ref={trigger} variant="outline" className="metric-picker-trigger" role="combobox" aria-label="Metric" aria-expanded={open} aria-controls={open?id+'-popup':undefined} aria-haspopup="dialog"><span className="metric-group-dot" style={{background:group.color}} aria-hidden="true"/><span>{selected.label}</span><ChevronsUpDown size={16}/></Button></PopoverTrigger>{open&&<PopoverContent onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}} id={id+'-popup'} align="start" collisionPadding={16} className="metric-picker-popup"><Command label="Search metrics" shouldFilter={false}><CommandInput aria-label="Search metrics" placeholder="Search metrics…" value={query} onValueChange={setQuery}/><CommandList><CommandEmpty>No matching metrics.</CommandEmpty>{groupedMetrics.map(g=>{const metrics=g.metrics.filter(m=>(m.label+' '+g.label).toLowerCase().includes(query.trim().toLowerCase()));return metrics.length>0&&<CommandGroup key={g.id} heading={<span className="metric-group-heading" style={{color:g.color}}><span className="metric-group-dot" style={{background:g.color}} aria-hidden="true"/>{g.label}</span>}>{metrics.map(m=><CommandItem key={m.value} value={m.value} aria-label={m.label} onSelect={()=>{onChange(m.value);setOpen(false);}}><span className="metric-group-dot" style={{background:g.color}} aria-hidden="true"/><span>{m.label}</span>{value===m.value&&<Check size={16} className="metric-selected" aria-hidden="true"/>}</CommandItem>)}</CommandGroup>;})}</CommandList></Command></PopoverContent>}</Popover></div>;
}
