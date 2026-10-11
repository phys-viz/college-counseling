import { env } from 'cloudflare:workers';
import seed from '@/data/seed-payloads.json';
import type { Report } from './report-types';
import {decodeSeed} from './seed-payload';
export function database(): D1Database {
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db) throw new Error('Database binding unavailable');
  return db;
}
export function statement(r:Report, mode:'seed'|'insert'|'replace'='seed') {
  const conflict=mode==='replace'?'ON CONFLICT(school_id,year) DO UPDATE SET school=excluded.school,payload=excluded.payload':mode==='seed'?'ON CONFLICT DO NOTHING':'';
  return database().prepare(`INSERT INTO reports (id,school_id,school,year,payload) VALUES (?,?,?,?,?) ${conflict}`)
    .bind(`${r.school_id}:${r.year}`,r.school_id,r.school,r.year,JSON.stringify(r));
}
export async function ensureSeed() {
  // Worker I/O belongs to the request that starts it. A module-level promise
  // can remain pending after that request is canceled and stall later visitors.
  // Check persisted IDs in this request instead, and insert only missing seeds.
  const existing=await database().prepare('SELECT id FROM reports').all<{id:string}>();
  const ids=new Set(existing.results.map(row=>row.id));
  const missing=seed.filter(r=>!ids.has(r.id));
  for(let i=0;i<missing.length;i+=50){
    const statements=[];
    for(const entry of missing.slice(i,i+50))statements.push(statement(await decodeSeed(entry)));
    await database().batch(statements);
  }
}
