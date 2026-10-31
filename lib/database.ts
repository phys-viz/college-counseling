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
/** Copies the saved payload for this school/year, if any, into report_versions before a replacement. */
export function keepPriorVersion(r:Report, replacedAt:string) {
  return database().prepare('INSERT INTO report_versions (report_id,replaced_at,payload) SELECT id,?,payload FROM reports WHERE school_id=? AND year=?')
    .bind(replacedAt,r.school_id,r.year);
}
export async function ensureLocalSeed() {
  // Vite replaces import.meta.env.DEV with false in production builds, which drops
  // the seed module and its payloads from the hosted Worker bundle.
  if(import.meta.env?.DEV)await (await import('./dev-seed')).ensureSeed();
}
