// Some publisher PDFs omit a valid ToUnicode map and expose the original
// Windows ANSI glyph indices (printable ASCII minus 29). Recognize independent
// CDS labels before repairing a font; never shift ordinary selectable text.
export function repairCDSGlyphs<T extends {str:string;fontName:string}>(items:T[]):T[] {
  if(!items.some(i=>i.str.includes("&RPPRQ\u0003'DWD\u00036HW")))return items;
  const fonts=new Set(items.filter(i=>i.str.includes("&RPPRQ\u0003'DWD\u00036HW")||/^(?:&RPPRQ\u0003'DWD\u00036HW|7RWDO\u0003|\)LUVW\u0003|&[\u0014-\u001f])/.test(i.str)).map(i=>i.fontName));
  return items.map(i=>fonts.has(i.fontName)?{...i,str:[...i.str].map(c=>{
    const n=c.charCodeAt(0);return n>=3&&n<=97&&n!==32?String.fromCharCode(n+29):c;
  }).join('')}:i);
}

