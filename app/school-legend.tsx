'use client';
import {useState} from 'react';
import {schoolInitials,type SchoolBrand} from '@/lib/school-branding';
function SchoolMark({brand,name}:{brand:SchoolBrand;name:string}){
 const [failed,setFailed]=useState(false);
 return brand.logo&&!failed?<img className="school-logo" src={brand.logo} alt="" width={32} height={32} onError={()=>setFailed(true)}/>:<span className="school-initials" aria-hidden="true" style={{color:brand.color,borderColor:brand.color}}>{schoolInitials(name)}</span>;
}
export default function SchoolLegend({names,brands}:{names:string[];brands:SchoolBrand[]}){
 return <div className="trend-legend" aria-label="Chart legend">{names.map((name,i)=><div className="school-legend-item" key={brands[i].id} data-school={brands[i].id} style={{color:brands[i].color}}><SchoolMark brand={brands[i]} name={name}/><span>{name}</span><svg width={52} height={22} viewBox="0 0 52 22" aria-hidden="true"><line x1={2} x2={50} y1={11} y2={11} stroke={brands[i].color} strokeWidth={2.5} strokeDasharray={i===1?'6 4':undefined}/>{i===0?<circle cx={26} cy={11} r={4.5} fill="#fff" stroke={brands[i].color} strokeWidth={2}/>:<path d="M 26 5 L 32 11 L 26 17 L 20 11 Z" fill="#fff" stroke={brands[i].color} strokeWidth={2}/>}</svg><span className="sr-only">{i===0?'Solid line, circle markers':'Dashed line, diamond markers'}</span></div>)}</div>;
}
