import type {Report} from './report-types';
import type {PDFPage,PDFLine} from './extract-pdf';
import {classBands,courseSubjects,extraMetrics,gpaBands,metricUnit,scoreBands} from './metric-definitions';

const clean=(s:string)=>s.normalize('NFKC').replace(/[\u00ad\u2010-\u2015\u2212]/g,'-').replace(/\s+/g,' ').trim();
const numeric=(v:string|undefined)=>{const s=(v??'').trim().replace(/[, $%]/g,'');return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)?Number(s):null;};
type Line=PDFLine&{page:number};
export function enrichMetrics(r:Report,pages:PDFPage[]):Report {
 const lines:Line[]=pages.flatMap(p=>p.lines.map(l=>({...l,text:clean(l.text),page:p.page})));
 const fields=new Map<string,{value:string;page:number}>();
 for(const p of pages)for(const f of p.form_fields)if(!fields.has(f.name)&&f.value.trim())fields.set(f.name,{value:f.value,page:p.page});
 const used=new Set<number>();
 const put=(key:string,value:number|string|null,page:number|null,method='PDF text',section=extraMetrics[key]?.section??'C9')=>{
  if(value===null||r.metrics[key]!==undefined)return;
  if(typeof value==='number'){
   const unit=metricUnit(key);if(!Number.isFinite(value)||value<0||unit==='percent'&&value>100||unit==='gpa'&&(value<.5||value>6))return;
   if(unit==='number'&&!Number.isInteger(value))return;
  }
  r.metrics[key]=value;r.evidence[key]={section,page,method};if(page!==null)used.add(page);
 };
 const field=(key:string,names:string[],section?:string)=>{for(const name of names){const f=fields.get(name);if(f&&numeric(f.value)!==null){put(key,numeric(f.value),f.page,'PDF form field '+name,section);return;}}};
 const block=(letter:string,n:number):Line[]=>{
  const marker=new RegExp(`^(?:CDS\\s+)?${letter}\\s*[-.]?\\s*${n}(?:[.\\s]|$)`,'i');
  const start=lines.findIndex(l=>marker.test(l.text));if(start<0)return [];
  const end=lines.findIndex((l,i)=>{const m=l.text.match(/^(?:CDS\s+)?([A-J])\s*[-.]?\s*(\d+)(?:[.\s]|$)/i);if(i<=start||!m||Number(m[2])<1||Number(m[2])>30)return false;
   // A letter followed by several numeric cells is a data row, not a CDS question.
   if(/^[A-J]\s+(?:\$?[\d,.]+%?\s+){1,}\$?[\d,.]+%?\s*$/i.test(l.text))return false;
   return m[1]!==letter||Number(m[2])!==n;});
  return lines.slice(start,end<0?undefined:end);
 };
 const matchValue=(key:string,section:string,rows:Line[],pattern:RegExp,kind:'number'|'text'='number')=>{
  for(let i=0;i<rows.length;i++){
   const row=rows[i],match=row.text.match(pattern);if(!match)continue;
   let suffix=row.text.slice((match.index??0)+match[0].length).trim().replace(/^[:% ]+/,'');
   if(!suffix&&rows[i+1]?.page===row.page&&/^[\d.,$%]+$/.test(rows[i+1].text))suffix=rows[i+1].text;
   if(kind==='text'){if(suffix)put(key,suffix,row.page,'PDF text',section);}else if(/^[\d.,$%]+$/.test(suffix))put(key,numeric(suffix),row.page,'PDF text',section);
  }
 };
 field('gpa_average',['FRSH_GPA','FRSH_HS_GPA_AVG_N']);field('gpa_submitted',['FRSH_GPA_SUBMIT_P']);
 for(const [i,[id]] of gpaBands.entries())for(const [pop,prefix] of [['scores','FRSH_GPA_SUBMIT_'],['no_scores','FRSH_GPA_NO_SUB_'],['all','EN_FRSH_GPA_']] as const)field(`gpa_${id}_${pop}`,[prefix+(i+1)+'_P']);
 const c11=block('C',11),c12=block('C',12);
 matchValue('gpa_average','C12',c12,/Average High School GPA\b(?: of.*?submitted GPA)?\s*:?\s*/i);
 matchValue('gpa_submitted','C12',c12,/(?:Percent Submitting GPA|submitted high school GPA\s*:)/i);
 for(let i=0;i<c12.length;i++){
  if(!/Average high school GPA/i.test(c12[i].text))continue;
  const text=c12.slice(i,i+3).filter(l=>l.page===c12[i].page).map(l=>l.text.replace(/^C12[.\s]+/i,'')).join(' ');
  const m=text.match(/Average high school GPA of[^:]*submitted GPA\s*:\s*(\d+(?:\.\d+)?)(?:\s|$)/i);
  if(m)put('gpa_average',Number(m[1]),c12[i].page,'PDF wrapped GPA answer','C12');
 }
 const gpaHeader=c11.find(l=>l.words.filter(w=>/^Percent$/i.test(w.str.trim())).length===3);
 const gpaXs=gpaHeader?.words.filter(w=>/^Percent$/i.test(w.str.trim())).map(w=>w.x+w.width/2);
 for(const [id,label] of gpaBands){
  const parts=label.split('–');const pattern=id==='4_0'?/Percent who had GPA of 4\.0\s*/i:id==='below_1'?/Percent who had GPA below 1\.0\s*/i:new RegExp(`Percent who had GPA between ${Number(parts[0]).toFixed(2).replace(/0$/,'0?').replace('.','\\.')} and ${parts[1].replace('.','\\.')}\\s*`,'i');
  for(const row of c11){const m=row.text.match(pattern);if(!m)continue;const suffix=row.text.slice((m.index??0)+m[0].length).trim();if(!/^[\d.%\s]+$/.test(suffix))continue;
   const values=suffix.split(/\s+/).map(numeric).filter((v):v is number=>v!==null);if(!values.length)continue;
   if(gpaXs){const cells=row.words.filter(w=>numeric(w.str)!==null&&w.x>gpaXs[0]-35);for(const w of cells){const col=gpaXs.reduce((best,x,j)=>Math.abs(w.x+w.width/2-x)<Math.abs(w.x+w.width/2-gpaXs[best])?j:best,0);put(`gpa_${id}_${['scores','no_scores','all'][col]}`,numeric(w.str),row.page);}}
   else if(values.length===1)put(`gpa_${id}_all`,values[0],row.page);
  }
 }
 if(Object.keys(r.metrics).some(k=>k.startsWith('gpa_')&&k!=='gpa_submitted'))put('gpa_basis','Source-reported GPA; schools may use different weighting. Distribution percentages cover GPA reporters in the labeled group.',c11[0]?.page??c12[0]?.page??null);
 for(const [test,prefix] of [['sat','SAT1_COMP'],['reading','SAT1_VERB'],['math','SAT1_MATH'],['act','ACT_COMP']] as const)for(const pct of [25,50,75])field(`${test}_${pct}`,[`${prefix}_${pct}TH_P`],'C9');
 for(const [test,prefix] of [['sat','SAT1_COMP'],['reading','SAT1_VERB'],['math','SAT1_MATH']] as const)for(const [id] of scoreBands[test])field(`${test}_band_${id}`,[`${prefix}_${id.split('_')[0]}_P`]);
 for(const [i,[id]] of scoreBands.act.entries())field(`act_band_${id}`,[`ACT_${6-i}_P`]);
 // Text distributions: identify the header's population; never turn score boundaries into percentages.
 // A row with fewer values than the table's fullest row has blank cells whose
 // column cannot be known from text, so it stays unreported rather than shifting.
 let distribution:string[]=[],dualComposite=false,table=0;
 const setDistribution=(tests:string[])=>{if(tests.join()!==distribution.join())table++;distribution=tests;};
 const bandRows:{table:number,tests:string[],id:string,vals:number[],page:number}[]=[];
 const scoreRows=block('C',9);
 for(const [i,row] of scoreRows.entries()){
  const t=row.text.replace(/^C9\s+/,''); // some reports prefix every C9 row with its item number
  const header=scoreRows.slice(Math.max(0,i-2),i+1).filter(l=>l.page===row.page).map(l=>l.text).join(' ');
  if(!/%/.test(header)&&/SAT Evidence[- ]\s*(?:Score Range\s+)?Based Reading.*SAT Math.*and Writing/i.test(header))setDistribution(['reading','math']);
  if(/SAT ACT Score Range Score Range Composite Composite$/i.test(header)){dualComposite=true;setDistribution([]);}
  if(/^Score Range ACT English\b|^Total\s+100%\s+Total\s+100%/i.test(t)){dualComposite=false;setDistribution([]);}
  if(dualComposite){
   const pair=t.match(/^(\d{3,4}\s*-\s*\d{3,4})\s+(\d+(?:\.\d+)?)%\s+(\d{1,2}\s*-\s*\d{1,2}|Below 6)\s+(\d+(?:\.\d+)?)%$/i);
   if(pair){for(const [test,range,value]of [['sat',pair[1],pair[2]],['act',pair[3],pair[4]]] as const){const id=/^Below/i.test(range)?'below_6':range.replace(/\s/g,'').replace('-','_');if(scoreBands[test].some(b=>b[0]===id))put(`${test}_band_${id}`,Number(value),row.page,'PDF paired SAT/ACT Composite columns','C9');}continue;}
  }
  if(/^Score Range\s+SAT Composite$|^SAT Composite$/i.test(t))setDistribution(['sat']);
  else if(/^(?:SAT Evidence-Based|SAT Critical Reading|Based Reading).*SAT Math/i.test(t)||/^SAT .*Writing SAT Math$/i.test(t))setDistribution(['reading','math']);
  else if(/^(?:Score Range\s+)?ACT Composite(?:\s+ACT English|\s+ACT Math|$)/i.test(t))setDistribution(['act']);
  const m=t.match(/^(\d{1,4}\s*-\s*\d{1,4}|Below 6)\s+(.+)$/i);if(!m||!distribution.length)continue;
  const id=m[1].toLowerCase()==='below 6'?'below_6':m[1].replace(/\s/g,'').replace('-','_');
  const vals=m[2].split(/\s+/).map(numeric);if(vals.some(v=>v===null))continue;
  // Rows of an unrecognized following table (e.g. ACT ranges under SAT columns) are not this table's rows.
  if(distribution.some(test=>scoreBands[test as keyof typeof scoreBands].some(b=>b[0]===id)))bandRows.push({table,tests:distribution,id,vals:vals as number[],page:row.page});
 }
 for(const band of bandRows){
  if(band.vals.length<Math.max(...bandRows.filter(b=>b.table===band.table).map(b=>b.vals.length)))continue;
  for(const [j,test] of band.tests.entries())if(scoreBands[test as keyof typeof scoreBands].some(b=>b[0]===band.id)&&band.vals[j]!==undefined)put(`${test}_band_${band.id}`,band.vals[j],band.page);
 }
 const rankRows=block('C',10);
 for(const [i,row]of rankRows.entries()){
  const text=rankRows.slice(i,i+3).filter(l=>l.page===row.page).map(l=>l.text).join(' ');
  const rank=text.match(/^Percent of total first-time, first-year students who submitted high school\s+(\d+(?:\.\d+)?)%\s+class rank$/i);
  if(rank)put('rank_submitted',Number(rank[1]),row.page,'PDF wrapped class-rank reporting percentage','C10');
 }
 for(const [region,prefix] of [['in_state','STATE'],['out_state','NRES'],['international','INTL']] as const)for(const [kind,name] of [['applicants','AP_RECD'],['admitted','AP_ADMT'],['enrolled','EN_TOT']] as const)field(`${region}_${kind}`,[`${name}_${prefix}_1ST_N`]);
 // Residency text tables use the printed header order; gender tables are excluded.
 const c1=block('C',1);let residency:Line|undefined;
 for(const row of c1){if(/in-state/i.test(row.text)&&/out[- ]of[- ]state/i.test(row.text)&&/international/i.test(row.text))residency=row;
  if(!residency||!/^Total.*(?:applied|admitted|enrolled)/i.test(row.text)||/\b(men|women|males?|females?|gender|sex)\b/i.test(row.text))continue;
  const m=row.text.match(/\b(applied|admitted|enrolled)\s+([\d,\s]+)$/i);if(!m)continue;const values=m[2].trim().split(/\s+/).map(numeric);const expected=3+(/unknown/i.test(residency.text)?1:0)+(/\btotal\b/i.test(residency.text)?1:0);if(values.length!==expected||values.some(v=>v===null))continue;
  const hasTotal=/\btotal\b/i.test(residency.text),first=/\btotal\b.*in-state/i.test(residency.text);const parts=hasTotal?(first?values.slice(1):values.slice(0,-1)):values;
  if(hasTotal&&parts.reduce<number>((a,v)=>a+(v??0),0)!==(first?values[0]:values.at(-1)))continue;
  const kind=m[1].toLowerCase()==='applied'?'applicants':m[1].toLowerCase();for(const [j,region] of ['in_state','out_state','international'].entries())put(`${region}_${kind}`,parts[j],row.page,'PDF residency table','C1');
 }
 const date=(key:string,prefix:string)=>{const m=fields.get(prefix+'_MON'),d=fields.get(prefix+'_DAY');const month=numeric(m?.value),day=numeric(d?.value);if(m&&month!==null&&day!==null&&month>=1&&month<=12&&day>=1&&day<=31)put(key,`${month}/${day}`,m.page,'PDF form fields');};
 for(const [key,name] of [['ed_offered','AD_EDEC'],['ea_offered','AD_EACT'],['ea_restrictive','AP_EACT_RESTRICT'],['fee_waiver','AP_FEE_WAIVE']]){const f=fields.get(name);if(f&&/^(Y|N)$/i.test(f.value.trim()))put(key,f.value.trim().toUpperCase()==='Y'?'Yes':'No',f.page,'PDF form field '+name);}
 for(const [key,prefix] of [['ea_deadline','AP_DL_EACT'],['ea_notification','AP_NOTF_DL_EACT'],['ed2_deadline','AP_DL_EDEC_2']])date(key,prefix);
 for(const [n,key,pattern] of [[13,'fee_waiver',/Can it be waived for applicants with financial need\?\s+(Yes|No)\b/i],[22,'ea_offered',/Do you have a nonbinding early action plan.*?\b(Yes|No)\s*$/i],[22,'ea_restrictive',/Is your early action plan.*?\b(Yes|No)\s*$/i]] as const)for(const row of block('C',n)){const m=row.text.match(pattern);if(m)put(key,m[1],row.page);}
 for(const [key,pattern] of [['ea_deadline',/Early action closing date\s*:\s*/i],['ea_notification',/Early action notification date\s*:\s*/i]] as const)matchValue(key,'C22',block('C',22),pattern,'text');
 const policy=block('C',8).find(l=>/policies for use in admission for Fall \d{4}/i.test(l.text));if(policy)put('policy_year',policy.text.match(/Fall \d{4}/i)![0],policy.page);
 const subjects=['ENG','MATH','SCI','SCI_LAB','LANG','SOC','HIST','CMPTR','VISUAL','ACAD_ELECT'];
 for(const [i,[id]] of courseSubjects.entries())for(const [kind,suffix] of [['required','REQ'],['recommended','REC']] as const)field(`course_${id}_${kind}`,[`${subjects[i]}_UNITS_${suffix}`]);
 const c5=block('C',5);const header=c5.find(l=>/Units Required.*Units Recommended/i.test(l.text));
 if(header){const required=header.words.find(w=>/^Required$/i.test(w.str)),recommended=header.words.find(w=>/^Recommended$/i.test(w.str));if(required&&recommended)for(const [id,name] of courseSubjects){const row=c5.find(l=>new RegExp(`^(?:C5\\s+)?${name.replace('/','\\/')}\\b`,'i').test(l.text));if(row)for(const w of row.words.filter(w=>numeric(w.str)!==null&&w.x>required.x-25)){const kind=Math.abs(w.x-required.x)<Math.abs(w.x-recommended.x)?'required':'recommended';put(`course_${id}_${kind}`,numeric(w.str),row.page);}}}
 for(const [key,names,section] of [
  ['transfer_applicants',['AP_TFER_N'],'D2'],['transfer_admitted',['AD_TFER_N'],'D2'],['transfer_enrolled',['EN_TFER_N'],'D2'],
  ['tuition_private',['TUIT_OVERALL_1ST_FT_D','TUIT_OVERALL_FT_D'],'G1'],['tuition_in_state',['TUIT_STATE_1ST_FT_D','TUIT_AREA_1ST_FT_D','TUIT_STATE_FT_D','TUIT_AREA_FT_D'],'G1'],['tuition_out_state',['TUIT_NRES_1ST_FT_D','TUIT_NRES_FT_D'],'G1'],['required_fees',['FEES_1ST_D','FEES_FT_D'],'G1'],['housing_food',['RM_BD_1ST_D','RM_BD_D'],'G1'],['books',['BOOKS_RES_D'],'G5'],['personal_expenses',['OTH_RES_D'],'G5'],
  ['aid_first_year_count',['FRSH_FT_N'],'H2'],['aid_need_count',['FRSH_FT_ND_N'],'H2'],['aid_awarded_count',['FRESH_FT_REC_AID_N'],'H2'],['grant_recipients',['FRSH_FT_NB_GIFT_N'],'H2'],['need_fully_met_count',['FRSH_FT_ND_MET_N'],'H2'],['need_met',['FRSH_FT_ND_MET_P'],'H2'],['average_aid_package',['FRSH_FT_AVG_PKG_D'],'H2'],['average_grant',['FRSH_FT_AVG_NB_GIFT_D'],'H2'],['merit_recipients',['FRESH_FT_NN_NONEED_N'],'H2A'],['average_merit_grant',['FRESH_FT_NN_NONEED_D'],'H2A'],
  ['retention_initial',['RETENTION_FRSH_N'],'B22'],['retention_returned',['RETENTION_ENROLL_N'],'B22'],['retention_rate',['RETENTION_FRSH_P'],'B22'],['graduation_adjusted',['GRS_BACH_ADJUST_N'],'B'],['graduated_4',['GRS_4YR_N'],'B'],['graduated_6',['GRS_BACH_TOT_N'],'B'],['student_faculty_ratio',['UG_RATIO'],'I2'],['class_total',['CLASS_SEC_TOT'],'I3']
 ] as [string,string[],string][])field(key,names,section);
 for(const [i,[id]] of classBands.entries())field(`class_${id}`,[`CLASS_SEC_${i+1}`]);
 // Filled zero checker cells do not establish GPA or distribution answers.
 const b22=block('B',22);const retentionYear=b22.map(l=>l.text).join(' ').match(/(?:entered|entering|cohort[^.]*?)\s+(?:in\s+)?Fall\s+(\d{4})/i);if(retentionYear)put('retention_cohort',Number(retentionYear[1]),b22[0].page);
 matchValue('retention_rate','B22',b22,/^Enter retention rate\s*:\s*/i);
 const retentionPercent=b22.flatMap(row=>{const m=row.text.match(/^(\d+(?:\.\d+)?)%$/);return m?[{value:Number(m[1]),page:row.page}]:[];});
 if(retentionPercent.length===1)put('retention_rate',retentionPercent[0].value,retentionPercent[0].page,'PDF sole retention answer','B22');
 for(const [n,key] of [[6,'graduation_adjusted'],[7,'graduated_4'],[10,'graduated_6']] as const){const rows=block('B',n);const answers=rows.filter(l=>/^[\d,]+$/.test(l.text));if(answers.length===1)put(key,numeric(answers[0].text),answers[0].page,'PDF graduation answer',`B${n}`);}
 const graduationStart=lines.findIndex(row=>/^Fall\s+\d{4}\s+Cohort\b/i.test(row.text));
 if(graduationStart>=0){
  const first=lines[graduationStart],year=Number(first.text.match(/Fall\s+(\d{4})/i)![1]);
  const next=lines.findIndex((row,i)=>i>graduationStart&&(/^(?:Fall\s+\d{4}\s+Cohort|B12\b|B22\b)/i.test(row.text)));
  const grid=lines.slice(graduationStart,next<0?undefined:next);
  // Lettered graduation grids have four population columns; use the reconciled total.
  for(const row of grid){const letter=row.text.match(/^([CDG])\s/);if(!letter)continue;
   const cells=row.words.map(w=>numeric(w.str)).filter((v):v is number=>v!==null).slice(-4);
   if(cells.length!==4||cells.slice(0,3).reduce((a,v)=>a+v,0)!==cells[3])continue;
   put({C:'graduation_adjusted',D:'graduated_4',G:'graduated_6'}[letter[1]]!,cells[3],row.page,'PDF reconciled graduation total','B');
  }
  if(['graduation_adjusted','graduated_4','graduated_6'].some(k=>r.metrics[k]!==undefined))put('graduation_cohort',year,first.page,'PDF graduation cohort header','B');
 }
 const tuitionPage=pages.find(p=>p.form_fields.some(f=>/^TUIT_/.test(f.name)&&numeric(f.value)!==null))??pages.find(p=>p.lines.some(l=>/^G1[.\s]/.test(clean(l.text))));if(tuitionPage){const m=clean(tuitionPage.text).match(/(?:FULL|full)\s+(\d{4}[ -]+\d{2,4})\s+academic year/i);if(m)put('cost_year',m[1],tuitionPage.page,'PDF expense reporting instructions','G1');}
 const aidChoice=fields.get('ACAD_YR');if(aidChoice&&/^\d{4}$/.test(aidChoice.value.trim()))put('aid_year',`${aidChoice.value.trim()} (source form selection)`,aidChoice.page,'PDF form field ACAD_YR','H1');
 // Simple text layouts: use complete labeled rows and explicit totals only.
 for(const row of block('D',2)){const m=row.text.match(/^Total\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/i);if(m)for(const [i,key] of ['transfer_applicants','transfer_admitted','transfer_enrolled'].entries())put(key,numeric(m[i+1]),row.page,'PDF total row','D2');}
 for(const row of lines){const m=row.text.match(/Student to Faculty ratio\s*:?\s*(\d+(?:\.\d+)?)\s+to\s+1/i);if(m)put('student_faculty_ratio',Number(m[1]),row.page,'PDF text','I2');}
 const i3=block('I',3).map(l=>({...l,text:l.text.replace(/^I[-.]?3\s+/i,'')}));for(let i=0;i<i3.length;i++){const row=i3[i];let data=row.text.replace(/^CLASS SECTIONS\s+/i,'');
  if(/^CLASS$/i.test(row.text)&&i3[i+2]?.text==='SECTIONS')data=i3[i+1].text;
  else if(/^CLASS 2-9\b/i.test(row.text)&&/^SECTIONS\s+\d/i.test(i3[i+1]?.text??''))data=i3[i+1].text.replace(/^SECTIONS\s+/i,'');
  else if(!/^CLASS SECTIONS\s+\d/i.test(row.text))continue;
  const vals=data.split(/\s+/).map(numeric);if(vals.length===8&&vals.every(v=>v!==null)&&vals.slice(0,7).reduce<number>((a,v)=>a+(v??0),0)===vals[7]){for(const [j,[id]] of classBands.entries())put(`class_${id}`,vals[j],row.page,'PDF reconciled class sections','I3');put('class_total',vals[7],row.page,'PDF reconciled class sections','I3');}}
 // Text-only expense rows retain the printed first-year column; other columns are not summed.
 const g1=block('G',1);let institution='';
 for(const row of g1){if(/PRIVATE INSTITUTIONS/i.test(row.text))institution='private';if(/PUBLIC INSTITUTIONS/i.test(row.text))institution='public';
  const patterns:[string,RegExp][]=[['required_fees',/Required Fees\s*:/i],['housing_food',/(?:Food and housing|Room and board)\s*\(on-campus\)\s*:/i],['tuition_in_state',/Tuition:\s*In-state(?:\s*\(out-of-district\))?\s*:/i],['tuition_out_state',/Tuition:\s*(?:Out-of-state|Nonresident)\s*:/i]];
  if(institution==='private')patterns.push(['tuition_private',/^Tuition\s*:/i]);
  for(const [key,pattern] of patterns){const m=row.text.match(pattern);if(!m)continue;const values=row.text.slice((m.index??0)+m[0].length).trim().split(/\s+/).map(numeric);if(values.length>=1&&values.length<=2&&values.every(v=>v!==null))put(key,values[0],row.page,'PDF first-year expense column','G1');}
 }
 for(const row of block('G',5))for(const [key,pattern] of [['books',/^(?:G5\s+)?Books and supplies\s*:?\s*/i],['personal_expenses',/^(?:G5\s+)?Other expenses\s*:?\s*/i]] as const){const m=row.text.match(pattern);if(!m)continue;const values=row.text.slice(m[0].length).trim().split(/\s+/).map(numeric);if(values.length===3&&values.every(v=>v!==null))put(key,values[0],row.page,'PDF resident expense column','G5');}
 for(const row of b22){const m=row.text.match(/Calculate the percentage of the Fall \d{4} entering cohort.*?(\d+(?:\.\d+)?)%\s*$/i);if(m)put('retention_rate',Number(m[1]),row.page,'PDF retention percentage','B22');}
 // Aid tables' A–Q rows use first-year, full-time undergraduate, and part-time columns.
 // Require the explicit first-year heading and three populated numeric cells.
 const h2=block('H',2);const h2a=h2.findIndex(l=>/^H2A\b/i.test(l.text));
 if(/First.year Students/i.test(h2.map(l=>l.text).join(' '))){
  const aidKeys:Record<string,string>={A:'aid_first_year_count',C:'aid_need_count',D:'aid_awarded_count',E:'grant_recipients',H:'need_fully_met_count',I:'need_met',J:'average_aid_package',K:'average_grant',N:'merit_recipients',O:'average_merit_grant'};
  for(const [i,row] of h2.entries()){const letter=row.text.match(/^([A-Q])\s/);if(!letter)continue;const key=aidKeys[letter[1]];if(!key||(['N','O'].includes(letter[1])&&h2a>=0&&i<h2a))continue;
   const tokens=row.words.filter(w=>/^(?:\$?[\d,]+(?:\.\d+)?%?|\$-)$/.test(w.str.trim())).map(w=>numeric(w.str));
   if(tokens.length===3&&tokens[0]!==null)put(key,tokens[0],row.page,'PDF first-year aid column',/^[NO]$/.test(letter[1])?'H2A':'H2');
  }
 }
 // Older tables wrap row labels away from their answers and may leave the part-time column blank.
 const firstYearHeading=h2.find(row=>row.words.some(w=>/^First.year$|^Freshmen$/.test(w.str)));
 const firstYearX=firstYearHeading?.words.find(w=>/^First.year$|^Freshmen$/i.test(w.str))?.x;
 if(firstYearX!==undefined){
  const aidKeys:Record<string,string>={A:'aid_first_year_count',C:'aid_need_count',D:'aid_awarded_count',E:'grant_recipients',H:'need_fully_met_count',I:'need_met',J:'average_aid_package',K:'average_grant',N:'merit_recipients',O:'average_merit_grant'};
  for(let i=0;i<h2.length;i++){const label=h2[i].text.match(/^(?:H2A?\s+)?([A-Q])(?:\)|\s)/i);if(!label)continue;const key=aidKeys[label[1].toUpperCase()];if(!key)continue;
   const end=h2.findIndex((l,j)=>j>i&&/^(?:H2A?\s+)?[A-Q](?:\)|\s)/i.test(l.text));const chunk=h2.slice(i,end<0?undefined:end);
   const answer=chunk.map(row=>({row,cells:row.words.filter(w=>w.x>=firstYearX-30).map(w=>numeric(w.str)).filter((v):v is number=>v!==null)})).filter(a=>a.cells.length===2||a.cells.length===3);
   if(answer.length===1)put(key,answer[0].cells[0],answer[0].row.page,'PDF first-year aid column',/^[NO]$/.test(label[1].toUpperCase())?'H2A':'H2');
  }
 }
 // Existing Section C text stays intact; retain the additional source pages actually used.
 const present=new Set([...r.sections,...r.additional_sections??[]].map(p=>p.page));
 const extra=pages.filter(p=>used.has(p.page)&&!present.has(p.page)).map(({page,text,form_fields})=>({page,text,form_fields}));
 if(extra.length)r.additional_sections=[...r.additional_sections??[],...extra].sort((a,b)=>a.page-b.page);
 deriveExtraMetrics(r);
 return r;
}

