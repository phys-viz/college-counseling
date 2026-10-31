import { env } from 'cloudflare:workers';
import type { Report } from './report-types';
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
export async function ensureLocalSeed() {
  // Vite replaces import.meta.env.DEV with false in production builds, which drops
  // the seed module and its payloads from the hosted Worker bundle.
  if(import.meta.env?.DEV)await (await import('./dev-seed')).ensureSeed();
}
