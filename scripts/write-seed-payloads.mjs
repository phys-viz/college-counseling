import fs from 'node:fs';import {gzipSync} from 'node:zlib';
const records=JSON.parse(fs.readFileSync(new URL('../data/reports.json',import.meta.url),'utf8'));
// URL-safe Base64 avoids slash pairs being mistaken for JavaScript comments
// by dependency transforms when Vite embeds this JSON in a module.
const packed=records.map(r=>({id:`${r.school_id}:${r.year}`,gzip:gzipSync(JSON.stringify(r),{level:9}).toString('base64url')}));
const path=new URL('../data/seed-payloads.json',import.meta.url),text=JSON.stringify(packed)+'\n';
if(!fs.existsSync(path)||fs.readFileSync(path,'utf8')!==text)fs.writeFileSync(path,text);
console.log(`Prepared ${records.length} lossless seed payloads (${Math.round(text.length/1024)} KiB)`);
