import json,sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
reports=json.loads((root/'data/reports.json').read_text(encoding='utf8'))
assert len(reports)==27 and {r['year'] for r in reports}==set(range(1999,2026))
con=sqlite3.connect(root/'data/admissions.sqlite')
con.execute('CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,school TEXT NOT NULL,year INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(school_id,year))')
con.execute('CREATE INDEX IF NOT EXISTS reports_year ON reports(year)')
for r in reports:
 m=r['metrics'];assert 0<=m['enrolled']<=m['admitted']<=m['applicants'],r['year']
 assert abs(m['admit_rate']-100*m['admitted']/m['applicants'])<.001
 for p in ['sat','reading','math','act']:
  if p+'_25' in m:assert m[p+'_25']<=m[p+'_75'],(r['year'],p)
 for k,v in m.items():
  if k.endswith('_rate') or k in ['top_tenth','top_quarter','top_half','rank_submitted','sat_submitted','act_submitted']:assert 0<=v<=100,(r['year'],k)
 assert len(r['sections'])>0 and len(r['factors'])==len({f['label'] for f in r['factors']})
 assert all(k in r['evidence'] for k in m)
 con.execute('INSERT OR REPLACE INTO reports VALUES(?,?,?,?,?)',(f"{r['school_id']}:{r['year']}",r['school_id'],r['school'],r['year'],json.dumps(r,ensure_ascii=False)))
con.commit()
# Independent reconciliation of all headline counts to the PDF form fields or original text.
import pymupdf,re
for r in reports:
 if r['year']==2022:continue
 doc=pymupdf.open(root/f"data/sources/cornell-{r['year']}.pdf")
 fields={w.field_name:w.field_value for p in doc for w in p.widgets() or [] if str(w.field_value).strip() not in ['', 'Off']}
 if fields:
  for key,prefix in [('applicants','AP_RECD_1ST_'),('admitted','AP_ADMT_1ST_'),('enrolled','EN_TOT_1ST_')]:
   nums=[int(fields[prefix+s]) for s in ['MEN_N','WMN_N','NON_BINARY_N','UNK_N'] if prefix+s in fields]
   assert sum(nums)==r['metrics'][key],(r['year'],key)
 print(f"{r['year']}: {int(r['metrics']['applicants']):,} applicants; {len(r['factors'])} factor ratings")
example=reports[0].copy();example['school_id']='example-university';example['school']='Example University';example['year']=2025;example['review_status']='Replace with your review status';example['source_url']='https://example.edu/common-data-set.pdf';example['index_url']='https://example.edu/common-data-set';example['metrics']={'applicants':10000,'admitted':2000,'enrolled':500};example['evidence']={k:{'section':'C1','page':5,'method':'reported'} for k in example['metrics']};example['factors']=[];example['sections']=[{'page':5,'text':'REPLACE with the original Section C source text. Example counts are illustrative.','form_fields':[]}];example['warnings']=['Template only: replace all example values before importing.'];example['sha256']='';
(root/'public/import-template.json').write_text(json.dumps([example],indent=2),encoding='utf8')
print('PASS: 27 cohorts, counts, rate denominators, score bounds, evidence, and portable SQLite export')
