"""Collect source-authored Bentley, Elon, UMass Boston and Scranton CDS files.

Historical section PDFs remain separate source files. XLS/XLSX adapters preserve
worksheet coordinates and are offline tools, not browser importer capabilities.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse
import datetime, hashlib, json, re, requests, pymupdf, openpyxl, xlrd, subprocess, sys
from bs4 import BeautifulSoup
from collect_new_archives import geometry
ROOT=Path(__file__).resolve().parents[1]
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
WORK=ROOT/'.sites-runtime/batch-b'
WORK.mkdir(parents=True,exist_ok=True)
SCHOOLS=[
 ('bentley-university','Bentley University','https://www.bentley.edu/academics/offices/provost/ie-data'),
 ('elon-university','Elon University','https://www.elon.edu/u/administration/institutional-effectiveness/cds/'),
 ('university-of-massachusetts-boston','University of Massachusetts Boston','https://www.umb.edu/oir/facts/common-data-set/'),
 ('university-of-scranton','University of Scranton','https://www.scranton.edu/pir/institutional-research/institutional-research-reports/institutional-research-reports-page.shtml'),
]

def fetch(url):
 try:
  r=requests.get(url,timeout=60);r.raise_for_status();return r.content,r.url
 except requests.exceptions.SSLError:
  # curl uses Windows' verified trust store; never disable certificate checking.
  raw=subprocess.check_output(['curl.exe','--silent','--show-error','--fail','--location',url],timeout=70)
  return raw,url

def discover():
 docs=[]
 for sid,name,url in SCHOOLS:
  if sid=='bentley-university':
   public='https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:b508bfdc-4859-467c-8031-43e018c9215b'
   docs.append(dict(school_id=sid,school=name,index_url=url,url=public,title='Bentley Common Data Set 2025-2026',year=2025,source_type='pdf',provenance='official Bentley-linked Adobe publication'))
   archive=requests.get('https://www.collegedata.fyi/api/schools/bentley-university/sources',timeout=45).json()
   for d in archive['cds_documents']:
    docs.append(dict(school_id=sid,school=name,index_url=url,url=d['archived_source_url'],official_url=d['source_url'],archive_url=d['archive_page_url'],title='Bentley Common Data Set '+d['canonical_year'],year=int(d['canonical_year'][:4]),source_type='pdf',provenance='archived Bentley-authored original from CollegeData.fyi; official current hub has no historical links'))
   continue
  raw,final=fetch(url)
  (WORK/f'{sid}-index.html').write_bytes(raw)
  soup=BeautifulSoup(raw,'html.parser')
  section_year=None
  for a in soup.find_all('a',href=True):
   href=urljoin(final,a['href']);label=a.get_text(' ',strip=True)
   typ=re.search(r'\.(pdf|xlsx?)(?:[?#]|$)',href,re.I)
   if not typ:continue
   if sid=='university-of-scranton' and not re.search(r'\bCDS\b|common data set',label+' '+href,re.I):continue
   if sid=='university-of-massachusetts-boston' and typ[1]!='pdf':continue
   if sid=='elon-university':
    if not label:continue
    heading=a.find_previous(['h3','h4'])
    m=re.search(r'(20\d{2})\s*[-–]',label) or re.search(r'(20\d{2})\s*[-–]',heading.get_text(' ',strip=True) if heading else '')
    if not m:continue
    year=int(m[1])
    if year<=2008 and label=='Definition of Terms':continue
    # Historical http links are upgraded to publisher HTTPS, retaining redirects.
    href=href.replace('http://www.elon.edu/','https://www.elon.edu/')
   else:
    context=a.find_parent('li')
    m=re.search(r'(20\d{2})',(context.get_text(' ',strip=True) if context else label)+' '+href)
    if not m:continue
    year=int(m[1])
   d=dict(school_id=sid,school=name,index_url=url,url=href,title=f'{name} Common Data Set {year}-{year+1}',year=year,source_type=typ[1].lower(),provenance='official publisher file')
   if sid=='university-of-massachusetts-boston' and year==2013:
    d['exclusion_reason']='Source C1 and report heading describe 2014; duplicate 2014 figures must not be indexed as 2013.'
   if sid=='elon-university' and year<=2008:d['section_label']=label
   if not any(o['url']==href for o in docs):docs.append(d)
  print('Discovered',name,len([d for d in docs if d['school_id']==sid]),'source files',flush=True)
  if sid=='university-of-scranton':
   for year in range(2006,2011):
    d=dict(school_id=sid,school=name,index_url=url,url=url.rsplit('/',1)[0]+f'/{year}-{year+1}-cds.pdf',title=f'{name} Common Data Set {year}-{year+1}',year=year,source_type='pdf',provenance='official publisher historical sibling file; URL verified separately from current index')
    if year==2010:d['exclusion_reason']='Blank CDS 2010 template with no institution C1 responses, visually verified page 6.'
    docs.append(d)
 sid,name,index=SCHOOLS[2]
 docs.append(dict(school_id=sid,school=name,index_url=index,url='https://www.umb.edu/media/umassboston/content-assets/documents/CDS_2013-2014.xlsx',title=name+' Common Data Set 2013-2014',year=2013,source_type='xlsx',provenance='official publisher workbook; PDF link for 2013 instead serves a 2014 report',cache_key=sid+'-2013-workbook'))
 return docs

def format_value(value,number_format=''):
 if isinstance(value,datetime.datetime):return value.strftime('%m/%d/%Y')
 if isinstance(value,(int,float)):
  return f'{value*100:g}%' if '%' in number_format else f'{value:g}'
 return re.sub(r'\s+',' ',str(value)).strip()

def worksheet_pages(file,typ):
 pages=[]
 if typ=='xlsx':
  book=openpyxl.load_workbook(file,data_only=True)
  sheets=[s for s in book if re.search(r'CDS[- ]?[A-J]\b|^[A-J](?:\b| -)',s.title,re.I)]
  for n,s in enumerate(sheets,1):
   dictionary=next((c.column for c in s[1] if str(c.value).lower() in ['question number','question numer']),None)
   positions=[0]
   for c in range(1,s.max_column+1):positions.append(positions[-1]+s.column_dimensions[openpyxl.utils.get_column_letter(c)].width*7)
   lines=[]
   for row in s:
    words=[dict(str=format_value(c.value,c.number_format),x=positions[c.column-1],y=-c.row*20,width=positions[c.column]-positions[c.column-1],cell=f'{s.title}!{c.coordinate}') for c in row if c.value is not None and (not dictionary or c.column<dictionary)]
    if words:lines.append(dict(text=' '.join(w['str'] for w in words),words=words))
   pages.append(dict(page=n,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[],worksheet=s.title,source_rows=[' | '.join(w['cell']+'='+w['str'] for w in l['words']) for l in lines]))
 else:
  book=xlrd.open_workbook(file,formatting_info=True)
  sheets=[s for s in book.sheets() if re.search(r'CDS[- ]?[A-J]\b|^[A-J](?:\b| -)',s.name,re.I)]
  for n,s in enumerate(sheets,1):
   positions=[0]
   for c in range(s.ncols):positions.append(positions[-1]+getattr(s.colinfo_map.get(c),'width',256*9)/256*7)
   lines=[]
   for row in range(s.nrows):
    words=[]
    for col in range(s.ncols):
     cell=s.cell(row,col)
     if cell.ctype in [xlrd.XL_CELL_EMPTY,xlrd.XL_CELL_BLANK] or cell.value=='':continue
     fmt=book.format_map.get(book.xf_list[cell.xf_index].format_key)
     value=format_value(cell.value,fmt.format_str if fmt else '')
     if cell.ctype==xlrd.XL_CELL_DATE:value=xlrd.xldate.xldate_as_datetime(cell.value,book.datemode).strftime('%m/%d/%Y')
     words.append(dict(str=value,x=positions[col],y=-(row+1)*20,width=positions[col+1]-positions[col],cell=f'{s.name}!{openpyxl.utils.get_column_letter(col+1)}{row+1}'))
    if words:lines.append(dict(text=' '.join(w['str'] for w in words),words=words))
   pages.append(dict(page=n,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[],worksheet=s.name,source_rows=[' | '.join(w['cell']+'='+w['str'] for w in l['words']) for l in lines]))
 assert pages,f'No CDS worksheets {file}'
 return pages

def cache(d):
 suffix='-'+re.sub(r'[^a-z0-9]+','-',d.get('section_label','').lower()).strip('-') if d.get('section_label') else ''
 d['cache_key']=d.get('cache_key') or f"{d['school_id']}-{d['year']}{suffix}"
 file=WORK/f"{d['cache_key']}.{d['source_type']}"
 try:
  if not file.exists():
   raw,final=fetch(d['url'])
   if 'acrobat.adobe.com' in d['url']:
    match=re.search(r'"download_url":\s*"((?:[^"\\]|\\.)*)"',raw.decode('utf8'))
    assert match,'Adobe public download metadata absent'
    signed=json.loads('"'+match[1]+'"');raw,_=fetch(signed)
   elif final!=d['url']:d['resolved_url']=final
   assert raw.startswith(b'%PDF-') if d['source_type']=='pdf' else raw[:4] in [b'PK\x03\x04',b'\xd0\xcf\x11\xe0'],f'Unexpected source bytes {d["url"]}'
   file.write_bytes(raw)
  d['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
  if 'api.collegedata.fyi' in d['url']:assert d['url'].rsplit('/',1)[-1].split('.')[0]==d['sha256'],'Archived bytes changed'
  pages=geometry(file) if d['source_type']=='pdf' else worksheet_pages(file,d['source_type'])
  (WORK/f"{d['cache_key']}-pages.json").write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
  (WORK/f"{d['cache_key']}-text.txt").write_text('\n\n'.join(f"PAGE {p['page']} {p.get('worksheet','')}\n{p['text']}" for p in pages),encoding='utf8')
  d['usable_report']=not d.get('exclusion_reason')
  print('Cached',d['cache_key'],len(pages),'pages/worksheets',flush=True)
 except Exception as e:
  d['usable_report']=False;d['download_error']=str(e);print('Unavailable',d['cache_key'],str(e),flush=True)
 return d

if __name__=='__main__':
 if '--supplements' in sys.argv:
  docs=json.loads((ROOT/'data/batch-b-sources.json').read_text(encoding='utf8'))
  sid,name,index=SCHOOLS[2]
  extra=dict(school_id=sid,school=name,index_url=index,url='https://www.umb.edu/media/umassboston/content-assets/documents/CDS_2013-2014.xlsx',title=name+' Common Data Set 2013-2014',year=2013,source_type='xlsx',provenance='official publisher workbook; PDF link for 2013 instead serves a 2014 report',cache_key=sid+'-2013-workbook')
  cached=cache(extra)
  # Distinct cache key for alternate format; source metadata and bytes kept.
  for d in docs:
   if d['school_id']==sid and d['year']==2013 and d['source_type']=='pdf':d['usable_report']=False;d['exclusion_reason']='Source C1 and report heading describe 2014; duplicate 2014 figures must not be indexed as 2013.'
  docs=[d for d in docs if not (d['school_id']==sid and d['year']==2013 and d['source_type']=='xlsx')]+[cached]
  (ROOT/'data/batch-b-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf8');sys.exit(0)
 if '--c1' in sys.argv:
  docs=json.loads((ROOT/'data/batch-b-sources.json').read_text(encoding='utf8'))
  selected=sys.argv[-1]
  for d in docs:
   if not d.get('usable_report') or d['school_id']!=selected or d.get('section_label') not in [None,'First-Time First-Year Admissions']:continue
   if '--before=2009' in sys.argv and d['year']>=2009:continue
   year_filter=next((int(x.split('=')[1]) for x in sys.argv if x.startswith('--year=')),None)
   if year_filter and d['year']!=year_filter:continue
   pages=json.loads((WORK/f"{d['cache_key']}-pages.json").read_text(encoding='utf8'))
   p=next((p for p in pages if re.search(r'^C\s*1(?:\b|\.)|^C\. FIRST-TIME',p['text'],re.M)),None)
   print('\n'+d['cache_key'])
   if p:
    lines=p['text'].splitlines();start=next((i for i,l in enumerate(lines) if re.search(r'^C\s*1(?:\b|\.)|^C\. FIRST-TIME',l)),0)
    end=next((i for i in range(start+1,len(lines)) if re.search(r'^C2(?:\b|\.)',lines[i])),min(len(lines),start+50))
    print('PAGE',p['page'],p.get('worksheet',''));print('\n'.join(lines[start:end]))
   else:print('No C1 label')
  sys.exit(0)
 if '--cache-history-only' in sys.argv:
  docs=json.loads((ROOT/'data/batch-b-sources.json').read_text(encoding='utf8'))
  sid,name,url=SCHOOLS[-1]
  extra=[dict(school_id=sid,school=name,index_url=url,url=url.rsplit('/',1)[0]+f'/{year}-{year+1}-cds.pdf',title=f'{name} Common Data Set {year}-{year+1}',year=year,source_type='pdf',provenance='official publisher historical sibling file; URL verified separately from current index') for year in range(2006,2011)]
  with ThreadPoolExecutor(max_workers=5) as pool:extra=list(pool.map(cache,extra))
  docs=[d for d in docs if not (d['school_id']==sid and d['year'] in range(2006,2011))]+extra
  (ROOT/'data/batch-b-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf8');sys.exit(0)
 if '--probe-scranton' in sys.argv:
  base=SCHOOLS[-1][2].rsplit('/',1)[0]+'/'
  urls=[base+f'{y}-{y+1}-{s}.pdf' for y in range(2000,2020) for s in ['cds','CDS']]
  def probe(u):
   r=subprocess.run(['curl.exe','--silent','--show-error','--head',u],capture_output=True,text=True,timeout=40)
   return [u,r.stdout.splitlines()[0] if r.stdout else r.stderr[:70]]
  with ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(probe,urls))
  (WORK/'scranton-historical-probes.json').write_text(json.dumps(results),encoding='utf8')
  print('\n'.join(u+' '+s for u,s in results if '200 OK' in s));sys.exit(0)
 docs=discover()
 with ThreadPoolExecutor(max_workers=6) as pool:docs=list(pool.map(cache,docs))
 (ROOT/'data/batch-b-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
