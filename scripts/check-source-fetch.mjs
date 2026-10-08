import assert from 'node:assert/strict';
import {sourceURL,fetchPublicSource} from '../lib/public-source.ts';
import {sourceYear} from '../lib/source-types.ts';
for(const url of ['http://localhost/a','http://127.0.0.1/a','http://169.254.169.254/','http://[::1]/','https://school.internal/a','https://school.edu:444/a','https://user:password@school.edu/a','file:///a','javascript:alert(1)'])assert.throws(()=>sourceURL(url));
assert.equal(sourceURL('https://school.edu/a#page=13').href,'https://school.edu/a');
assert.equal(sourceYear('2025-2026'),2025);assert.equal(sourceYear('cds_2010-11.pdf'),2010);assert.equal(sourceYear('No year'),null);
const original=globalThis.fetch;
try {
 let address='93.184.216.34',response=()=>new Response('%PDF-example',{headers:{'content-type':'application/pdf'}}),retrieved=0;
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://cloudflare-dns.com/'))return Response.json({Status:0,Answer:new URL(url).searchParams.get('type')==='A'?[{type:1,data:address}]:[]});
  assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);retrieved++;return response();
 };
 assert.equal((await fetchPublicSource('https://school.edu/report',1000)).type,'application/pdf');
 for(const ip of ['10.0.0.1','192.168.1.1','127.0.0.1','169.254.169.254','100.64.0.1','198.18.0.1']){address=ip;const before=retrieved;await assert.rejects(()=>fetchPublicSource('https://school.edu/report',1000),/public document server/);assert.equal(retrieved,before);}
 address='93.184.216.34';response=()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});
 await assert.rejects(()=>fetchPublicSource('https://school.edu/report',1000),/public HTTP/);
 response=()=>new Response('too large',{headers:{'content-length':'5000'}});await assert.rejects(()=>fetchPublicSource('https://school.edu/report',1000),/too large/);
 response=()=>new Response('0123456789');await assert.rejects(()=>fetchPublicSource('https://school.edu/report',5),/size limit/);
 response=()=>new Response('denied',{status:403});await assert.rejects(()=>fetchPublicSource('https://school.edu/report',1000),/403/);
 console.log('PASS: public source URL/DNS checks, redirects, bounded downloads, no forwarded credentials, cohort-year parsing');
}finally{globalThis.fetch=original;}
