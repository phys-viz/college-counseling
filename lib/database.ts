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
let seeding: Promise<void> | undefined;
export async function ensureSeed() {
  if(!seeding) seeding=(async()=>{ await database().batch((seed as unknown as Report[]).map(r=>statement(r))); })().catch(e=>{seeding=undefined;throw e});
  await seeding;
}
