import {database} from './database';
const PAGE=25;
// Streams every stored report and replaced version exactly as saved (no enrichment), a page at a time,
// so the Worker never holds the whole library in memory. Pages are read in key order, not as one snapshot;
// a save made during the download may or may not be included.
export function libraryBackup(appVersion:string):Response {
  const exportedAt=new Date().toISOString();
  async function* parts() {
    yield `{"format":"admissions-atlas-backup","format_version":1,"app_version":${JSON.stringify(appVersion)},"exported_at":"${exportedAt}","reports":[`;
    let after='',first=true;
    for(;;) {
      const {results}=await database().prepare('SELECT id,payload FROM reports WHERE id>? ORDER BY id LIMIT ?').bind(after,PAGE).all<{id:string;payload:string}>();
      for(const row of results){yield (first?'':',')+row.payload;first=false;}
      if(results.length<PAGE)break;after=results[results.length-1].id;
    }
    yield '],"replaced_versions":[';
    let afterVersion=0;first=true;
    for(;;) {
      const {results}=await database().prepare('SELECT version_id,report_id,replaced_at,payload FROM report_versions WHERE version_id>? ORDER BY version_id LIMIT ?').bind(afterVersion,PAGE).all<{version_id:number;report_id:string;replaced_at:string;payload:string}>();
      for(const v of results){yield (first?'':',')+`{"version_id":${v.version_id},"report_id":${JSON.stringify(v.report_id)},"replaced_at":${JSON.stringify(v.replaced_at)},"payload":${v.payload}}`;first=false;}
      if(results.length<PAGE)break;afterVersion=results[results.length-1].version_id;
    }
    yield ']}\n';
  }
  const iterator=parts(),encoder=new TextEncoder();
  const body=new ReadableStream<Uint8Array>({
    async pull(controller){try{const {value,done}=await iterator.next();if(done)controller.close();else controller.enqueue(encoder.encode(value));}catch(e){console.error('Library backup failed',e);controller.error(e);}},
    async cancel(){await iterator.return(undefined);},
  });
  return new Response(body,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="admissions-library-${exportedAt.slice(0,10)}.json"`,'Cache-Control':'no-store'}});
}