export function deriveExtraMetrics(r:Report):Report {
 const ratio=(key:string,n:string,d:string,section:string)=>{const a=r.metrics[n],b=r.metrics[d];delete r.metrics[key];delete r.evidence[key];if(!r.omitted_metrics?.includes(key)&&typeof a==='number'&&typeof b==='number'&&b>0&&a<=b){r.metrics[key]=Math.round(a/b*100000)/1000;r.evidence[key]={...r.evidence[n],section,page:r.evidence[n]?.page??null,method:`calculated: ${n} / ${d}`};}};
 ratio('ed_share','ed_admitted','admitted','C21');
 for(const region of ['in_state','out_state','international','male','female','another_gender','unknown_gender']){ratio(region+'_admit_rate',region+'_admitted',region+'_applicants','C1');ratio(region+'_yield_rate',region+'_enrolled',region+'_admitted','C1');}
 ratio('transfer_admit_rate','transfer_admitted','transfer_applicants','D2');ratio('transfer_yield_rate','transfer_enrolled','transfer_admitted','D2');ratio('merit_participation','merit_recipients','aid_first_year_count','H2A');ratio('graduation_4_rate','graduated_4','graduation_adjusted','B');ratio('graduation_6_rate','graduated_6','graduation_adjusted','B');
 const small=Number(r.metrics.class_2_9)+Number(r.metrics.class_10_19),large=Number(r.metrics.class_50_99)+Number(r.metrics.class_100_plus),total=r.metrics.class_total;
 for(const [key,n] of [['class_under_20_rate',small],['class_50_plus_rate',large]] as const){delete r.metrics[key];delete r.evidence[key];if(typeof total==='number'&&total>0&&Number.isFinite(n)&&n<=total){r.metrics[key]=Math.round(n/total*100000)/1000;r.evidence[key]={section:'I3',page:r.evidence.class_total?.page??null,method:'calculated from undergraduate class sections'};}}
 for(const key of r.omitted_metrics??[]){delete r.metrics[key];delete r.evidence[key];}
 return r;
}
