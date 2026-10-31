import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import './register-ts.mjs';
import './write-seed-payloads.mjs';

const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const packed=JSON.parse(fs.readFileSync('data/seed-payloads.json','utf8'));
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE reports(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,school TEXT NOT NULL,year INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(school_id,year))');
sqlite.exec('CREATE TABLE report_versions(version_id INTEGER PRIMARY KEY AUTOINCREMENT,report_id TEXT NOT NULL,replaced_at TEXT NOT NULL,payload TEXT NOT NULL)');
const insert=sqlite.prepare('INSERT INTO reports VALUES(?,?,?,?,?)');
for(const r of seed)insert.run(r.school_id+':'+r.year,r.school_id,r.school,r.year,JSON.stringify(r));
// Exercise the real SQL using SQLite transactions, with D1's async result shape.
function prepared(sql,values=[]){return {sql,values,bind(...args){return prepared(sql,args);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)??null;}};}
globalThis.__reviewIntegrityDB={prepare:prepared,async batch(statements){
 sqlite.exec('BEGIN');
 try{const results=statements.map(({sql,values})=>({success:true,meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}));sqlite.exec('COMMIT');return results;}
 catch(error){sqlite.exec('ROLLBACK');throw new Error('D1_ERROR: '+error.message+': SQLITE_CONSTRAINT');}
}};
const root=new URL('../',import.meta.url);
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={DB:globalThis.__reviewIntegrityDB}',shortCircuit:true};
 if(specifier==='@/data/seed-payloads.json')return {url:'data:text/javascript,'+encodeURIComponent('export default '+JSON.stringify(packed)),shortCircuit:true};
 if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};
 return next(specifier,context);
}});
const {validateReports}=await import('../lib/validate-import.ts');
const {setReviewedMetric}=await import('../lib/review-metrics.ts');
const {savedScoreMetrics}=await import('../lib/saved-scores.ts');
const {savedGenderMetrics}=await import('../lib/saved-gender.ts');
const {deriveExtraMetrics}=await import('../lib/extract-additional.ts');
const {GET,POST}=await import('../app/api/reports/route.ts');
const bentley=seed.find(r=>r.school_id==='bentley-university'&&r.year===2025);
const scoreReport=()=>savedScoreMetrics(structuredClone(bentley));
const send=(records,replacement)=>POST(new Request('https://atlas.example/api/reports',{method:'POST',headers:{Origin:'https://atlas.example','Content-Type':'application/json',...(replacement===undefined?{}:{'X-Replace-Existing':replacement})},body:JSON.stringify(records)}));
const stored=id=>sqlite.prepare('SELECT payload FROM reports WHERE id=?').get(id)?.payload;
const fresh=(id,applicants=12000)=>({...scoreReport(),school_id:id,school:'Review integrity fixture',metrics:{...scoreReport().metrics,applicants}});

