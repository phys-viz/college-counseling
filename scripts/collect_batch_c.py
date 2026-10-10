"""Cache the public institution-authored CDS archives for batch C.

UMD's original workbook cells are preserved; PDF geometry/form fields use the
same source page convention as normalizePDF. No authentication or email used.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse
import hashlib, json, re, requests, pymupdf
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.sites-runtime/batch-c'
WORK.mkdir(parents=True, exist_ok=True)
SCHOOLS = [
 ('duquesne-university','Duquesne University','https://www.duq.edu/about/departments-and-offices/finance-and-business/planning-budgeting-and-institutional-research/common-data-set.php'),
 ('university-of-notre-dame','University of Notre Dame','https://iris.nd.edu/institutional-research/common-data-set-cds/'),
 ('lehigh-university','Lehigh University','https://data.lehigh.edu/common-data-set'),
 ('university-of-maryland-college-park','University of Maryland, College Park','https://irpa.umd.edu/InstitutionalData/cds.html'),
 ('boston-university','Boston University','https://www.bu.edu/asir/bu-facts/common-data-set/'),
]
LEHIGH_HTML = {
 2001:('20151024122345',3),2002:('20060915055244',3),
 2003:('20060915060020',4),2004:('20060915055409',4),
 2005:('20151024122102',4),2006:('20151017135658',4),
 2008:('20151024122216',4),2009:('20151017140156',4),
 2010:('20151017135609',4),2011:('20151024122800',4),
 2012:('20151023110901',3),2013:('20160313032652',3),
}
# Historical coverage note: the original 2007 CDS existed, but its archived
# institution-authored XLS and Section C sheet004 URLs returned HTTP 404.
# Other tab paths and original workbook URLs were also attempted; the archive
# intermittently refused connections. No secondary summary was substituted.
# 1998-2000 originals could not be retrieved either. The current official site
# posts 2014 onward; the available original archived C worksheets above add
# 2001-2013 except 2007. Unfilled enrollment totals remain genuine gaps.

def html_geometry(file):
 soup=BeautifulSoup(file.read_bytes(),'html.parser');lines=[]
 for row,tr in enumerate(soup.find_all('tr'),1):
  words=[];column=0
  for c in tr.find_all(['td','th'],recursive=False):
   span=int(c.get('colspan',1));text=re.sub(r'\s+',' ',c.get_text(' ',strip=True)).strip()
   if text:words.append(dict(str=text,x=column*130,y=-row*20,width=span*130-10))
   column+=span
  if words:lines.append(dict(text=' '.join(w['str'] for w in words),words=words))
 return [dict(page=3,worksheet='CDS-C',text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[])]

def geometry(file):
 pages=[]
 for p in pymupdf.open(file):
  words=[dict(str=w[4],x=w[0],y=-w[3],width=w[2]-w[0]) for w in p.get_text('words',flags=pymupdf.TEXTFLAGS_WORDS & ~pymupdf.TEXT_PRESERVE_LIGATURES)]
  lines=[]
  for w in sorted(words,key=lambda w:(-w['y'],w['x'])):
   line=next((l for l in lines if abs(l['words'][0]['y']-w['y'])<3),None)
   if line is None:lines.append(dict(text='',words=[w]))
   else:line['words'].append(w)
  for l in lines:
   l['words'].sort(key=lambda w:w['x']);l['text']=re.sub(r'\s+',' ',' '.join(w['str'] for w in l['words'])).strip()
  fields=[dict(name=f.field_name,value=str(f.field_value),label=f.field_label,rect=list(f.rect)) for f in p.widgets() or [] if f.field_value is not None and str(f.field_value).strip() not in ('','Off','false')]
  pages.append(dict(page=p.number+1,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=fields))
 return pages

def workbook(file):
 sheets=[]
 if file.suffix=='.xls':
  import xlrd
  book=xlrd.open_workbook(file,formatting_info=True)
  for s in book.sheets():
   cells=[dict(row=i+1,column=j+1,value=s.cell_value(i,j),number_format=book.format_map[book.xf_list[s.cell_xf_index(i,j)].format_key].format_str) for i in range(s.nrows) for j in range(s.ncols) if s.cell_value(i,j)!='']
   sheets.append(dict(name=s.name,cells=cells))
 else:
  import openpyxl
  book=openpyxl.load_workbook(file,data_only=True)
  for s in book:
   cells=[dict(row=c.row,column=c.column,value=c.value,number_format=c.number_format) for row in s for c in row if c.value is not None]
   sheets.append(dict(name=s.title,cells=cells))
 return sheets

def cache(d):
 base=f"{d['school_id']}-{d['year']}"
 ext=d['source_type'];file=WORK/f'{base}.{ext}'
 if not file.exists():
  response=requests.get(d.get('download_url',d['url']),timeout=100);response.raise_for_status()
  if ext=='pdf':assert response.content.startswith(b'%PDF-'),f"Not PDF: {d['url']}"
  file.write_bytes(response.content)
 d['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
 if ext in ['pdf','html']:
  pages=geometry(file) if ext=='pdf' else html_geometry(file)
  if ext=='html':assert re.search(fr'\b(?:Fall|fall)\s+{d["year"]}\b',pages[0]['text']) and 'who applied' in pages[0]['text'],'Historical HTML must contain the original year and C1 questions'
  (WORK/f'{base}-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
  (WORK/f'{base}-text.txt').write_text('\n\n'.join(f"PAGE {p['page']}\n{p['text']}" for p in pages),encoding='utf-8')
 else:
  sheets=workbook(file)
  (WORK/f'{base}-sheets.json').write_text(json.dumps(sheets,ensure_ascii=False,default=str),encoding='utf-8')
 print('Cached',base,ext,flush=True)
 return d

def discover():
 docs=[]
 for sid,name,index in SCHOOLS:
  urls=[index]+([index+'cds-archive/'] if sid=='boston-university' else [])
  for pageurl in urls:
   response=requests.get(pageurl,timeout=60);response.raise_for_status();html=response.text
   (WORK/f'{sid}-{len(docs)}-index.html').write_text(html,encoding='utf-8')
   soup=BeautifulSoup(html,'html.parser')
   if sid=='university-of-notre-dame':
    folder=next(urljoin(response.url,a['href']) for a in soup.find_all('a',href=True) if 'drive.google.com/drive/folders/' in a['href'])
    drive=requests.get(folder,timeout=60);drive.raise_for_status()
    (WORK/'notre-dame-drive.html').write_text(drive.text,encoding='utf-8')
    # Public folder metadata associates each file ID with its exact PDF title.
    pairs=re.findall(r'\[\[null,"([A-Za-z0-9_-]{20,})"\],null,null,null,"application/pdf".*?"(CDS[^"<>]*\.pdf)"',drive.text)
    for fid,title in dict(pairs).items():
     year=re.search(r'(?:19|20)\d{2}',title)
     if year:docs.append(dict(school_id=sid,school=name,index_url=index,url=f'https://drive.google.com/file/d/{fid}/view',download_url=f'https://drive.google.com/uc?export=download&id={fid}',folder_url=folder,title=title,year=int(year.group()),source_type='pdf'))
    continue
   candidates=list(soup.find_all('a',href=True))
   if sid=='university-of-maryland-college-park':candidates+=soup.find_all('option',value=True)
   for a in candidates:
    label=a.get_text(' ',strip=True);href=a.get('href',a.get('value',''));link=urljoin(response.url,href)
    if not re.search(r'common\s*data\s*set|\bCDS\b',label if a.name=='a' else href,re.I):continue
    ext=re.search(r'\.(pdf|xlsx|xls)(?:[?#]|$)',link,re.I)
    year=re.search(r'(?:19|20)\d{2}',label) or re.search(r'(?:19|20)\d{2}',href)
    if not ext or not year:continue
    docs.append(dict(school_id=sid,school=name,index_url=index,url=link,title=label,year=int(year.group()),source_type=ext[1].lower()))
 # A retired official Duquesne PDF survives as an exact institution-authored
 # original. The working archive URL and its content hash identify those bytes.
 archive='https://www.collegedata.fyi/schools/duquesne-university/2018-19'
 h=BeautifulSoup(requests.get(archive,timeout=45).text,'html.parser')
 link=next(a['href'] for a in h.find_all('a',href=True) if '/storage/v1/object/public/sources/' in a['href'])
 docs.append(dict(school_id='duquesne-university',school='Duquesne University',index_url=SCHOOLS[0][2],url=link,title='Duquesne University Common Data Set 2018-2019',year=2018,source_type='pdf',archive_url=archive,official_url='https://www.duq.edu/documents/institutionalresearch/cds-2018-2019.pdf',provenance='exact archived Duquesne-authored original from CollegeData.fyi'))
 for year,(snapshot,number) in LEHIGH_HTML.items():
  original=f'http://www.lehigh.edu/~oir/cds/lucds{year}_files/sheet{number:03d}.htm'
  docs.append(dict(school_id='lehigh-university',school='Lehigh University',index_url=SCHOOLS[2][2],url=f'https://web.archive.org/web/{snapshot}id_/{original}',title=f'Lehigh University Common Data Set {year}-{year+1} Section C',year=year,source_type='html',official_url=original,provenance='archived Lehigh-authored original Section C Excel-export HTML; remaining historical tabs could not be retrieved'))
 docs=list({(d['school_id'],d['year']):d for d in docs}.values())
 return sorted(docs,key=lambda d:(d['school_id'],d['year']))

if __name__=='__main__':
 docs=discover()
 for sid,_,_ in SCHOOLS:print('Coverage',sid,[d['year'] for d in docs if d['school_id']==sid],flush=True)
 def safe(d):
  try:return cache(d)
  except Exception as e:d['download_error']=str(e);print('Unavailable',d['school_id'],d['year'],str(e),flush=True);return d
 with ThreadPoolExecutor(max_workers=6) as pool:docs=list(pool.map(safe,docs))
 (ROOT/'data/batch-c-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
