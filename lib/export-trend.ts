import {trendContext,trendDisplay,trendSource,trendPopulation,isScoreRange,type TrendReport,type TrendMetric} from './trend-types';
import {schoolInitials,type SchoolBrand} from './school-branding';

async function embeddedLogo(path:string|undefined):Promise<string|null>{
 if(!path?.startsWith('/school-marks/'))return null;
 try{const response=await fetch(path,{signal:AbortSignal.timeout(5000)});if(!response.ok)return null;
  const blob=await response.blob();if(blob.size>1_000_000||!blob.type.startsWith('image/'))return null;
  return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
 }catch{return null;}
}

function download(name:string,blob:Blob) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportTrendCSV(reports:TrendReport[],ids:string[],from:number,to:number,metric:TrendMetric,name:string) {
  const rows:unknown[][]=[['School','Report fall year','Metric','Value','Applications','Students admitted','Students enrolled','Source URL','Source section','Source page','25th percentile','Reported median','75th percentile','Prior-year source','Reporting period','Selected population','Population applications','Population admitted','Population enrolled']];
  for(let year=from;year<=to;year++)for(const id of ids) {
    const r=reports.find(r=>r.school_id===id&&r.year===year);
    const key=isScoreRange(metric)?metric.replace('_range',''):'';
    const population=trendPopulation(r,metric);
    rows.push([reports.find(r=>r.school_id===id)?.school??id,year,metric,isScoreRange(metric)?trendDisplay(r,metric):r?.metrics[metric]??'',r?.metrics.applicants??'',r?.metrics.admitted??'',r?.metrics.enrolled??'',r?trendSource(r,metric):'',r?.evidence[key?key+'_25':metric]?.section??'',r?.evidence[key?key+'_25':metric]?.page??'',key?r?.metrics[key+'_25']??'':'',key?r?.metrics[key+'_50']??'':'',key?r?.metrics[key+'_75']??'':'',r?.previous?.source_url??'',r?trendContext(r,metric):'',population.label,population.applicants??'',population.admitted??'',population.enrolled??'']);
  }
  const escape=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  download(`${name}.csv`,new Blob([rows.map(r=>r.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
}

// Package the rendered chart as a standalone figure with its own title, legend, and citations.
export async function exportTrendImage(chart:SVGSVGElement,kind:'png'|'svg',options:{title:string;subtitle:string;names:string[];brands:SchoolBrand[];reports:TrendReport[];metric:TrendMetric;note:string;name:string}) {
  const ns='http://www.w3.org/2000/svg';
  const original=chart.getBoundingClientRect();const width=Math.max(1200,Math.ceil(original.width)),scale=width/original.width;
  const plotHeight=Math.round(original.height*scale),top=110+options.names.length*42;
  const logos=await Promise.all(options.brands.map(brand=>embeddedLogo(brand.logo)));
  const sources=options.names.map(name=>options.reports.find(r=>r.school===name)).filter((r):r is TrendReport=>!!r);
  const noteLines:string[]=[];let noteLine='';const lineLength=Math.floor((width-72)/8);
  for(const word of options.note.split(' ')){if(noteLine.length+word.length+1>lineLength){noteLines.push(noteLine);noteLine='';}noteLine+=(noteLine?' ':'')+word;}if(noteLine)noteLines.push(noteLine);
  const height=top+plotHeight+110+sources.length*28+Math.max(0,noteLines.length-1)*22;
  const root=document.createElementNS(ns,'svg');root.setAttribute('xmlns',ns);root.setAttribute('width',String(width));root.setAttribute('height',String(height));root.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const title=document.createElementNS(ns,'title');title.textContent=options.title;root.appendChild(title);
  const background=document.createElementNS(ns,'rect');background.setAttribute('width','100%');background.setAttribute('height','100%');background.setAttribute('fill','#fff');root.appendChild(background);
  const text=(value:string,x:number,y:number,size=18,color='#536880')=>{const node=document.createElementNS(ns,'text');node.textContent=value;node.setAttribute('x',String(x));node.setAttribute('y',String(y));node.setAttribute('font-family','Arial, Helvetica, sans-serif');node.setAttribute('font-size',String(size));node.setAttribute('fill',color);root.appendChild(node);return node;};
  text(options.title,36,42,28,'#172d48').setAttribute('font-weight','700');text(options.subtitle,36,74);
  options.names.forEach((name,i)=>{
    const brand=options.brands[i],y=110+i*42;
    if(logos[i]){const mark=document.createElementNS(ns,'image');mark.setAttribute('href',logos[i]!);mark.setAttribute('x','36');mark.setAttribute('y',String(y-23));mark.setAttribute('width','30');mark.setAttribute('height','30');root.appendChild(mark);}
    else text(schoolInitials(name),36,y,16,brand.color);
    text(name,78,y,18,brand.color).setAttribute('font-weight','600');
    const sample=document.createElementNS(ns,'line');sample.setAttribute('x1',String(width-110));sample.setAttribute('x2',String(width-40));sample.setAttribute('y1',String(y-6));sample.setAttribute('y2',String(y-6));sample.setAttribute('stroke',brand.color);sample.setAttribute('stroke-width','2.5');if(i===1)sample.setAttribute('stroke-dasharray','6 4');root.appendChild(sample);
    const marker=document.createElementNS(ns,i===0?'circle':'path'),cx=width-75,cy=y-6;
    if(i===0){marker.setAttribute('cx',String(cx));marker.setAttribute('cy',String(cy));marker.setAttribute('r','5');}else marker.setAttribute('d',`M ${cx} ${cy-6} L ${cx+6} ${cy} L ${cx} ${cy+6} L ${cx-6} ${cy} Z`);
    marker.setAttribute('fill','#fff');marker.setAttribute('stroke',brand.color);marker.setAttribute('stroke-width','2');root.appendChild(marker);
  });
  const clone=chart.cloneNode(true) as SVGSVGElement;
  // Inline resolved presentation styles so downloaded SVG/PNG work outside this app.
  const originals=[chart,...chart.querySelectorAll('*')],clones=[clone,...clone.querySelectorAll('*')];
  const properties=['fill','stroke','stroke-width','stroke-dasharray','font-family','font-size','font-weight','text-anchor','dominant-baseline','opacity'];
  originals.forEach((node,i)=>{const style=getComputedStyle(node);for(const property of properties)(clones[i] as SVGElement).style.setProperty(property,style.getPropertyValue(property));});
  clone.setAttribute('x','0');clone.setAttribute('y',String(top));clone.setAttribute('width',String(width));clone.setAttribute('height',String(plotHeight));clone.setAttribute('viewBox',chart.getAttribute('viewBox')??`0 0 ${original.width} ${original.height}`);
  clone.querySelectorAll('[tabindex]').forEach(n=>n.removeAttribute('tabindex'));root.appendChild(clone);
  text('Report fall year',width/2,top+plotHeight+12,17).setAttribute('text-anchor','middle');
  noteLines.forEach((line,i)=>text(line,36,top+plotHeight+44+i*22,16));
  sources.forEach((r,i)=>{
    const a=document.createElementNS(ns,'a');a.setAttribute('href',r.index_url);
    const domain=new URL(r.index_url).hostname;
    const section=r.evidence[isScoreRange(options.metric)?options.metric.replace('_range','_25'):options.metric]?.section??'CDS';
    const node=text(`Source: ${r.school} · Common Data Set, Section ${section} · ${domain}`,36,top+plotHeight+76+Math.max(0,noteLines.length-1)*22+i*28,16);
    a.appendChild(node);root.appendChild(a);
  });
  const metadata=document.createElementNS(ns,'metadata');metadata.textContent=JSON.stringify(options.reports.map(r=>({school:r.school,year:r.year,metric:options.metric,value:trendDisplay(r,options.metric),source:trendSource(r,options.metric),previous:r.previous})));root.appendChild(metadata);
  const xml=new XMLSerializer().serializeToString(root),blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});
  if(kind==='svg'){download(`${options.name}.svg`,blob);return;}
  const url=URL.createObjectURL(blob);
  try {
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image export is unavailable in this browser.');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The image could not be created.')),'image/png'));
    download(`${options.name}.png`,png);
  } finally {URL.revokeObjectURL(url);}
}
