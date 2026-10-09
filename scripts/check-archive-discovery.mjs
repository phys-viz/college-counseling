import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {discoverSources}=await import('../lib/discover-sources.ts');
const original=globalThis.fetch;
try {
 for(const [school,url,start,count] of [['clemson','https://open.clemson.edu/cds/',2008,18],['washington-and-lee-university','https://www.wlu.edu/accreditation-and-institutional-research/common-data-set',2005,21]]){
  const html=fs.readFileSync(`scripts/fixtures/${school}-archive.html`,'utf8');
  globalThis.fetch=async value=>String(value).startsWith('https://cloudflare-dns.com/')?Response.json({Status:0,Answer:new URL(value).searchParams.get('type')==='A'?[{type:1,data:'93.184.216.34'}]:[]}):new Response(html,{headers:{'content-type':'text/html'}});
  const result=await discoverSources(url);
  assert.equal(result.documents.length,count,school);
  assert.deepEqual(result.documents.map(r=>r.year).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>start+i));
  for(const doc of result.documents){
   assert.equal(new URL(doc.url).origin,new URL(url).origin);
   if(school==='washington-and-lee-university')assert(new URL(doc.url).pathname.startsWith('/Business%20Units%20and%20Administrative%20Offices/'),'Relative PDF links must resolve using the archive base element');
   else assert.equal(new URL(doc.url).searchParams.get('article'),String(1000+doc.year-2008),'Accessible labels identify the report year, independently of publication dates');
  }
 }
 console.log('PASS: official archive fixtures discover all 18 Clemson and 21 W&L years with correct source URLs');
}finally{globalThis.fetch=original;}
