import fs from 'node:fs';
import './register-ts.mjs';
const {normalizePDF}=await import('../lib/extract-pdf.ts');
const docs=JSON.parse(fs.readFileSync('data/new-archive-sources.json','utf8'));
for(const d of docs){const pages=JSON.parse(fs.readFileSync(`.sites-runtime/new-archives/${d.school_id}-${d.year}-pages.json`,'utf8'));
 try{const r=normalizePDF(pages,{url:d.url,title:d.title,year:d.year},d.index_url,d.sha256);fs.writeFileSync(`.sites-runtime/new-archives/${d.school_id}-${d.year}-draft.json`,JSON.stringify(r,null,2));console.log(d.school_id,d.year,'detected',r.year,JSON.stringify(Object.fromEntries(Object.entries(r.metrics).filter(([k])=>/^(applicants|admitted|enrolled|male_|female_|sat_25|sat_75|act_25|act_75)/.test(k)))),r.factors.length,JSON.stringify(r.warnings.filter(w=>/disagree|headline/.test(w))));}
 catch(e){console.log('FAILED',d.school_id,d.year,e.message);}
}
