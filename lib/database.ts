import { env } from 'cloudflare:workers';
import seed from '@/data/reports.json';
import type { Report } from './report-types';
export function database(): D1Database {
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db) throw new Error('Database binding unavailable');
  return db;
}
export function statement(r:Report, replace=false) {
  return database().prepare(`INSERT INTO reports (id,school_id,school,year,payload) VALUES (?,?,?,?,?) ${replace?'ON CONFLICT(school_id,year) DO UPDATE SET school=excluded.school,payload=excluded.payload':'ON CONFLICT DO NOTHING'}`)
    .bind(`${r.school_id}:${r.year}`,r.school_id,r.school,r.year,JSON.stringify(r));
}
export async function ensureSeed() {
  // Worker I/O belongs to the request that starts it. A module-level promise
  // can remain pending after that request is canceled and stall later visitors.
  // Check persisted IDs in this request instead, and insert only missing seeds.
  const existing=await database().prepare('SELECT id FROM reports').all<{id:string}>();
  const ids=new Set(existing.results.map(row=>row.id));
  const missing=(seed as unknown as Report[]).filter(r=>!ids.has(`${r.school_id}:${r.year}`));
  for(let i=0;i<missing.length;i+=50)await database().batch(missing.slice(i,i+50).map(r=>statement(r)));
}
