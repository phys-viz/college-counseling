// Test-only .xlsx writer, so workbook fixtures are plain source text rather than binaries.
import zlib from 'node:zlib';
export function zip(files,{lie}={}) {
 const parts=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)) {
  // lie: declared uncompressed sizes that differ from the real part (expansion checks).
  const raw=Buffer.from(text),data=zlib.deflateRawSync(raw),n=Buffer.from(name),crc=zlib.crc32(raw),size=lie?.[name]??raw.length;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(size,22);local.writeUInt16LE(n.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(8,10);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(size,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);
  parts.push(local,n,data);central.push(entry,n);offset+=30+n.length+data.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return new Uint8Array(Buffer.concat([...parts,cd,end]));
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// Styles: 0 General, 1 builtin 0%, 2 m/d, 3 m/d/yyyy, 4 0.0%.
const styles='<styleSheet><numFmts count="3"><numFmt numFmtId="164" formatCode="m/d"/><numFmt numFmtId="165" formatCode="m/d/yyyy"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts><cellStyleXfs count="1"><xf numFmtId="10"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="9"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="166"/></cellXfs></styleSheet>';
/** sheets: {name: [[ref,value,style?],...]}; a value object {f,v,t} writes a formula cell. */
export function workbook(sheets) {
 const shared=[],index=s=>{let i=shared.indexOf(s);if(i<0){i=shared.length;shared.push(s);}return i;};
 const files={},names=Object.keys(sheets);
 names.forEach((name,i)=>{
  const rows=new Map();for(const cell of sheets[name]){const row=Number(cell[0].match(/\d+/)[0]);rows.set(row,[...rows.get(row)??[],cell]);}
  const xml=[...rows].sort((a,b)=>a[0]-b[0]).map(([r,cells])=>`<row r="${r}">${cells.map(([ref,v,s=0])=>typeof v==='object'?`<c r="${ref}" s="${s}"${v.t?` t="${v.t}"`:''}><f>${esc(v.f)}</f>${v.v===undefined?'':`<v>${esc(v.v)}</v>`}</c>`:typeof v==='number'?`<c r="${ref}" s="${s}"><v>${v}</v></c>`:`<c r="${ref}" s="${s}" t="s"><v>${index(v)}</v></c>`).join('')}</row>`).join('');
  files[`xl/worksheets/sheet${i+1}.xml`]=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="2" width="40" customWidth="1"/><col min="3" max="6" width="14" customWidth="1"/></cols><sheetData>${xml}</sheetData></worksheet>`;
 });
 files['xl/workbook.xml']=`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets>${names.map((n,i)=>`<sheet name="${esc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
 files['xl/_rels/workbook.xml.rels']=`<Relationships>${names.map((n,i)=>`<Relationship Id="rId${i+1}" Type="worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`;
 files['xl/sharedStrings.xml']=`<sst>${shared.map(s=>`<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
 files['xl/styles.xml']=styles;
 return zip(files);
}
