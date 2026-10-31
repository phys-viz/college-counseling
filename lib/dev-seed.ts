import seed from '@/data/seed-payloads.json';
import {database,statement} from './database';
import {decodeSeed} from './seed-payload';
// Local development only: a fresh local D1 fills itself from data/reports.json.
// Production records live only in the hosted D1; this module is excluded from its build.
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
