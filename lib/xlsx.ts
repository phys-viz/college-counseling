// Minimal Office Open XML workbook reader for public CDS spreadsheets. It reads
// cached cell values only (never recalculates formulas) and runs in the browser
// and Node 22 without dependencies. Legacy .xls (BIFF) files are not supported.
export type WorkbookCell={row:number;column:number;ref:string;value:string|number|boolean;format:string};
export type Worksheet={name:string;cells:WorkbookCell[];widths:Map<number,number>};
export type Workbook={sheets:Worksheet[];date1904:boolean};
type ZipEntry={name:string;method:number;compressed:number;size:number;offset:number;flags:number};

const MAX_ENTRY=60_000_000,MAX_TOTAL=150_000_000;
export class WorkbookFormatError extends Error {constructor(message:string){super(message);this.name='WorkbookFormatError';}}
export const isZip=(bytes:Uint8Array)=>bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04;
export const isLegacyWorkbook=(bytes:Uint8Array)=>[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((b,i)=>bytes[i]===b);

export function zipEntries(bytes:Uint8Array):ZipEntry[] {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw new WorkbookFormatError('The spreadsheet archive is damaged or incomplete.');
  const count=view.getUint16(end+10,true);let at=view.getUint32(end+16,true);
  if(count===0xffff||at===0xffffffff)throw new WorkbookFormatError('ZIP64 spreadsheets are not supported.');
  if(count>5000)throw new WorkbookFormatError('The spreadsheet contains too many parts.');
  const entries:ZipEntry[]=[];
  for(let i=0;i<count;i++) {
    if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw new WorkbookFormatError('The spreadsheet archive is damaged or incomplete.');
    const nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true);
    entries.push({name:new TextDecoder().decode(bytes.subarray(at+46,at+46+nameLength)),flags:view.getUint16(at+8,true),method:view.getUint16(at+10,true),compressed:view.getUint32(at+20,true),size:view.getUint32(at+24,true),offset:view.getUint32(at+42,true)});
    at+=46+nameLength+extra+comment;
  }
  return entries;
}
/** Whether a ZIP archive is an Excel workbook rather than, e.g., a Word document. */
export const isWorkbookArchive=(bytes:Uint8Array)=>{try{return isZip(bytes)&&zipEntries(bytes).some(e=>e.name==='xl/workbook.xml');}catch{return false;}};

async function inflate(bytes:Uint8Array,limit:number) {
  const reader=new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new WorkbookFormatError('A spreadsheet part expands beyond its declared size.');}chunks.push(value);}
  const out=new Uint8Array(length);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}
  return out;
}

