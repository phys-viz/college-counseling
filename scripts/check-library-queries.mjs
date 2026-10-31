import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import './register-ts.mjs';

// Applies the real migrations to an in-memory SQLite holding the seed reports, then checks that
// the paged library queries return exactly what the original whole-table queries returned, and
// that search matches report content rather than JSON keys, URLs or evidence fields.
const seed=JSON.parse(fs.readFileSync('data/reports.json','utf8'));
const sqlite=new DatabaseSync(':memory:');
const migrate=file=>{for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.replace(/--.*$/gm,'').trim())sqlite.exec(sql);};
migrate('0000_quick_thundra.sql');migrate('0001_full_text_search.sql');
const insert=sqlite.prepare('INSERT INTO reports VALUES(?,?,?,?,?)');
for(const r of seed)insert.run(r.school_id+':'+r.year,r.school_id,r.school,r.year,JSON.stringify(r));
const match=q=>q.match(/[\p{L}\p{N}]+/gu).map(t=>'"'+t+'"*').join(' AND ');
const searchIds=q=>new Set(sqlite.prepare('SELECT id FROM report_search WHERE report_search MATCH ?').all(match(q)).map(r=>r.id));
const before=Object.fromEntries(['metrics','yield','pdf','calculated','clemson','early decision','alumni'].map(q=>[q,searchIds(q)]));
migrate('0002_report_versions.sql');migrate('0003_search_report_text.sql');

globalThis.__libraryQueryDB={prepare(sql,values=[]){return {bind(...args){return globalThis.__libraryQueryDB.prepare(sql,args);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)??null;}};}};
const root=new URL('../',import.meta.url);
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={DB:globalThis.__libraryQueryDB}',shortCircuit:true};
 if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};
 return next(specifier,context);
}});
const {GET}=await import('../app/api/reports/route.ts');
const list=async params=>(await (await GET(new Request('https://atlas.example/api/reports?'+new URLSearchParams(params)))).json());

// The original queries, which read every payload, are the reference for the paged ones.
const reference=(params)=>{
 const clauses=[],args=[];const q=params.q??'';
 if(q.match(/[\p{L}\p{N}]+/gu)){clauses.push('id IN (SELECT id FROM report_search WHERE report_search MATCH ?)');args.push(match(q));}
 if(params.school){clauses.push('school_id=?');args.push(params.school);}if(params.year){clauses.push('year=?');args.push(Number(params.year));}
 const where=clauses.length?' WHERE '+clauses.join(' AND '):'';const offset=Number(params.offset??0);
 return params.view==='schools'
  ? sqlite.prepare('SELECT payload,matching_years FROM (SELECT payload,school,year,COUNT(*) OVER(PARTITION BY school_id) AS matching_years,ROW_NUMBER() OVER(PARTITION BY school_id ORDER BY year DESC) AS rank FROM reports'+where+') WHERE rank=1 ORDER BY school ASC LIMIT ? OFFSET ?').all(...args,100,offset).map(r=>JSON.parse(r.payload).school_id+':'+JSON.parse(r.payload).year+'/'+r.matching_years)
  : sqlite.prepare('SELECT payload FROM reports'+where+' ORDER BY year DESC,school ASC LIMIT ? OFFSET ?').all(...args,100,offset).map(r=>JSON.parse(r.payload).school_id+':'+JSON.parse(r.payload).year);
};
for(const params of [{view:'schools'},{},{offset:'100'},{offset:'500'},{year:'2020'},{school:'clemson'},{view:'schools',year:'2015'},{view:'schools',school:'cornell-university'},{q:'clemson'},{view:'schools',q:'legacy'},{q:'early decision',offset:'100'}]) {
 const page=await list(params);
 const got=page.reports.map(r=>r.school_id+':'+r.year+(params.view==='schools'?'/'+r.available_years:''));
 assert.deepEqual(got,reference(params),'Paged query matches the original for '+JSON.stringify(params));
}

// Search now ignores JSON structure and matches report content.
const after=q=>searchIds(q);
// Words that occur only in the stored JSON (metric keys, evidence methods, source types) matched every
// report before; words in the CDS text itself (e.g. "applicants", printed URLs) still match legitimately.
for(const q of ['metrics','yield'])assert(before[q].size===seed.length&&after(q).size===0,'JSON-only word no longer matches: '+q);
for(const q of ['pdf','calculated'])assert(before[q].size>=seed.length-1&&after(q).size<seed.length/10,'Evidence/source-type word now matches only reports whose text uses it: '+q);
assert.deepEqual(after('clemson'),new Set(seed.filter(r=>/clemson/i.test(r.school)).map(r=>r.school_id+':'+r.year)),'A school name finds exactly that school');
assert(after('early decision').size>0&&after('alumni').size>0,'Report text and factor labels remain searchable');
for(const r of seed.slice(0,40)){const label=r.factors[0]?.label;if(label)assert(after(label).has(r.school_id+':'+r.year),'Factor labels are indexed: '+label);}

// Triggers keep the index current on insert, replacement and delete.
const sample=structuredClone(seed[0]);sample.school_id='search-trigger';sample.school='Zyzzyva College';
insert.run('search-trigger:'+sample.year,'search-trigger',sample.school,sample.year,JSON.stringify(sample));
assert.equal(after('zyzzyva').size,1);
sample.sections=[{...sample.sections[0],text:'Quokka admissions statement'}];
sqlite.prepare('UPDATE reports SET payload=? WHERE id=?').run(JSON.stringify(sample),'search-trigger:'+sample.year);
assert.equal(after('quokka').size,1);
sqlite.prepare('DELETE FROM reports WHERE id=?').run('search-trigger:'+sample.year);
assert.equal(after('zyzzyva').size+after('quokka').size,0);
console.log(`PASS: paged library queries match the original results; search covers school, report text, form answers and factors, not JSON keys or evidence fields ("metrics": ${before.metrics.size}→${after('metrics').size} reports, "pdf": ${before.pdf.size}→${after('pdf').size})`);
