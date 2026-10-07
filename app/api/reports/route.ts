import {database,ensureSeed,statement} from '@/lib/database';
import type {Report} from '@/lib/report-types';
import {validateReports} from '@/lib/validate-import';
export async function GET(request:Request) {
  try {
    await ensureSeed(); const u=new URL(request.url); const id=u.searchParams.get('id');
    if(id) {const row=await database().prepare('SELECT payload FROM reports WHERE id=?').bind(id).first<{payload:string}>();return row?Response.json(JSON.parse(row.payload)):Response.json({error:'Report not found'},{status:404});}
    const q=(u.searchParams.get('q')??'').slice(0,200);const school=u.searchParams.get('school');const year=u.searchParams.get('year');
    const offset=Math.max(0,Number(u.searchParams.get('offset'))||0);const limit=100;
    const clauses:string[]=[];const args:(string|number)[]=[];
    const terms=q.match(/[\p{L}\p{N}]+/gu)??[];
    if(terms.length){clauses.push('id IN (SELECT id FROM report_search WHERE report_search MATCH ?)');args.push(terms.map(t=>'"'+t+'"*').join(' AND '));}
    if(school){clauses.push('school_id=?');args.push(school);}if(year){clauses.push('year=?');args.push(Number(year));}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const [result,count,schools,years]=await Promise.all([
      database().prepare('SELECT payload FROM reports'+where+' ORDER BY year DESC,school ASC LIMIT ? OFFSET ?').bind(...args,limit,offset).all<{payload:string}>(),
      database().prepare('SELECT COUNT(*) AS count FROM reports'+where).bind(...args).first<{count:number}>(),
      database().prepare('SELECT DISTINCT school_id,school FROM reports ORDER BY school').all(),
      database().prepare('SELECT DISTINCT year FROM reports ORDER BY year DESC').all(),
    ]);
    return Response.json({reports:result.results.map(row=>{const {sections,...summary}=JSON.parse(row.payload) as Report;return summary;}),total:count?.count??0,schools:schools.results,years:years.results,offset,limit});
  }catch(e){console.error('Report load failed',e);return Response.json({error:'The admissions database is unavailable. Please retry.'},{status:503});}
}
export async function POST(request:Request) {
  if(request.headers.get('origin') && new URL(request.headers.get('origin')!).host!==new URL(request.url).host) return Response.json({error:'Cross-site imports are not allowed'},{status:403});
  try {
    const body=await request.text();if(body.length>5_000_000)return Response.json({error:'Import is too large (maximum 5 MB).'},{status:413});
    let records:Report[];try{records=validateReports(JSON.parse(body));}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid import'},{status:400});}
    await ensureSeed();await database().batch(records.map(r=>statement(r,true)));
    return Response.json({imported:records.length});
  }catch(e){console.error('Import failed',e);return Response.json({error:'Import could not be saved. Please retry.'},{status:503});}
}
