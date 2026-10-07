"""Import official USC Columbia Section C archives; preserve PDF widgets and HTML answers."""
from pathlib import Path
from urllib.parse import urljoin
from datetime import datetime, timezone
import concurrent.futures, hashlib, json, re
import requests, pymupdf
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'data/sources'
INDEX='https://sc.edu/about/offices_and_divisions/institutional_research_assessment_and_analytics/institutional_effectiveness/common_data_set/'
RATINGS=['Very important','Important','Considered','Not considered']
ACADEMIC=['Rigor of secondary school record','Class rank','Academic GPA','Standardized test scores','Application essay','Recommendations']
NONACADEMIC=['Interview','Extracurricular activities','Talent/ability','Character/personal qualities','First generation','Alumni/ae relation','Geographical residence','State residency','Religious affiliation/commitment','Racial/ethnic status','Volunteer work','Work experience',"Level of applicant’s interest"]

def clean(s):return re.sub(r'\s+',' ',s).strip()
def number(s):
 s=s.strip().replace(',','').replace('%','').replace('$','')
 return float(s) if re.fullmatch(r'\d+(?:\.\d+)?',s) else None

def fetch(option):
 year=int(option.get_text()[:4]);url=option['value'];kind='pdf' if url.endswith('.pdf') else 'html'
 if kind=='html':
  index=BeautifulSoup(requests.get(url,timeout=40).content,'html.parser')
  a=next(a for a in index.select('a[href]') if 'Section C' in a.get_text())
  url=urljoin(url,a['href'])
 path=CACHE/f'south-carolina-{year}.{kind}'
 if not path.exists():
  response=requests.get(url,timeout=60);response.raise_for_status();path.write_bytes(response.content)
 r=dict(school_id='south-carolina',school='University of South Carolina (Columbia)',year=year,report_label=f'{year}–{str(year+1)[-2:]}',source_url=url,index_url=INDEX,source_type=kind,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),extracted_at=datetime.now(timezone.utc).isoformat(),review_status='Source extracted; not manually audited',metrics={},evidence={},factors=[],sections=[],warnings=[])
 def put(key,value,section,page=None,method='reported'):
  if value is not None:r['metrics'][key]=value;r['evidence'][key]=dict(section=section,page=page,method=method)
 if kind=='pdf':
  doc=pymupdf.open(path);started=False;fields={}
  for i,page in enumerate(doc):
   text=page.get_text(sort=True)
   if re.search(r'\bC1[.\s-]',text):started=True
   if started and re.search(r'\bD1[.\s]|D\. TRANSFER|CDS-D',text):break
   if not started:continue
   widgets=[]
   for w in page.widgets() or []:
    if w.field_value is None or str(w.field_value).strip() in ['','Off']:continue
    value=str(w.field_value).strip();fields[w.field_name]=(value,i+1)
    widgets.append(dict(name=w.field_name,value=value,label=w.field_label,rect=list(w.rect)))
   r['sections'].append(dict(page=i+1,text=text,form_fields=widgets))
  def fld(key,name,section):
   if name in fields:put(key,number(fields[name][0]),section,fields[name][1],'PDF form field')
  for key,prefix in [('applicants','AP_RECD_1ST_'),('admitted','AP_ADMT_1ST_'),('enrolled','EN_TOT_1ST_')]:
   vals=[fields[prefix+s] for s in ['MEN_N','WMN_N','NON_BINARY_N','UNK_N'] if prefix+s in fields]
   if vals:put(key,sum(number(v) for v,p in vals),'C1',vals[0][1],'sum of gender counts')
   else:fld(key,prefix+'N','C1')
  for key,name,section in [('waitlist_offered','AP_RECD_WAIT_N','C2'),('waitlist_accepted','AP_ACPT_WAIT_N','C2'),('waitlist_admitted','AP_ADMT_WAIT_N','C2'),('top_tenth','FRSH_HS_RANK_10_P','C10'),('top_quarter','FRSH_HS_RANK_25_P','C10'),('top_half','FRSH_HS_RANK_50_P','C10'),('rank_submitted','FRSH_HS_RANK_SUBMIT_P','C10'),('sat_submitted','SUBMIT_SAT1_P','C9'),('act_submitted','SUBMIT_ACT_P','C9'),('sat_submitted_count','SUBMIT_SAT1_N','C9'),('act_submitted_count','SUBMIT_ACT_N','C9'),('fee','AP_FEE_RES_D','C13')]:fld(key,name,section)
  for key,prefix in [('sat','SAT1_COMP'),('reading','SAT1_VERB'),('math','SAT1_MATH'),('act','ACT_COMP')]:
   for pct in [25,50,75]:fld(f'{key}_{pct}',f'{prefix}_{pct}TH_P','C9')
  for prefix,labels in [('Q111_',ACADEMIC),('Q112_',NONACADEMIC)]:
   for j,label in enumerate(labels,1):
    if prefix+str(j) in fields:
     v,p=fields[prefix+str(j)];rating={'VI':RATINGS[0],'I':RATINGS[1],'C':RATINGS[2],'NC':RATINGS[3]}.get(v)
     if rating:r['factors'].append(dict(label=label,rating=rating,page=p))
  for key,prefix,section in [('rd_deadline','AP_DL_FRSH','C14'),('ed_deadline','AP_DL_EDEC_1','C21'),('ed_notification','AP_NOTF_DL_EDEC_1','C21')]:
   if prefix+'_MON' in fields and prefix+'_DAY' in fields:
    m,p=fields[prefix+'_MON'];d,_=fields[prefix+'_DAY'];put(key,f'{int(m):02d}/{int(d):02d}',section,p)
  if 'EXAM_CODE_S1A' in fields:
   v,p=fields['EXAM_CODE_S1A'];policy={'ADMS_CONSIDER':'Not required; considered if submitted','ADMS_REQ':'Required','ADMS_NCONSIDER':'Not considered','ADMS_REC':'Recommended'}.get(v.strip())
   put('test_policy',policy,'C8',p)
  if not fields:
   counts={k:[] for k in ['applicants','admitted','enrolled']}
   for s in r['sections']:
    t=s['text'];page=s['page']
    for line in t.splitlines():
     if re.search(r'^\s*Total.*\b(?:men|women|another gender|unknown gender)\b',line):
      match=re.search(r'\b(applied|admitted|enrolled)\s+(\d[\d,]*)\s*$',line)
      if match:counts[{'applied':'applicants','admitted':'admitted','enrolled':'enrolled'}[match[1]]].append((number(match[2]),page))
    patterns=[('waitlist_offered',r'Number of qualified applicants offered a place on waiting list:\s*([\d,]+)','C2'),('waitlist_accepted',r'Number accepting a place on the waiting list:\s*([\d,]+)','C2'),('waitlist_admitted',r'Number of wait-listed students admitted:\s*([\d,]+)','C2'),('top_tenth',r'Percent in top tenth of high school graduating class\s*([\d.]+)%?','C10'),('top_quarter',r'Percent in top quarter of high school graduating class\s*([\d.]+)%?','C10'),('top_half',r'Percent in top half of high school graduating class\s*([\d.]+)%?','C10'),('fee',r'Amount of application fee:\s*\$\s*([\d.]+)','C13'),('rd_deadline',r'Application closing date \(fall\)\s*([^\n]+)','C14')]
    for key,pattern,section in patterns:
     m=re.search(pattern,t,re.I)
     if m:put(key,m[1].strip() if key=='rd_deadline' else number(m[1]),section,page)
    for key,label in [('sat','SAT Composite'),('reading','SAT Evidence-Based Reading and'),('math','SAT Math'),('act','ACT Composite')]:
     m=re.search(re.escape(label)+r'\s+([\d]+)\s+([\d]+)(?:[ \t]+([\d]+))?',t)
     if m:
      vals=[number(v) for v in m.groups() if v]
      if vals[0]>=(200 if key!='act' else 1):
       for pct,v in zip([25,75] if len(vals)==2 else [25,50,75],vals):put(f'{key}_{pct}',v,'C9',page)
    for test in ['sat','act']:
     m=re.search(f'Submitting {test.upper()} Scores'+r'\s+([\d.]+)%?\s+([\d,]+)',t)
     if m:put(test+'_submitted',number(m[1]),'C9',page);put(test+'_submitted_count',number(m[2]),'C9',page)
    if 'Students indicate on their application whether' in t:
     put('test_policy','Not required; considered if submitted','C8',page,'published test-policy explanation')
    if re.search(r'\bC7\s',t):
     p=doc[page-1];words=p.get_text('words');headers=p.search_for('Very Important')
     ih=p.search_for('Important');ch=p.search_for('Considered');nh=p.search_for('Not Considered') or [a for a in p.search_for('Not') if headers and abs(a.y0-headers[0].y0)<2]
     if headers and ih and ch and nh:
      centers=[(headers[0].x0+headers[0].x1)/2,max((a.x0+a.x1)/2 for a in ih),min((a.x0+a.x1)/2 for a in ch),(nh[0].x0+nh[0].x1)/2]
      for label in ACADEMIC+NONACADEMIC:
       look={'Application essay':'Application Essay','Recommendations':'Recommendation(s)'}.get(label,label)
       boxes=p.search_for(look)
       for box in boxes:
        xs=[w for w in words if w[4].lower()=='x' and abs((w[1]+w[3])/2-(box.y0+box.y1)/2)<5 and w[0]>headers[0].x0-10]
        if len(xs)==1:
         x=(xs[0][0]+xs[0][2])/2;idx=min(range(4),key=lambda j:abs(x-centers[j]));r['factors'].append(dict(label=label,rating=RATINGS[idx],page=page));break
   for key,vals in counts.items():
    if vals:put(key,sum(v for v,p in vals),'C1',vals[0][1],'sum of gender/status counts in PDF text')
 else:
  soup=BeautifulSoup(path.read_bytes(),'html.parser')
  for x in soup.select('script,style,nav,select'):x.decompose()
  # Include checked controls and legacy checkbox images in preserved searchable text.
  for x in soup.select('input'):
   value=x.get('value','')
   if x.has_attr('checked') or x.get('type','text').lower() not in ['radio','checkbox','button','submit']:
    x.replace_with(f' [Selected: {value}] ' if x.has_attr('checked') else value)
  # Parse the original again for table cells and checkbox positions.
  original=BeautifulSoup(path.read_bytes(),'html.parser')
  rows=[]
  for tr in original.select('tr'):
   cells=tr.find_all(['td','th'],recursive=False)
   if len(cells)<2 or any(c.find('table') for c in cells):continue
   texts=[clean(c.get_text(' ',strip=True)) for c in cells]
   rows.append((texts,cells))
  for img in soup.select('img'):
   if 'checked' in img.get('src','').lower():img.replace_with(' [Selected] ')
  text=soup.get_text('\n',strip=True)
  # Navigation excluded above; retain all source answers without inventing PDF pages.
  r['sections']=[dict(page=1,text=text,form_fields=[])]
  totals={'applicants':[],'admitted':[],'enrolled':[]}
  for texts,cells in rows:
   label=texts[0].lower();vals=[number(v) for v in texts[1:]];nums=[v for v in vals if v is not None]
   if label.startswith('total ') and re.search(r'\b(?:men|women)\b',label):
    for key,word in [('applicants','applied'),('admitted','admitted'),('enrolled','enrolled')]:
     if word in label and nums:totals[key].append(nums[-1])
   mapping=[('waitlist_offered',r'qualified applicants (?:offered|placed)','C2'),('waitlist_accepted',r'number accepting a place','C2'),('waitlist_admitted',r'number of wait-listed students admitted','C2'),('top_tenth',r'percent in top (?:tenth|10th)','C10'),('top_quarter',r'percent in top quarter','C10'),('top_half',r'percent in top half','C10'),('rank_submitted',r'percent of total.*high school class rank','C10'),('fee',r'amount of application fee','C13')]
   for key,pattern,section in mapping:
    if re.search(pattern,label) and nums:put(key,nums[-1],section)
   for key,pattern in [('sat',r'^sat (?:i )?composite$'),('reading',r'^sat (?:i )?(?:verbal|critical reading|evidence-based reading and writing)$'),('math',r'^sat (?:i )?(?:math|mathematics)$'),('act',r'^act composite$')]:
    if re.search(pattern,label) and len(nums) in [2,3]:
     for pct,v in zip([25,75] if len(nums)==2 else [25,50,75],nums):put(f'{key}_{pct}',v,'C9')
   for test in ['sat','act']:
    if label==f'submitting {test} scores' and nums:
     put(f'{test}_submitted',nums[0],'C9')
     if len(nums)>1:put(f'{test}_submitted_count',nums[1],'C9')
   if len(cells)==5 and texts[0] and not any('important' in t.lower() for t in texts):
    checked=[i for i,c in enumerate(cells[1:]) if c.select('input[checked]') or any('checked' in img.get('src','').lower() for img in c.select('img'))]
    if len(checked)==1:r['factors'].append(dict(label=texts[0],rating=RATINGS[checked[0]],page=1))
   for key,pattern,section in [('rd_deadline',r'^application closing date','C14'),('ed_deadline',r'^first or only early decision plan closing date','C21'),('ed_notification',r'^first or only early decision plan notification date','C21')]:
    if re.search(pattern,label) and texts[-1] and not set(texts[-1])<=set('_ '):put(key,texts[-1],section)
  for key,vals in totals.items():
   if vals:put(key,sum(vals),'C1',method='sum of reported gender/status counts')
  flat=clean(original.get_text(' ',strip=True))
  for key,word in [('applicants','applied'),('admitted','admitted'),('enrolled','enrolled')]:
   if key not in r['metrics']:
    vals=re.findall(r'Total\s+(?:full-time, first-time, first-year \(freshman\) |part-time, first-time, first-year \(freshman\) )?(?:men|women) '+word+r':\s*([\d,]+)',flat,re.I)
    if vals:put(key,sum(number(v) for v in vals),'C1',method='sum of reported gender/status counts')
  for key,pattern,section in [('top_tenth',r'Percent in top (?:10th|tenth) of high school graduating class:\s*([\d.]+)','C10'),('top_quarter',r'Percent in top quarter of high school graduating class:\s*([\d.]+)','C10'),('top_half',r'Percent in top half of high school graduating class:\s*([\d.]+)','C10'),('rank_submitted',r'submitted high school class rank:\s*([\d.]+)','C10'),('fee',r'Amount of application fee:\s*\$([\d.]+)','C13')]:
   if key not in r['metrics']:
    m=re.search(pattern,flat,re.I)
    if m:put(key,number(m[1]),section)
  # Record the selected SAT/ACT column in the published policy table.
  for texts,cells in rows:
   if texts[0].lower() in ['sat or act','sat i or act (no preference)'] and len(cells)==6:
    selected=[i for i,c in enumerate(cells[1:]) if c.select('input[checked]') or any('checked' in im.get('src','').lower() for im in c.select('img'))]
    if len(selected)==1:put('test_policy',['Required','Recommended','Required for some','Not required; considered if submitted','Not used'][selected[0]],'C8',method='selected HTML policy column')
  r['warnings'].append('Historical HTML source: source links open the official Section C webpage; no PDF page numbers are available.')
 for key,n,d,section in [('admit_rate','admitted','applicants','C1'),('yield_rate','enrolled','admitted','C1'),('waitlist_rate','waitlist_admitted','waitlist_accepted','C2')]:
  if n in r['metrics'] and r['metrics'].get(d,0)>0:put(key,round(100*r['metrics'][n]/r['metrics'][d],3),section,r['evidence'][n]['page'],'calculated')
 assert all(k in r['metrics'] for k in ['applicants','admitted','enrolled']),(year,r['metrics'])
 assert r['sections'],year
 r['warnings'].append('Admissions policies and deadlines may refer to a later application cycle than the reported fall cohort; consult the source before advising.')
 (CACHE/f'south-carolina-{year}.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
 print(year,r['metrics'],len(r['factors']),'factors',flush=True)
 return r

def main():
 soup=BeautifulSoup(requests.get(INDEX,timeout=40).content,'html.parser')
 options=[o for o in soup.select('option[value]') if re.match(r'\d{4}-\d{4}',o.get_text())]
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:reports=list(pool.map(fetch,options))
 current=json.loads((ROOT/'data/reports.json').read_text(encoding='utf8'))
 merged=[r for r in current if r['school_id']!='south-carolina']+reports
 (ROOT/'data/reports.json').write_text(json.dumps(sorted(merged,key=lambda r:(-r['year'],r['school'])),ensure_ascii=False,indent=2),encoding='utf8')
 print(f'Imported {len(reports)} USC Columbia records; library has {len(merged)} records.')

if __name__=='__main__':main()
