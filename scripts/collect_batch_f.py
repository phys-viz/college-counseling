"""Cache original JMU, Georgia, and GW CDS documents without changing seed data.

PDF geometry is shared with the source-reviewed C collector. JMU's newer DOCX
files use a scoped original XML/table adapter; source indexes identify actual
body paragraphs and tables, not physical PDF pages. Historical institution
indexes and original URLs are recorded explicitly in batch-f-sources.json.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
import sys,requests,re,json,hashlib,zipfile
from xml.etree import ElementTree as E
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from collect_batch_c import geometry
WORK=ROOT/'.sites-runtime/batch-f'
WORK.mkdir(parents=True,exist_ok=True)
HEADERS={'User-Agent':'Mozilla/5.0','Accept':'*/*'}
SCHOOLS=[
 ('james-madison-university','James Madison University','https://www.jmu.edu/pair/ir/common-data-set/index.shtml'),
 ('university-of-georgia','University of Georgia','https://oir.uga.edu/categorized-reports/external-reports/oir-survey-submission/common-data-set/'),
 ('george-washington-university','George Washington University','https://irp.gwu.edu/common-data-set')]
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def docx_pages(file):
 with zipfile.ZipFile(file) as z:xml=z.read('word/document.xml')
 # The exact original XML is retained beside the document. Metric evidence
 # points to a table/row or body paragraph; page 3 means Section C only.
 Path(str(file.with_suffix(''))+'-document.xml').write_bytes(xml)
 root=E.fromstring(xml);body=root.find('w:body',NS)
 sections={};section=None;ordinal=0
 table_indexes={id(node):i for i,node in enumerate(root.findall('.//w:tbl',NS),1)}
 def visible_text(node,skip_tables=False):
  # Word layout coordinates and alternate fallback branches are not answers.
  if node.tag.endswith('}Fallback'):return ''
  if skip_tables and node.tag=='{'+NS['w']+'}tbl':return ''
  if node.tag in ['{'+NS['w']+'}t','{http://schemas.openxmlformats.org/drawingml/2006/main}t']:return node.text or ''
  if node.tag in ['{'+NS['w']+'}tab','{'+NS['w']+'}br']:return ' '
  result=''.join(visible_text(child,skip_tables) for child in node)
  return result+' ' if node.tag=='{'+NS['w']+'}p' else result
 def value(node):return re.sub(r'\s+',' ',visible_text(node,True)).strip()
 def nested_tables(node):
  for child in node:
   if child.tag.endswith('}Fallback'):continue
   if child.tag=='{'+NS['w']+'}tbl':yield child
   else:yield from nested_tables(child)
 def add(words,source):
  nonlocal section,ordinal
  txt=' '.join(w['str'] for w in words)
  m=re.match(r'^([A-J])(?:\.\s+[A-Z]|-?\d+\b)',txt)
  if m:section=m[1]
  if not section:return
  ordinal+=1
  for w in words:w['y']=-ordinal*20
  sections.setdefault(section,[]).append(dict(text=txt,words=words,source=source))
 def add_table(node,paragraph,parent=None):
  table=table_indexes[id(node)]
  for row,tr in enumerate(node.findall('w:tr',NS),1):
   words=[];column=1;nested=[]
   for tc in tr.findall('w:tc',NS):
    span=tc.find('w:tcPr/w:gridSpan',NS);span=int(span.attrib.get('{'+NS['w']+'}val','1')) if span is not None else 1
    txt=value(tc)
    if txt:words.append(dict(str=txt,x=column*130,width=span*130-10))
    nested.extend(nested_tables(tc));column+=span
   source=dict(table=table,row=row,paragraph=paragraph)
   if parent:source['parent_table_row']=parent
   if words:add(words,source)
   # Word frequently puts a complete answer table inside a single outer
   # cell. Flattening it mixes rank-band labels/instructions with answers.
   for child in nested:add_table(child,paragraph,dict(table=table,row=row))
 for paragraph,node in enumerate(body,1):
  tag=node.tag.split('}')[-1]
  if tag=='p':
   txt=value(node)
   if txt:add([dict(str=txt,x=0,width=min(700,len(txt)*4))],dict(paragraph=paragraph))
   for child in nested_tables(node):add_table(child,paragraph)
  elif tag=='tbl':
   add_table(node,paragraph)
 return [dict(page=ord(s)-64,source_label=f'DOCX Section {s}',xml_sha256=hashlib.sha256(xml).hexdigest(),text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[]) for s,lines in sections.items()]
def discover():
 docs=[]
 for sid,school,index in SCHOOLS:
  r=requests.get(index,headers=HEADERS,timeout=30);(WORK/f'{sid}-index.html').write_bytes(r.content)
  if sid=='university-of-georgia' and r.status_code!=200:
   # The primary institutional archive publicly indexes Fall 2003-2025,
   # but returns HTTP403 here. Its original institution-hosted PDFs remain
   # publicly accessible through the former WordPress upload directory.
   print('UGA archive status',r.status_code)
   for y in range(2003,2026):docs.append(dict(school_id=sid,school=school,index_url=index,url=f'https://oir.uga.edu/wp-content/uploads/UGA_CDS_{y}-{y+1}.pdf',title=f'University of Georgia Common Data Set {y}-{y+1}',year=y,source_type='pdf',discovery_note='Official CDS archive lists this Fall year; archive HTML returned HTTP403, original institution-hosted PDF independently verified'))
   continue
  r.raise_for_status()
  for a in BeautifulSoup(r.content,'html.parser').find_all('a',href=True):
   u=urljoin(r.url,a['href']);ext=re.search(r'\.(pdf|docx)(?:[?#]|$)',u,re.I)
   if not ext or not re.search(r'cds|common.data.set',u+' '+a.get_text(' ',strip=True),re.I):continue
   label=a.get_text(' ',strip=True);year=re.search(r'20\d{2}',label) or re.search(r'20\d{2}',a['href'])
   if year:docs.append(dict(school_id=sid,school=school,index_url=index,url=u,title=label,year=int(year[0]),source_type=ext[1].lower()))
 return docs
def download(d):
 try:
  base=WORK/f'{d["school_id"]}-{d["year"]}';file=Path(str(base)+'.'+d['source_type'])
  if not file.exists():
   r=requests.get(d['url'],headers=HEADERS,timeout=65);r.raise_for_status();d['url']=r.url;file.write_bytes(r.content)
  if d['source_type']=='pdf':assert file.read_bytes().startswith(b'%PDF-');pages=geometry(file)
  else:
   assert zipfile.is_zipfile(file);pages=docx_pages(file)
   d['xml_sha256']=pages[0]['xml_sha256']
  d['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
  d.pop('download_error',None)
  Path(str(base)+'-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
  Path(str(base)+'-text.txt').write_text('\n\n'.join(f'PAGE {p["page"]}\n'+p['text'] for p in pages),encoding='utf-8')
  print('Cached',d['school_id'],d['year'],d['source_type'],flush=True)
 except Exception as e:d['download_error']=str(e);print('Failed',d['school_id'],d['year'],str(e),flush=True)
 return d
if __name__=='__main__':
 # --manifest reproduces exact already-reviewed sources, including archived
 # originals. Discovery is a separate action and cannot substitute sources.
 docs=json.loads((ROOT/'data/batch-f-sources.json').read_text(encoding='utf-8')) if '--manifest' in sys.argv else discover()
 if '--manifest' not in sys.argv and (ROOT/'data/batch-f-sources.json').exists():
  known={(d['school_id'],d['year']) for d in docs}
  docs.extend(d for d in json.loads((ROOT/'data/batch-f-sources.json').read_text(encoding='utf-8')) if (d['school_id'],d['year']) not in known)
 with ThreadPoolExecutor(max_workers=5) as pool:docs=list(pool.map(download,docs))
 docs.sort(key=lambda d:(d['school_id'],d['year']))
 (ROOT/'data/batch-f-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Found',len(docs),'source years')
