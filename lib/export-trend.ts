import {trendFormat,trendSource,type TrendReport,type TrendMetric} from './trend-types';

function download(name:string,blob:Blob) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportTrendCSV(reports:TrendReport[],ids:string[],from:number,to:number,metric:TrendMetric,name:string) {
  const rows:unknown[][]=[['School','Fall year','Metric','Value','Applications','Students admitted','Students enrolled','Source URL','Source section','Source page']];
  for(let year=from;year<=to;year++)for(const id of ids) {
    const r=reports.find(r=>r.school_id===id&&r.year===year);
    rows.push([reports.find(r=>r.school_id===id)?.school??id,year,metric,r?.metrics[metric]??'',r?.metrics.applicants??'',r?.metrics.admitted??'',r?.metrics.enrolled??'',r?trendSource(r,metric):'',r?.evidence[metric]?.section??'',r?.evidence[metric]?.page??'']);
  }
  const escape=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  download(`${name}.csv`,new Blob([rows.map(r=>r.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
}

// Package the rendered chart as a standalone figure with its own title, legend, and citations.
export async function exportTrendImage(chart:SVGSVGElement,kind:'png'|'svg',options:{title:string;subtitle:string;names:string[];colors:string[];reports:TrendReport[];metric:TrendMetric;note:string;name:string}) {
  const ns='http://www.w3.org/2000/svg';
  const original=chart.getBoundingClientRect();const width=Math.max(1200,Math.ceil(original.width)),scale=width/original.width;
  const plotHeight=Math.round(original.height*scale),top=130;
  const sources=options.names.map(name=>options.reports.find(r=>r.school===name)).filter((r):r is TrendReport=>!!r);
  const height=top+plotHeight+110+sources.length*28;
  const root=document.createElementNS(ns,'svg');root.setAttribute('xmlns',ns);root.setAttribute('width',String(width));root.setAttribute('height',String(height));root.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const title=document.createElementNS(ns,'title');title.textContent=options.title;root.appendChild(title);
  const background=document.createElementNS(ns,'rect');background.setAttribute('width','100%');background.setAttribute('height','100%');background.setAttribute('fill','#fff');root.appendChild(background);
  const text=(value:string,x:number,y:number,size=18,color='#536880')=>{const node=document.createElementNS(ns,'text');node.textContent=value;node.setAttribute('x',String(x));node.setAttribute('y',String(y));node.setAttribute('font-family','Arial, Helvetica, sans-serif');node.setAttribute('font-size',String(size));node.setAttribute('fill',color);root.appendChild(node);return node;};
  text(options.title,36,42,28,'#172d48').setAttribute('font-weight','700');text(options.subtitle,36,74);
  options.names.forEach((name,i)=>text(`${i===0?'●':'◆'} ${name}`,36+i*470,108,18,options.colors[i]));
  const clone=chart.cloneNode(true) as SVGSVGElement;
  // Inline resolved presentation styles so downloaded SVG/PNG work outside this app.
  const originals=[chart,...chart.querySelectorAll('*')],clones=[clone,...clone.querySelectorAll('*')];
  const properties=['fill','stroke','stroke-width','stroke-dasharray','font-family','font-size','font-weight','text-anchor','dominant-baseline','opacity'];
  originals.forEach((node,i)=>{const style=getComputedStyle(node);for(const property of properties)(clones[i] as SVGElement).style.setProperty(property,style.getPropertyValue(property));});
  clone.setAttribute('x','0');clone.setAttribute('y',String(top));clone.setAttribute('width',String(width));clone.setAttribute('height',String(plotHeight));clone.setAttribute('viewBox',`0 0 ${original.width} ${original.height}`);
  clone.querySelectorAll('[tabindex]').forEach(n=>n.removeAttribute('tabindex'));root.appendChild(clone);
  text('Fall cohort',width/2,top+plotHeight+12,17).setAttribute('text-anchor','middle');
  text(options.note,36,top+plotHeight+44,16);
  sources.forEach((r,i)=>{
    const a=document.createElementNS(ns,'a');a.setAttribute('href',r.index_url);
    const domain=new URL(r.index_url).hostname;
    const node=text(`Source: ${r.school} · Common Data Set, Section C1 · ${domain}`,36,top+plotHeight+76+i*28,16);
    a.appendChild(node);root.appendChild(a);
  });
  const metadata=document.createElementNS(ns,'metadata');metadata.textContent=JSON.stringify(options.reports.map(r=>({school:r.school,year:r.year,metric:options.metric,value:trendFormat(options.metric,r.metrics[options.metric]??null),source:trendSource(r,options.metric)})));root.appendChild(metadata);
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
