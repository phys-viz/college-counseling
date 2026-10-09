// Ordinary browser requests for official public files; no challenge solving.
import fs from 'node:fs';
import {chromium} from '../.sites-runtime/browser/node_modules/playwright/index.mjs';
const docs=JSON.parse(fs.readFileSync('data/new-archive-sources.json','utf8')).filter(d=>d.school_id==='villanova-university');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext();
 for(const d of docs){const response=await context.request.get(d.url);if(!response.ok())throw Error(`Official PDF returned ${response.status()}`);const bytes=await response.body();if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Not a PDF');fs.writeFileSync(`.sites-runtime/new-archives/${d.school_id}-${d.year}.pdf`,bytes);console.log('Downloaded official Villanova',d.year);}
}finally{await browser.close();}
