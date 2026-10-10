"""Collect UF, UIUC, Rutgers New Brunswick and IU Bloomington originals.

PDF geometry is source extraction. XLSX and IU's campus/year HTML are explicit
offline adapters, not capabilities of the website's PDF importer.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlencode
import hashlib, json, re, requests, pymupdf, openpyxl
from bs4 import BeautifulSoup
from collect_new_archives import geometry
from collect_nyu import formatted

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/batch-a'
WORK.mkdir(parents=True,exist_ok=True)
SCHOOLS={
 'university-of-florida':('University of Florida','https://ir.aa.ufl.edu/reports/cds-reports/','uf'),
 'university-of-illinois-urbana-champaign':('University of Illinois Urbana-Champaign','https://dair.illinois.edu/access-data/common-data-set/','university-of-illinois-urbana-champaign'),
 'rutgers-university-new-brunswick':('Rutgers University–New Brunswick','https://oirds.rutgers.edu/ReportingCommonDataSet.html',None),
 'indiana-university-bloomington':('Indiana University Bloomington','https://iuapps.iu.edu/cds/',None),
}
SECTIONS=['A. General Information','B. Enrollment and Persistence','C. First-Time, (Freshman) Admission','D. Transfer Admission','E. Academic Offerings and Policies','F. Student Life','G. Annual Expenses','H. Financial Aid','I. Instructional Faculty and Class Size','J. Degrees Conferred']

def fetch(url,file):
 if not file.exists():
  r=requests.get(url,timeout=75);r.raise_for_status();file.write_bytes(r.content)
 return file.read_bytes()

def xlsx_pages(file):
 book=openpyxl.load_workbook(file,data_only=True)
 pages=[]
 for n,sheet in enumerate(book,1):
  if not re.match(r'^(?:CDS[-_ ]?[A-J]$|[A-J](?:\b|[ _-]))',sheet.title,re.I):continue
  dictionary=next((c.column for c in sheet[1] if c.value=='Question Number'),None)
  pos=[0]
  for c in range(1,sheet.max_column+1):pos.append(pos[-1]+sheet.column_dimensions[openpyxl.utils.get_column_letter(c)].width*7)
  lines=[]
  for row in sheet:
   if dictionary==1:
    code=str(row[0].value or '')
    match=re.fullmatch(r'([A-J])(\d{1,2})(\d{2})',code)
    if not match or row[1].value is None:continue
    section=int(match[2]);label=formatted(row[1]);answer=row[2]
    if sheet.title=='CDS-C' and section==1:
     question=int(match[3])
     if question>=20:
      region={0:'In-State',1:'Out-of-State',2:'International',3:'Unknown'}[(question-20)//3]
      label=region+' '+label
    # Matching view identifies section/question IDs; original cell rows remain below.
    if not lines or lines[-1].get('section')!=section:
     lines.append(dict(text=f'{match[1]}{section} Source question group',words=[dict(str=f'{match[1]}{section}',x=0,y=-row[0].row*20,width=30)],section=section))
    words=[dict(str=label,x=0,y=-row[1].row*20,width=500,cell=f'{sheet.title}!{row[1].coordinate}')]
    if answer.value is not None:words.append(dict(str=formatted(answer),x=600,y=-answer.row*20,width=100,cell=f'{sheet.title}!{answer.coordinate}'))
    lines.append(dict(text=' '.join(w['str'] for w in words),words=words,section=section));continue
   words=[dict(str=formatted(c),x=pos[c.column-1],y=-c.row*20,width=pos[c.column]-pos[c.column-1],cell=f'{sheet.title}!{c.coordinate}') for c in row if c.value is not None and (not dictionary or c.column<dictionary)]
   if words:lines.append(dict(text=' '.join(w['str'] for w in words),words=words))
  pages.append(dict(page=n,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[],worksheet=sheet.title,source_rows=[' | '.join(f'{sheet.title}!{c.coordinate}={formatted(c)}' for c in row if c.value is not None) for row in sheet if any(c.value is not None for c in row)]))
 return pages

def html_page(raw,n,url):
 soup=BeautifulSoup(raw,'html.parser')
 content=soup.select_one('.content-div')
 assert content is not None,'IU source content missing'
 # Keep source table cells and their columns; preserve textual rows and marks.
 lines=[];y=0
 for node in content.find_all(['tr','p','h1','h2','h3']):
  if node.name!='tr' and node.find_parent('table'):continue
  if node.name=='tr':
   cells=node.find_all(['td','th'],recursive=False)
   widths=[]
   for c in cells:
    m=re.search(r'width:\s*([\d.]+)(%|px)',c.get('style',''))
    widths.append(float(m[1])*(8 if m[2]=='%' else 1) if m else 800/max(1,len(cells)))
   # Normalize table total to a common scale. PDF parser needs only columns.
   scale=800/max(sum(widths),1);x=0;words=[]
   for c,width in zip(cells,widths):
    txt=re.sub(r'\s+',' ',c.get_text(' ',strip=True)).strip()
    if txt:words.append(dict(str=txt,x=x,y=-y,width=width*scale,html_cell=str(c)))
    x+=width*scale
  else:
   txt=re.sub(r'\s+',' ',node.get_text(' ',strip=True)).strip()
   words=[dict(str=txt,x=0,y=-y,width=800)] if txt else []
  if words:lines.append(dict(text=' '.join(w['str'] for w in words),words=words));y+=20
 return dict(page=n,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[],source_url=url,source_section=SECTIONS[n-1])

def iu_collect(year):
 sid='indiana-university-bloomington';name,index,_=SCHOOLS[sid]
 pages=[];section_sources=[]
 for n,section in enumerate(SECTIONS,1):
  url=index+'?'+urlencode(dict(p='index',i='home',campus='Bloomington',section=section,year=year))
  file=WORK/f'{sid}-{year}-{n}.html';raw=fetch(url,file)
  response_dom=BeautifulSoup(raw,'html.parser')
  selected=response_dom.select_one('select[name="year"] option[selected]')
  campus=response_dom.select_one('.menu-button-campus-selected')
  assert selected and selected.get('value')==str(year),f'IU year selection failed: {year} {section}'
  assert campus and campus.get('value')=='Bloomington',f'IU campus selection failed: {year} {section}'
  p=html_page(raw,n,url);pages.append(p)
  section_sources.append(dict(section=section,url=url,sha256=hashlib.sha256(raw).hexdigest()))
 # A response selected for another year/campus must not silently populate this one.
 assert 'Indiana University Bloomington' in pages[0]['text'],year
 assert re.search(r'\bFall\s+'+str(year)+r'\b',pages[2]['text'],re.I),year
 sha=hashlib.sha256(b''.join(bytes.fromhex(s['sha256']) for s in section_sources)).hexdigest()
 base=f'{sid}-{year}'
 (WORK/f'{base}-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
 (WORK/f'{base}-text.txt').write_text('\n\n'.join(f"SECTION {p['source_section']}\n{p['text']}" for p in pages),encoding='utf-8')
 print('Cached IU',year,flush=True)
 return dict(school_id=sid,school=name,index_url=index,url=section_sources[2]['url'],year=year,title=f'IU Bloomington Common Data Set {year}–{year+1}',source_type='html',sha256=sha,section_sources=section_sources,provenance='official campus-and-year-specific HTML; composite hash of A–J response hashes',usable_report=True)

def cache_doc(d):
 base=f"{d['school_id']}-{d['year']}"
 file=WORK/f"{base}.{d['source_type']}"
 raw=fetch(d['url'],file)
 if d['source_type']=='pdf':
  assert raw.startswith(b'%PDF-'),d['url'];pages=geometry(file)
 else:
  assert raw.startswith(b'PK'),d['url'];pages=xlsx_pages(file)
 d['sha256']=hashlib.sha256(raw).hexdigest();d['usable_report']=True
 if 'api.collegedata.fyi/' in d['url']:assert d['sha256']==d['url'].rsplit('/',1)[1].split('.')[0],'Archived bytes changed'
 (WORK/f'{base}-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
 (WORK/f'{base}-text.txt').write_text('\n\n'.join(f"PAGE {p['page']} {p.get('worksheet','')}\n{p['text']}" for p in pages),encoding='utf-8')
 print('Cached',base,d['source_type'],len(pages),flush=True);return d

def discover():
 docs=[]
 for sid,(name,index,slug) in SCHOOLS.items():
  raw=fetch(index,WORK/f'{sid}-index.html');soup=BeautifulSoup(raw,'html.parser')
  if sid=='indiana-university-bloomington':continue
  for a in soup.find_all('a',href=True):
   link=urljoin(index,a['href']);label=a.get_text(' ',strip=True)
   if sid=='rutgers-university-new-brunswick' and not re.search(r'New\s*Brunswick',label,re.I):continue
   if not re.search(r'\.(pdf|xlsx)(?:[?#]|$)',link,re.I):continue
   if sid!='rutgers-university-new-brunswick' and not re.fullmatch(r'\s*(?:19|20)\d{2}\s*[-–]\s*\d{2,4}\s*',label):continue
   year=re.search(r'(19|20)\d{2}',label+' '+link)
   if not year:continue
   docs.append(dict(school_id=sid,school=name,index_url=index,url=link,title=label,year=int(year[0]),source_type=re.search(r'\.(pdf|xlsx)(?:[?#]|$)',link,re.I)[1].lower(),provenance='official publisher file'))
  if slug:
   u='https://www.collegedata.fyi/schools/'+slug
   s=BeautifulSoup(fetch(u,WORK/f'{sid}-archive.html'),'html.parser')
   years=sorted({int(re.fullmatch('/schools/'+slug+r'/((?:19|20)\d{2})-\d{2}',a['href'])[1]) for a in s.find_all('a',href=True) if re.fullmatch('/schools/'+slug+r'/((?:19|20)\d{2})-\d{2}',a['href'])})
   for year in years:
    if any(d['school_id']==sid and d['year']==year for d in docs):continue
    archive=f'{u}/{year}-{str(year+1)[-2:]}'
    raw=fetch(archive,WORK/f'{sid}-{year}-archive.html');s=BeautifulSoup(raw,'html.parser')
    link=next(a['href'] for a in s.find_all('a',href=True) if '/storage/v1/object/public/sources/' in a['href'])
    official={2021:'https://data-apps.ir.aa.ufl.edu/public/cds/CDS_2021-22_UFMAIN.pdf',2022:'https://data-apps.ir.aa.ufl.edu/public/cds/CDS_2022-2023_UFMAIN_Post.pdf'}.get(year) if sid=='university-of-florida' else None
    if sid=='university-of-florida' and year in [1997,2000,2001,2002,2003,2004,2005,2006]:official=f'https://data-apps.ir.aa.ufl.edu/public/cds/cds{year}-{str(year+1)[-2:]}.pdf'
    if official:
     try:
      rr=requests.get(official,timeout=40)
      if rr.status_code==200 and rr.content.startswith(b'%PDF-'):link=official
     except requests.RequestException:pass
    docs.append(dict(school_id=sid,school=name,index_url=index,url=link,title=f'{name} Common Data Set {year}–{year+1}',year=year,source_type=link.rsplit('.',1)[-1],archive_url=archive,official_url=official,provenance='official publisher file' if link==official else 'archived institution-authored original from CollegeData.fyi; not archive-generated metrics'))
 # These publisher originals are still public but absent from today's short index
 # and from the archive inventory. Both were independently located in web search.
 sid='university-of-florida';name,index,_=SCHOOLS[sid]
 for year in [1998,1999]:
  docs.append(dict(school_id=sid,school=name,index_url=index,url=f'https://data-apps.ir.aa.ufl.edu/public/cds/cds{year}-{str(year+1)[-2:]}.pdf',title=f'University of Florida Common Data Set {year}–{year+1}',year=year,source_type='pdf',provenance='official historical publisher file, located outside current archive index'))
 return docs

if __name__=='__main__':
 docs=discover()
 def safe(d):
  try:return cache_doc(d)
  except Exception as e:d['usable_report']=False;d['exclusion_reason']=str(e);print('Unavailable',d['school_id'],d['year'],str(e),flush=True);return d
 with ThreadPoolExecutor(6) as pool:docs=list(pool.map(safe,docs))
 with ThreadPoolExecutor(5) as pool:docs+=list(pool.map(iu_collect,range(2000,2026)))
 supplemental=dict(school_id='rutgers-university-new-brunswick',school=SCHOOLS['rutgers-university-new-brunswick'][0],index_url=SCHOOLS['rutgers-university-new-brunswick'][1],url='https://admissions.rutgers.edu/sites/default/files/2025-07/2025%20Desk%20Reference%20Card%20FINAL%20QR.pdf',year=2025,title='Rutgers 2025 undergraduate admissions desk reference card',source_type='pdf',provenance='official supplemental admitted-student profile, not Common Data Set')
 supplemental=cache_doc(supplemental)
 supplemental['usable_report']=False
 supplemental['exclusion_reason']='Supplemental admitted-student midranges by academic school and multiple campuses; no New Brunswick overall C1 counts and a different population from CDS enrolled-student C9. Not imported as a comparable annual CDS record.'
 docs.append(supplemental)
 # A cited older publisher URL now serves the site's HTML, not an XLS original.
 legacy='https://www.dmi.illinois.edu/stuenr/misc/cds_2016_2017.xls'
 raw=fetch(legacy,WORK/'illinois-2016-unavailable-response.html')
 if raw.lstrip().lower().startswith((b'<!doctype html',b'<html')):
  docs.append(dict(school_id='university-of-illinois-urbana-champaign',school=SCHOOLS['university-of-illinois-urbana-champaign'][0],year=2016,title='Illinois 2016–2017 legacy CDS URL',index_url=SCHOOLS['university-of-illinois-urbana-champaign'][1],url=legacy,source_type='xls',usable_report=False,response_sha256=hashlib.sha256(raw).hexdigest(),exclusion_reason='Legacy publisher XLS URL returns HTML, not the original workbook. No data imported; earlier files require a genuine original.'))
 (ROOT/'data/batch-a-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('TOTAL',len(docs),flush=True)
