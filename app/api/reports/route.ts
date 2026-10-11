import {database,ensureSeed,statement} from '@/lib/database';
import type {Report} from '@/lib/report-types';
import {validateReports} from '@/lib/validate-import';
import {savedGenderMetrics as enrichSavedGender} from '@/lib/saved-gender';
import {savedScoreMetrics} from '@/lib/saved-scores';
import {deriveExtraMetrics} from '@/lib/extract-additional';
export async function GET(request:Request) {
  try {
    await ensureSeed(); const u=new URL(request.url); const id=u.searchParams.get('id');
    if(id) {const row=await database().prepare('SELECT payload FROM reports WHERE id=?').bind(id).first<{payload:string}>();return row?Response.json(deriveExtraMetrics(savedScoreMetrics(enrichSavedGender(JSON.parse(row.payload))))):Response.json({error:'Report not found'},{status:404});}
    const q=(u.searchParams.get('q')??'').slice(0,200);const school=u.searchParams.get('school');const year=u.searchParams.get('year');
    const offset=Math.max(0,Number(u.searchParams.get('offset'))||0);const limit=100;
    const clauses:string[]=[];const args:(string|number)[]=[];
    const terms=q.match(/[\p{L}\p{N}]+/gu)??[];
    if(terms.length){clauses.push('id IN (SELECT id FROM report_search WHERE report_search MATCH ?)');args.push(terms.map(t=>'"'+t+'"*').join(' AND '));}
    if(school){clauses.push('school_id=?');args.push(school);}if(year){clauses.push('year=?');args.push(Number(year));}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const schoolView=u.searchParams.get('view')==='schools';
    const query=schoolView
      ? 'SELECT payload,matching_years FROM (SELECT payload,school,year,COUNT(*) OVER(PARTITION BY school_id) AS matching_years,ROW_NUMBER() OVER(PARTITION BY school_id ORDER BY year DESC) AS rank FROM reports'+where+') WHERE rank=1 ORDER BY school ASC LIMIT ? OFFSET ?'
      : 'SELECT payload FROM reports'+where+' ORDER BY year DESC,school ASC LIMIT ? OFFSET ?';
    const [result,count,schools,years]=await Promise.all([
      database().prepare(query).bind(...args,limit,offset).all<{payload:string;matching_years?:number}>(),
      database().prepare('SELECT COUNT(*) AS report_count,COUNT(DISTINCT school_id) AS school_count FROM reports'+where).bind(...args).first<{report_count:number;school_count:number}>(),
      database().prepare('SELECT school_id,school,MIN(year) AS first_year,MAX(year) AS last_year FROM reports GROUP BY school_id,school ORDER BY school').all(),
      (school?database().prepare('SELECT DISTINCT year FROM reports WHERE school_id=? ORDER BY year DESC').bind(school):database().prepare('SELECT DISTINCT year FROM reports ORDER BY year DESC')).all(),
    ]);
    return Response.json({reports:result.results.map(row=>{const {sections,additional_sections,...summary}=deriveExtraMetrics(savedScoreMetrics(enrichSavedGender(JSON.parse(row.payload) as Report)));return {...summary,available_years:row.matching_years};}),total:schoolView?count?.school_count??0:count?.report_count??0,report_count:count?.report_count??0,schools:schools.results,years:years.results,offset,limit});
  }catch(e){console.error('Report load failed',e);return Response.json({error:'The admissions database is unavailable. Please retry.'},{status:503});}
}
export async function POST(request:Request) {
  if(request.headers.get('origin') && new URL(request.headers.get('origin')!).host!==new URL(request.url).host) return Response.json({error:'Cross-site imports are not allowed'},{status:403});
  try {
    const replacement=request.headers.get('X-Replace-Existing');
    if(replacement!==null&&!['true','false'].includes(replacement))return Response.json({error:'The replacement flag must be true or false.'},{status:400});
    const body=await request.text();if(body.length>5_000_000)return Response.json({error:'Import is too large (maximum 5 MB).'},{status:413});
    let records:Report[];try{records=validateReports(JSON.parse(body));}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid import'},{status:400});}
    // Strict inserts make a concurrent school/year conflict fail atomically.
    // D1 rolls back the entire batch, retaining every previously saved record.
    await ensureSeed();await database().batch(records.map(r=>statement(r,replacement==='true'?'replace':'insert')));
    return Response.json({imported:records.length});
  }catch(e){
    if(e instanceof Error&&/UNIQUE constraint failed:\s*reports\.(?:id|school_id|year)/i.test(e.message))return Response.json({error:'A report for this school and fall year already exists. Check “Replace existing reports” only if you intend to replace it.',code:'report_exists'},{status:409});
    console.error('Import failed',e);return Response.json({error:'Import could not be saved. Please retry.'},{status:503});
  }
}
