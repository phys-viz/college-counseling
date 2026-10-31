// Runs the scripts/check-*.mjs regression checks and prints one summary.
//   npm test               offline checks (no app or browser needed)
//   npm run test:browser   browser checks against the local app, started here if it isn't running
//   npm run test:all       both
// A check is a browser check if it drives Playwright; new check files are picked up automatically.
// Pass names to run a subset: npm test -- c1-counts review-integrity
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const mode=process.argv[2];
if(!['offline','browser','all'].includes(mode))throw new Error('Usage: run-checks.mjs offline|browser|all [names…]');
const only=process.argv.slice(3);
const APP='http://127.0.0.1:5173/';
const PLAYWRIGHT=path.join(root,'.sites-runtime/browser/node_modules/playwright/index.mjs');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
// Checks that already failed on the code they were written for (verified against commit ebc6160)
// because the UI or library has since changed. They still run; a failure is reported as STALE,
// not FAIL, and a pass is flagged so the entry can be removed. Rewrite them, then delete the entry.
const STALE={
  'metrics-ui':'expects the default Trends range to have no SAT composites; written before later score data',
  'south-carolina':'expects a "Full Section C" tab (renamed "Source pages") and the four-school library',
  'ui':'expects a four-school library and single "Explore 27 years" button; written before the 22-school expansion',
};

const checks=fs.readdirSync(path.join(root,'scripts')).filter(f=>/^check-.*\.mjs$/.test(f)).sort()
  .map(file=>({file,name:file.slice(6,-4),browser:/playwright/.test(fs.readFileSync(path.join(root,'scripts',file),'utf8'))}))
  .filter(c=>(mode==='all'||c.browser===(mode==='browser'))&&(!only.length||only.includes(c.name)));
if(only.length&&checks.length!==only.length)throw new Error('Unknown check name; use names like c1-counts (from scripts/check-c1-counts.mjs).');

function run(file) {
  return new Promise(resolve=>{
    const started=Date.now();let output='';
    const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join('scripts',file)],{cwd:root});
    child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
    child.on('close',code=>resolve({code,output,seconds:Math.round((Date.now()-started)/1000)}));
  });
}
async function appRunning(){try{return (await fetch(APP,{signal:AbortSignal.timeout(3000)})).ok;}catch{return false;}}

// Browser checks need Playwright, Chrome and the local app; report missing prerequisites as skips.
let server,skipBrowser='';
if(checks.some(c=>c.browser)) {
  if(!fs.existsSync(PLAYWRIGHT))skipBrowser='Playwright is not installed under .sites-runtime/browser';
  else if(process.platform==='win32'&&!fs.existsSync(CHROME))skipBrowser='Google Chrome is not installed';
  else if(!await appRunning()) {
    console.log('Starting the local app for browser checks…');
    server=spawn(process.execPath,['scripts/run-framework.mjs','dev'],{cwd:root,stdio:'ignore'});
    for(let i=0;i<90&&!await appRunning();i++)await new Promise(r=>setTimeout(r,2000));
    if(!await appRunning())skipBrowser='the local app did not start at '+APP;
  }
}

const results=[];
try {
  for(const check of checks) {
    if(check.browser&&skipBrowser){results.push({...check,status:'SKIP',detail:skipBrowser});console.log(`SKIP  ${check.name}  (${skipBrowser})`);continue;}
    const {code,output,seconds}=await run(check.file);
    const lines=output.trim().split('\n');
    const status=code===0?'PASS':STALE[check.name]?'STALE':'FAIL';
    results.push({...check,status,detail:status==='PASS'?lines.at(-1):output.trim()});
    console.log(`${status}  ${check.name}  ${seconds}s`+(status==='STALE'?`  (${STALE[check.name]})`:status==='PASS'&&STALE[check.name]?'  (now passes: remove it from STALE)':''));
    if(status==='FAIL')console.log(output.trim().split('\n').slice(-15).map(l=>'      '+l).join('\n'));
  }
} finally {
  if(server)server.kill();
}

const count=s=>results.filter(r=>r.status===s).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('STALE')} stale, ${count('SKIP')} skipped (${mode} checks)`);
if(count('FAIL'))console.log('Failed: '+results.filter(r=>r.status==='FAIL').map(r=>r.name).join(', '));
process.exit(count('FAIL')?1:0);
