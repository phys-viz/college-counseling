import {database,ensureSeed} from '@/lib/database';
import {calculateTrendChanges,type TrendResults,type TrendReport} from '@/lib/trend-types';
import type {Report} from '@/lib/report-types';
import {deriveExtraMetrics} from '@/lib/extract-additional';
import {savedGenderMetrics as enrichSavedGender} from '@/lib/saved-gender';

export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const schools=[...new Set(params.getAll('school'))];
  const from=Number(params.get('from')),to=Number(params.get('to'));
  if(!schools.length||schools.length>2||schools.some(s=>!/^[-a-z0-9]{1,80}$/.test(s))||
    !params.has('from')||!params.has('to')||!Number.isInteger(from)||!Number.isInteger(to)||from<1900||to>2100||from>to)
    return Response.json({error:'Choose one or two schools and a valid year range between 1900 and 2100.'},{status:400});
  try {
    await ensureSeed();
    const [result,schoolList]=await Promise.all([
      database().prepare(`SELECT payload FROM reports WHERE school_id IN (${schools.map(()=>'?').join(',')}) AND year BETWEEN ? AND ? ORDER BY year,school`).bind(...schools,Math.max(1900,from-4),to).all<{payload:string}>(),
      database().prepare('SELECT DISTINCT school_id,school FROM reports ORDER BY school').all<{school_id:string;school:string}>(),
    ]);
    const reports:TrendReport[]=result.results.map(row=>{
      const r=deriveExtraMetrics(enrichSavedGender(JSON.parse(row.payload) as Report));
      const metrics:TrendReport['metrics']={};const evidence:TrendReport['evidence']={};
      for(const k of Object.keys(r.metrics)) {
        const value=r.metrics[k];if(typeof value==='number'&&Number.isFinite(value))metrics[k]=value;
        if(r.evidence[k])evidence[k]=r.evidence[k];
      }
      // Compute percentages from the counts before rounding for display; stored rates
      // have already been rounded and can otherwise move a plotted hundredth.
      for(const [key,numerator,denominator] of [['admit_rate','admitted','applicants'],['yield_rate','enrolled','admitted']] as const) {
        const n=metrics[numerator],d=metrics[denominator];
        if(typeof n==='number'&&typeof d==='number') {
          if(d>0){metrics[key]=100*n/d;evidence[key]={section:'C1',page:r.evidence[numerator]?.page??null,method:'calculated'};}
          else delete metrics[key];
        }
      }
      const reporting={cost_year:typeof r.metrics.cost_year==='string'?r.metrics.cost_year:undefined,aid_year:typeof r.metrics.aid_year==='string'?r.metrics.aid_year:undefined,retention_cohort:metrics.retention_cohort,graduation_cohort:metrics.graduation_cohort};
      return {school_id:r.school_id,school:r.school,year:r.year,source_url:r.source_url,index_url:r.index_url,source_type:r.source_type,metrics,evidence,reporting};
    });
    calculateTrendChanges(reports);
    return Response.json({reports:reports.filter(r=>r.year>=from),schools:schoolList.results} satisfies TrendResults);
  } catch(e) {
    console.error('Trend load failed',e);
    return Response.json({error:'The trend data could not load. Please retry.'},{status:503});
  }
}
