import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import './register-ts.mjs';
import './write-seed-payloads.mjs';
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const packed=JSON.parse(fs.readFileSync('data/seed-payloads.json','utf8'));
const {decodeSeed}=await import('../lib/seed-payload.ts');
for(let i=0;i<seed.length;i++)assert.deepEqual(await decodeSeed(packed[i]),seed[i],'Compressed seed preserves every metric and source field');
const records=new Map(seed.map(r=>[`${r.school_id}:${r.year}`,'counselor-reviewed payload']));
const batches=[];let calls=0,rejectFirst;
globalThis.__loadingTestDB={
 prepare(sql){return{
  async all(){assert.equal(sql,'SELECT id FROM reports');if(++calls===1)return new Promise((_,reject)=>{rejectFirst=reject;});return {results:[...records.keys()].map(id=>({id}))};},
  bind(...values){assert.match(sql,/ON CONFLICT DO NOTHING/);return {values};}
 };},
 async batch(statements){batches.push(statements.length);for(const {values} of statements)if(!records.has(values[0]))records.set(values[0],values[4]);}
};
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={DB:globalThis.__loadingTestDB}',shortCircuit:true};
 if(specifier==='@/data/seed-payloads.json')return {url:'data:text/javascript,'+encodeURIComponent('export default '+JSON.stringify(packed)),shortCircuit:true};
 return next(specifier,context);
}});
const {ensureSeed}=await import('../lib/dev-seed.ts');
const interrupted=ensureSeed();interrupted.catch(()=>{});
try{
 await Promise.race([ensureSeed(),new Promise((_,reject)=>setTimeout(()=>reject(Error('A later request waited on canceled request I/O')),100))]);
 assert.equal(batches.length,0,'An already populated database performs no seed writes');
}finally{rejectFirst(Error('Initiating request canceled'));}
await assert.rejects(interrupted,/canceled/);
records.clear();records.set(`${seed[0].school_id}:${seed[0].year}`,'counselor-reviewed payload');
await ensureSeed();assert.equal(records.size,seed.length);assert(batches.every(n=>n<=50));assert.equal(records.get(`${seed[0].school_id}:${seed[0].year}`),'counselor-reviewed payload');
await ensureSeed();assert.equal(batches.length,Math.ceil((seed.length-1)/50));
const {fetchJSON}=await import('../lib/fetch-json.ts');
const actualFetch=globalThis.fetch;
globalThis.fetch=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
try{
 await assert.rejects(fetchJSON('https://example.edu/api/reports',undefined,20),/too long to respond/);
 const cancellation=new AbortController();const pending=fetchJSON('https://example.edu/api/reports',cancellation.signal);cancellation.abort();await assert.rejects(pending,e=>e.name==='AbortError');
 globalThis.fetch=async()=>Response.json({reports:[]});assert.deepEqual(await fetchJSON('https://example.edu/api/reports'),{reports:[]});
 globalThis.fetch=async()=>Response.json({error:'Database unavailable'},{status:503});await assert.rejects(fetchJSON('https://example.edu/api/reports'),/Database unavailable/);
}finally{globalThis.fetch=actualFetch;delete globalThis.__loadingTestDB;}
console.log('PASS: canceled initialization cannot block another request; missing seeds batch safely without replacing counselor data; stalled reads time out and subsequent reads recover.');
