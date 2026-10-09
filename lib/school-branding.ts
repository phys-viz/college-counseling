import brands from '../data/school-branding.json';
export type SchoolBrand={id:string;color:string;logo?:string};
export const schoolInitials=(name:string)=>name.split(/\s+/).filter(w=>w&&!['of','the','university'].includes(w.toLowerCase())).slice(0,2).map(w=>w[0]).join('');
const fallbackColors=['#087b6c','#2857a4','#713b99','#926000','#29743d','#52657d','#9b374c'];
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
export function schoolBrand(schoolId:string,name=''):SchoolBrand{
 const identity=normalize(schoolId),label=normalize(name);
 const brand=brands.find(b=>b.aliases.some(alias=>normalize(alias)===identity)||label===normalize(b.id)||label===normalize(b.id+' university')||b.id==='penn-state'&&label.startsWith('pennstateuniversitypark')||b.id==='south-carolina'&&label.startsWith('universityofsouthcarolina'));
 if(brand)return {id:brand.id,color:brand.color,logo:brand.logo};
 const hash=[...schoolId].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,0);
 return {id:schoolId,color:fallbackColors[hash%fallbackColors.length]};
}