const decode=(s:string)=>s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(lt|gt|amp|quot|apos));/gi,(_,hex,dec,name)=>hex?String.fromCodePoint(parseInt(hex,16)):dec?String.fromCodePoint(Number(dec)):({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"} as Record<string,string>)[name.toLowerCase()])
  // OOXML escapes control characters in strings as _xHHHH_.
  .replace(/_x([0-9a-f]{4})_/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
// Attribute names lose namespace prefixes, so r:id and x:r read as id and r.
const attrs=(tag:string)=>Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].replace(/^[\w.-]+:/,''),decode(m[2]??m[3])]));
const elements=(xml:string,name:string)=>[...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>)`,'g'))].map(m=>({attrs:attrs(m[1]),body:m[2]??''}));
const text=(xml:string)=>elements(xml.replace(/<(?:[\w.-]+:)?rPh\b[\s\S]*?<\/(?:[\w.-]+:)?rPh>/g,''),'t').map(t=>decode(t.body)).join('');
const columnNumber=(letters:string)=>[...letters.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
export const columnLetters=(n:number)=>{let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const builtinFormats:Record<number,string>={0:'General',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',11:'0.00E+00',12:'# ?/?',13:'# ??/??',14:'mm-dd-yy',15:'d-mmm-yy',16:'d-mmm',17:'mmm-yy',18:'h:mm AM/PM',19:'h:mm:ss AM/PM',20:'h:mm',21:'h:mm:ss',22:'m/d/yy h:mm',37:'#,##0 ;(#,##0)',38:'#,##0 ;[Red](#,##0)',39:'#,##0.00;(#,##0.00)',40:'#,##0.00;[Red](#,##0.00)',45:'mm:ss',46:'[h]:mm:ss',47:'mmss.0',48:'##0.0E+0',49:'@'};

export async function readWorkbook(bytes:Uint8Array,signal?:AbortSignal):Promise<Workbook> {
  if(isLegacyWorkbook(bytes))throw new WorkbookFormatError('This is an Excel 97–2003 (.xls) workbook. Automatic extraction supports .xlsx workbooks; use a reviewed source adapter or JSON import for .xls files.');
  if(!isZip(bytes))throw new WorkbookFormatError('This file is not an Excel .xlsx workbook.');
  const entries=new Map(zipEntries(bytes).map(e=>[e.name,e]));
  if(!entries.has('xl/workbook.xml'))throw new WorkbookFormatError('This archive is not an Excel workbook.');
  let total=0;
  const part=async(name:string)=>{
    if(signal?.aborted)throw new Error('Extraction canceled.');
    const e=entries.get(name);if(!e)return '';
    if(e.flags&1)throw new WorkbookFormatError('Password-protected spreadsheets are not supported.');
    if(e.size>MAX_ENTRY||(total+=e.size)>MAX_TOTAL)throw new WorkbookFormatError('The spreadsheet expands beyond the import size limit.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(view.getUint32(e.offset,true)!==0x04034b50)throw new WorkbookFormatError('The spreadsheet archive is damaged or incomplete.');
    const start=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true),data=bytes.subarray(start,start+e.compressed);
    if(e.method===0)return new TextDecoder().decode(data);
    if(e.method!==8)throw new WorkbookFormatError('The spreadsheet uses an unsupported compression method.');
    return new TextDecoder().decode(await inflate(data,e.size));
  };
  const book=await part('xl/workbook.xml');
  const relations=new Map(elements(await part('xl/_rels/workbook.xml.rels'),'Relationship').map(r=>[r.attrs.Id,r.attrs.Target]));
  const shared=elements(await part('xl/sharedStrings.xml'),'si').map(s=>text(s.body));
  const styles=await part('xl/styles.xml');
  const formats=new Map(elements(styles,'numFmt').map(f=>[Number(f.attrs.numFmtId),f.attrs.formatCode]));
  // cellStyleXfs also contains <xf>; cell s= indexes only cellXfs.
  const cellXfs=elements(elements(styles,'cellXfs')[0]?.body??'','xf').map(x=>{const id=Number(x.attrs.numFmtId??0);return formats.get(id)??builtinFormats[id]??'General';});
  const date1904=/^(?:1|true)$/i.test(elements(book,'workbookPr')[0]?.attrs.date1904??'');
  const sheets:Worksheet[]=[];
  for(const sheet of elements(book,'sheet')) {
    const target=relations.get(sheet.attrs.id);if(!target)continue;
    const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
    const xml=await part(path.replace(/\/[^/]+\/\.\.\//g,'/'));
    const cells:WorkbookCell[]=[];let lastRow=0;
    for(const row of elements(xml,'row')) {
      const rowNumber=Number(row.attrs.r)||lastRow+1;lastRow=rowNumber;let column=0;
      for(const c of elements(row.body,'c')) {
        const ref=/^([A-Z]+)(\d+)$/i.exec(c.attrs.r??'');column=ref?columnNumber(ref[1]):column+1;
        const format=cellXfs[Number(c.attrs.s??0)]??'General',type=c.attrs.t??'n';
        const raw=elements(c.body,'v')[0]?.body;let value:WorkbookCell['value']|undefined;
        if(type==='inlineStr')value=text(elements(c.body,'is')[0]?.body??'');
        else if(raw===undefined)continue; // Formula without a cached value, or a styled blank.
        else if(type==='s')value=shared[Number(raw)]??'';
        else if(type==='str'||type==='e'||type==='d')value=decode(raw);
        else if(type==='b')value=raw.trim()==='1';
        else {const n=Number(raw);if(!raw.trim()||!Number.isFinite(n))continue;value=n;}
        if(typeof value==='string'&&!value.trim())continue; // Blank formula results are not answers.
        cells.push({row:rowNumber,column,ref:columnLetters(column)+rowNumber,value,format});
      }
    }
    // Match openpyxl: a <col min max> width is keyed by its first column only.
    const widths=new Map(elements(xml,'col').map(c=>[Number(c.attrs.min),Number(c.attrs.width??13)] as const));
    sheets.push({name:sheet.attrs.name??'',cells:cells.sort((a,b)=>a.row-b.row||a.column-b.column),widths});
  }
  return {sheets,date1904};
}

const pyG=(v:number)=>{
  // Python's "{:g}": six significant digits, exponent outside 1e-4..1e6.
  if(v===0)return '0';
  const [mantissa,e]=v.toExponential(5).split('e'),exp=Number(e);
  const strip=(s:string)=>s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s;
  return exp<-4||exp>=6?`${strip(mantissa)}e${exp<0?'-':'+'}${String(Math.abs(exp)).padStart(2,'0')}`:strip(v.toFixed(Math.max(0,5-exp)));
};
const isDateFormat=(format:string)=>/(?<!\\)[dmhys]/i.test(format.split(';')[0].replace(/\[(?!(?:hh?|mm?|ss?)\])[^\]]*\]|"[^"]*"|\\.|_.|\*./g,'').replace(/General/gi,''));
/** Display text for a cached cell value, matching the offline openpyxl adapters
 * (percent formats scaled, dates as MM/DD/YYYY). Whole numbers keep every digit. */
export function cellText(cell:WorkbookCell,date1904=false) {
  const {value,format}=cell;
  if(typeof value==='boolean')return value?'1':'0';
  if(typeof value==='string')return value.replace(/\s+/g,' ').trim();
  if(isDateFormat(format)) {
    const days=value+(date1904?1462:value<60?1:0),time=new Date(Date.UTC(1899,11,30)+Math.round(days*86_400_000));
    const shown=format.replace(/"[^"]*"|\[[^\]]*\]/g,'');
    if(!/[dy]/i.test(shown)&&value<1)return time.toISOString().slice(11,19);
    // A deadline typed as 1/2 is stored with Excel's current year; print only
    // the parts its number format displays (m/d, d-mmm).
    return `${String(time.getUTCMonth()+1).padStart(2,'0')}/${String(time.getUTCDate()).padStart(2,'0')}`+(/y/i.test(shown)?`/${time.getUTCFullYear()}`:'');
  }
  const scaled=format.includes('%')?value*100:value;
  return (Number.isInteger(scaled)&&Math.abs(scaled)<1e15?String(scaled):pyG(scaled))+(format.includes('%')?'%':'');
}