try{
 const original=stored('bentley-university:2025'),edited=scoreReport();edited.metrics.applicants=12000;
 for(const permission of [undefined,'false']){assert.equal((await send([edited],permission)).status,409);assert.equal(stored('bentley-university:2025'),original,'Unchecked replacement must preserve the entire record');}
 assert.equal((await send([edited],'yes')).status,400);
 assert.equal((await send([edited],'true')).status,200);assert.equal(JSON.parse(stored('bentley-university:2025')).metrics.applicants,12000);
 const versions=()=>sqlite.prepare('SELECT payload FROM report_versions WHERE report_id=? ORDER BY version_id').all('bentley-university:2025').map(v=>v.payload);
 assert.deepEqual(versions(),[original],'A replacement keeps the exact prior payload in report_versions');
 assert.equal((await send([fresh('mixed-batch-new'),edited])).status,409);assert.equal(versions().length,1,'Refused imports add no history');assert.equal(stored('mixed-batch-new:2025'),undefined,'A conflict rolls back new records in the same batch');
 const concurrent=await Promise.all([send([fresh('concurrent',12100)]),send([fresh('concurrent',12200)])]);
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 const winner=concurrent.findIndex(r=>r.status===200);assert.equal(JSON.parse(stored('concurrent:2025')).metrics.applicants,[12100,12200][winner],'The losing concurrent import cannot replace the winner');
 assert.equal((await send(fresh('single-record'))).status,200,'Single-record JSON remains supported');
 assert.equal((await send([edited],'true')).status,200,'Explicit reviewed replacements remain supported');

 const cleared=scoreReport(),provenance=structuredClone(cleared.sections);
 setReviewedMetric(cleared,'sat_75',null);assert(cleared.omitted_metrics.includes('sat_75'));
 validateReports([cleared]);savedScoreMetrics(cleared);assert.equal(cleared.metrics.sat_75,undefined);
 assert.equal((await send([cleared],'true')).status,200);
 const read=await (await GET(new Request('https://atlas.example/api/reports?id=bentley-university%3A2025'))).json();
 assert.equal(read.metrics.sat_75,undefined,'A saved omission survives API read-time enrichment');assert(read.omitted_metrics.includes('sat_75'));assert.deepEqual(read.sections,provenance);assert.equal(read.sha256,bentley.sha256);
 setReviewedMetric(cleared,'sat_75',1370);assert(!cleared.omitted_metrics?.includes('sat_75'));assert.equal(cleared.metrics.sat_75,1370);validateReports([cleared]);
 setReviewedMetric(cleared,'test_policy',null);assert(cleared.omitted_metrics.includes('test_policy'));setReviewedMetric(cleared,'test_policy','Reviewed policy');assert.equal(cleared.metrics.test_policy,'Reviewed policy');assert(!cleared.omitted_metrics?.includes('test_policy'));
 setReviewedMetric(cleared,'male_admitted',0);assert.equal(cleared.metrics.male_admitted,0,'Zero is a reported answer, not an omission');
 const gender=structuredClone(seed.find(r=>r.school_id==='cornell'&&r.year===2010));setReviewedMetric(gender,'male_applicants',null);deriveExtraMetrics(savedGenderMetrics(gender));assert.equal(gender.metrics.male_applicants,undefined);assert.equal(gender.metrics.male_admit_rate,undefined);

 for(const [key,value] of [['act_25',-1],['act_75',40],['act_50',30.5],['sat_25',9999],['sat_75','not-a-score'],['reading_25',199],['math_75',801]]){const r=scoreReport();r.metrics[key]=value;assert.throws(()=>validateReports([r]),/whole-number score/,key);}
 for(const test of ['sat','reading','math','act']){const r=scoreReport();[r.metrics[test+'_25'],r.metrics[test+'_75']]=[r.metrics[test+'_75'],r.metrics[test+'_25']];assert.throws(()=>validateReports([r]),/ascending order/,test);}
 const partial=scoreReport();delete partial.metrics.sat_50;validateReports([partial]);
 const historic=scoreReport();historic.year=2015;Object.assign(historic.metrics,{sat_25:1800,sat_50:2000,sat_75:2200});validateReports([historic]);historic.year=2025;assert.throws(()=>validateReports([historic]),/between 400 and 1600/);
 const invalid=scoreReport();invalid.metrics.act_75=40;const beforeInvalid=stored('bentley-university:2025');assert.equal((await send([invalid],'true')).status,400);assert.equal(stored('bentley-university:2025'),beforeInvalid);

 const classes=scoreReport();Object.assign(classes.metrics,{class_2_9:10,class_10_19:20,class_50_99:4,class_100_plus:6,class_total:100});deriveExtraMetrics(classes);assert.equal(classes.metrics.class_under_20_rate,30);assert.equal(classes.metrics.class_50_plus_rate,10);
 setReviewedMetric(classes,'class_2_9',null);deriveExtraMetrics(classes);assert.equal(classes.metrics.class_under_20_rate,undefined);assert.equal(classes.evidence.class_under_20_rate,undefined);assert.equal(classes.metrics.class_50_plus_rate,10);
 setReviewedMetric(classes,'class_2_9',15);deriveExtraMetrics(classes);assert.equal(classes.metrics.class_under_20_rate,35);
 classes.metrics.class_total=0;deriveExtraMetrics(classes);assert.equal(classes.metrics.class_under_20_rate,undefined);assert.equal(classes.metrics.class_50_plus_rate,undefined);
 classes.metrics.class_total=100;classes.metrics.class_2_9=101;deriveExtraMetrics(classes);assert.equal(classes.metrics.class_under_20_rate,undefined,'A numerator exceeding the total cannot retain an old percentage');
 const backupResponse=await GET(new Request('https://atlas.example/api/reports?export=all'));assert.equal(backupResponse.status,200);assert.match(backupResponse.headers.get('content-disposition'),/attachment; filename="admissions-library-\d{4}-\d{2}-\d{2}\.json"/);
 const backup=JSON.parse(await backupResponse.text());
 assert.equal(backup.format,'admissions-atlas-backup');assert.equal(backup.reports.length,sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get().n,'The backup includes every stored report');
 for(const r of backup.reports)assert.equal(JSON.stringify(r),stored(r.school_id+':'+r.year),'Backed-up reports match their stored payloads exactly');
 assert.equal(backup.replaced_versions.length,sqlite.prepare('SELECT COUNT(*) AS n FROM report_versions').get().n,'The backup includes every replaced version');
 assert(backup.replaced_versions.length>=2&&backup.replaced_versions.every(v=>v.report_id===v.payload.school_id+':'+v.payload.year));
 console.log('PASS: atomic conflict protection and explicit replacement with prior-version history; full library backup; concurrent and mixed-batch rollback; reviewed omissions survive API enrichment; score type/scale/order validation; stale class percentages cleared; source evidence preserved.');
}finally{sqlite.close();delete globalThis.__reviewIntegrityDB;}
