// Some publisher PDFs omit a valid ToUnicode map and expose the original
// Windows ANSI glyph indices (printable ASCII minus 29): "C1." reads "&\u0014\u0011".
// Decide per font across the whole document, because a page can use a broken
// font without repeating the encoded title. A broken font prints control codes
// (shifted spaces, digits and punctuation) and never a lowercase b-z, since those
// letters shift into the uppercase range. Ordinary selectable text never qualifies.
const glyphControl=/[\u0003-\u0008\u000b\u000c\u000e-\u001f]/;
export function shiftedGlyphFonts(items:{str:string;fontName:string}[]):Set<string> {
  const fonts=new Map<string,{control:boolean;lower:boolean;ascii:number;chars:number}>();
  for(const i of items) {
    const f=fonts.get(i.fontName)??{control:false,lower:false,ascii:0,chars:0};fonts.set(i.fontName,f);
    if(glyphControl.test(i.str))f.control=true;if(/[b-z]/.test(i.str))f.lower=true;
    for(const c of i.str){f.chars++;if(c.charCodeAt(0)>=3&&c.charCodeAt(0)<=97)f.ascii++;}
  }
  // Mostly non-ASCII fonts use another unmapped encoding; shifting would not repair them.
  return new Set([...fonts].filter(([,f])=>f.control&&!f.lower&&f.ascii*2>=f.chars).map(([name])=>name));
}
export function repairCDSGlyphs<T extends {str:string;fontName:string}>(items:T[],fonts=shiftedGlyphFonts(items)):T[] {
  return items.map(i=>fonts.has(i.fontName)?{...i,str:[...i.str].map(c=>{
    const n=c.charCodeAt(0);return n>=3&&n<=97&&n!==32?String.fromCharCode(n+29):c;
  }).join('')}:i);
}
