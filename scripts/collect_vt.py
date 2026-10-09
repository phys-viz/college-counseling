"""Collect VT-authored originals; prefer live official files, preserve archived provenance.
XLSX extraction reuses the reviewed NYU worksheet adapter (no browser XLSX claim).
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,requests,re
from bs4 import BeautifulSoup
import collect_nyu
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/vt'
WORK.mkdir(parents=True,exist_ok=True)
collect_nyu.WORK=WORK
INDEX='https://aie.vt.edu/analytics-and-ai/common-data-set.html'
def collect(year):
 label=f'{year}-{str(year+1)[-2:]}'
 archive=f'https://www.collegedata.fyi/schools/virginia-tech/{label}'
 html=BeautifulSoup(requests.get(archive,timeout=45).text,'html.parser')
 urls=[a['href'] for a in html.select('a[href]') if '/storage/v1/object/public/sources/' in a['href']]
 url=urls[0]; typ=url.rsplit('.',1)[1]
 official=next((a['href'] for a in html.select('a[href]') if 'aie.vt.edu/content/dam/' in a['href'] and a['href'].endswith(('.pdf','.xlsx'))),None)
 # Archive pages retain the publisher URL in metadata even if not visible as a link.
 matches=re.findall(r'https://aie\.vt\.edu/content/dam/[^\s"<>]+?\.(?:pdf|xlsx)',str(html))
 official=official or (matches[0] if matches else None)
 if year==2023:official='https://aie.vt.edu/content/dam/aie_vt_edu/common-data-set/23-24/CDS_2023-2024.pdf'
 if official:
  try:
   response=requests.get(official,timeout=30)
   if response.status_code==200 and response.content[:4] in [b'%PDF',b'PK\x03\x04']:url=official
  except requests.RequestException:pass
 response=requests.get(url,timeout=45);response.raise_for_status()
 raw=response.content
 if '/storage/v1/object/public/sources/' in url:
  assert url.rsplit('/',1)[-1].split('.')[0]==hashlib.sha256(raw).hexdigest(),'Archived source bytes changed'
 d=dict(school_id='virginia-tech',school='Virginia Tech',year=year,title='Virginia Tech Common Data Set '+label,url=url,index_url=INDEX,archive_url=archive,official_url=official,source_type=typ,sha256=hashlib.sha256(raw).hexdigest(),provenance='official publisher file' if url==official else 'archived VT-authored original from CollegeData.fyi')
 file=WORK/f'nyu-{year}.{typ}'
 file.write_bytes(raw)
 if typ=='xlsx':
  import openpyxl
  workbook=openpyxl.load_workbook(file,data_only=True)
  sheets=[s for s in workbook if re.match(r'^(?:CDS-[A-J]$|[A-J] - )',s.title)]
  pages=[]
  for n,sheet in enumerate(sheets,1):
   positions=[0]
   for col in range(1,sheet.max_column+1):positions.append(positions[-1]+sheet.column_dimensions[openpyxl.utils.get_column_letter(col)].width*7)
   lines=[]
   dictionary=next((c.column for c in sheet[1] if c.value in ['Question Number','Question Numer']),None)
   for row in sheet:
    if dictionary==1:
     # VT 2024 publishes a normalized question/answer dictionary instead of
     # the visual report. Use numbered Section C questions only; preserve
     # residency components as labeled rows, never as additional totals.
     if sheet.title!='CDS-C' or not row[0].value:continue
     code=str(row[0].value);match=re.fullmatch(r'C(\d{1,2})\d{2}',code)
     if not match:continue
     section=int(match[1]);label=str(row[1].value or '')
     if section!=1 and row[2].value is None:continue
     if section==1 and row[8].value not in [None,'All']:label=str(row[8].value)+' '+label
     cells=[row[1]]+([row[2]] if row[2].value is not None else [])
     words=[dict(str=collect_nyu.formatted(c),x=positions[c.column-1],y=-c.row*20,width=positions[c.column]-positions[c.column-1],cell=f'{sheet.title}!{c.coordinate}') for c in cells]
     words[0]['str']=label
     if not lines or not lines[-1].get('section')==section:
      lines.append(dict(text=f'C{section} Source question group',words=[dict(str=f'C{section} Source question group',x=0,y=-row[0].row*20,width=100)],section=section))
     lines.append(dict(text=' '.join(w['str'] for w in words),words=words,section=section))
     continue
    words=[dict(str=collect_nyu.formatted(c),x=positions[c.column-1],y=-c.row*20,width=positions[c.column]-positions[c.column-1],cell=f'{sheet.title}!{c.coordinate}') for c in row if c.value is not None and (not dictionary or c.column<dictionary)]
    if words:lines.append(dict(text=' '.join(w['str'] for w in words),words=words))
   pages.append(dict(page=n,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[],worksheet=sheet.title,source_rows=[' | '.join(f'{sheet.title}!{c.coordinate}={collect_nyu.formatted(c)}' for c in row if c.value is not None and (not dictionary or dictionary==1 or c.column<dictionary)) for row in sheet if any(c.value is not None and (not dictionary or dictionary==1 or c.column<dictionary) for c in row)]))
  (WORK/f'{year}-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
 else:collect_nyu.cache(d)
 file.replace(WORK/f'virginia-tech-{year}.{typ}')
 d['usable_report']=year in [2019,2022,2023,2024,2025]
 if not d['usable_report']:
  d['exclusion_reason']='CDS definitions or change log only; no institution admission responses'
  d['provenance']='archived CDS companion file; no institution admission responses'
 print(year,typ,d['provenance'],flush=True)
 return d
if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=4) as pool:docs=list(pool.map(collect,range(2012,2026)))
 (ROOT/'data/vt-sources.json').write_text(json.dumps(docs,indent=2)+'\n',encoding='utf-8')


