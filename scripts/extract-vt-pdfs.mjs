import fs from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import './register-ts.mjs';
const {repairCDSGlyphs}=await import('../lib/pdf-glyphs.ts');
for(const year of [2019,2023]){
 const doc=await getDocument({data:new Uint8Array(fs.readFileSync(`.sites-runtime/vt/virginia-tech-${year}.pdf`)),useSystemFonts:true}).promise;
 const pages=[],raw=[];
 for(let n=1;n<=doc.numPages;n++){
  const page=await doc.getPage(n),content=await page.getTextContent();raw.push({page:n,items:content.items.filter(i=>'str' in i)});
  const words=repairCDSGlyphs(content.items.filter(i=>'str' in i)).map(i=>({str:i.str,x:i.transform[4],y:i.transform[5],width:i.width})).filter(w=>w.str.trim());
  const lines=[];
  for(const word of words.sort((a,b)=>b.y-a.y||a.x-b.x)){const line=lines.find(l=>Math.abs(l.words[0].y-word.y)<3);if(line)line.words.push(word);else lines.push({text:'',words:[word]});}
  for(const line of lines){line.words.sort((a,b)=>a.x-b.x);line.text=line.words.map(w=>w.str).join(' ').replace(/\s+/g,' ').trim();}
  pages.push({page:n,text:lines.map(l=>l.text).join('\n'),lines,form_fields:[]});
 }
 fs.writeFileSync(`.sites-runtime/vt/${year}-pages.json`,JSON.stringify(pages));
 fs.mkdirSync('scripts/fixtures/vt',{recursive:true});if(year===2019){const d=JSON.parse(fs.readFileSync('data/vt-sources.json','utf8')).find(d=>d.year===year);fs.writeFileSync(`scripts/fixtures/vt/${year}-glyphs.json`,JSON.stringify({source_url:d.url,sha256:d.sha256,pages:raw.filter(p=>p.page===7)}));}
 await doc.cleanup();
}

