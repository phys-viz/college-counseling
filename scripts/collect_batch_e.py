"""Collect genuine historical CDS originals for Alabama, UNC Charlotte, and Delaware.

PDFs are preferred except Charlotte's incomplete 2022 PDF.
Delaware's select/option archive is read alongside ordinary links. Original
geometry, form fields, worksheets and SHA-256 are retained. Two Delaware
sources need local OCR; the browser importer does not perform that adapter.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, unquote
import hashlib, json, re, requests, subprocess, sys
from bs4 import BeautifulSoup
from collect_batch_b import fetch as source_fetch, worksheet_pages
from collect_new_archives import geometry

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/batch-e'
WORK.mkdir(parents=True,exist_ok=True)
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf8')
SCHOOLS=[
 ('university-of-alabama','University of Alabama','https://oira.ua.edu/test/reports/common-data-set/'),
 ('university-of-north-carolina-at-charlotte','University of North Carolina at Charlotte','https://ir.charlotte.edu/home/common-data-set/'),
 ('university-of-delaware','University of Delaware','https://ire.udel.edu/common-data-set/'),
]

def fetch(url):
 try:return source_fetch(url)
 except (requests.exceptions.ConnectionError,requests.exceptions.HTTPError):
  # Windows curl uses the system trust store; no certificate checks are disabled.
  temporary=WORK/('fetch-'+hashlib.sha256(url.encode()).hexdigest()[:16]+'.bin')
  result=subprocess.run(['curl.exe','-f','-L','--max-time','45','-sS',url,'-o',str(temporary)],capture_output=True,text=True)
  if result.returncode:raise RuntimeError(result.stderr.strip())
  raw=temporary.read_bytes();temporary.unlink();return raw,url

def fall_year(label,url):
 # Upload path dates are not report years. Prefer visible labels and filenames.
 filename=unquote(Path(urlparse(url).path).name)
 for value in [label,filename]:
  match=re.search(r'\b((?:19|20)\d{2})\s*[-_/–]\s*(?:\d{2}(?!\d)|(?:19|20)\d{2}(?!\d))',value)
  if match:return int(match[1])
  match=re.search(r'\b(\d{2})\s*[-_–]\s*(\d{2})\b',value)
  if match and (int(match[1])+1)%100==int(match[2]):return (1900 if int(match[1])>=90 else 2000)+int(match[1])
  match=re.search(r'CDS[_ -]?((?:19|20)\d{2})',value,re.I)
  if match:return int(match[1])
 return None

def catalog():
 docs=[]
 for sid,name,index in SCHOOLS:
  raw,final=fetch(index);(WORK/f'{sid}-index.html').write_bytes(raw)
  soup=BeautifulSoup(raw,'html.parser')
  for node in soup.select('a[href],option[value]'):
   href=urljoin(final,node.get('href') or node.get('value',''));label=node.get_text(' ',strip=True)
   match=re.search(r'\.(pdf|xlsx?)(?:[?#]|$)',href,re.I)
   if not match or not re.search(r'CDS|common.?data.?set',label+' '+href,re.I):continue
   year=fall_year(label,href)
   if year is None:continue
   # The historical publisher hostname moved from www to www1; use the live original.
   if sid=='university-of-delaware' and 'www.udel.edu/IR/' in href:href=href.replace('http://www.udel.edu/','https://www1.udel.edu/')
   docs.append(dict(school_id=sid,school=name,year=year,url=href,index_url=index,title=label,source_type=match[1].lower(),provenance='official publisher original'))
  print(name,'available link years',sorted({d['year'] for d in docs if d['school_id']==sid}),flush=True)
 # Alabama's current hub begins in 2015. These institution-authored historical originals remain live.
 for year in range(2007,2015):
  token=f'{year%100:02}{(year+1)%100:02}'
  filename=token+'_cds'+('_new' if year==2010 else '')+'.pdf'
  docs.append(dict(school_id=SCHOOLS[0][0],school=SCHOOLS[0][1],year=year,url=f'https://oira.ua.edu/d/sites/all/files/reports{(year+1)%100:02}/{filename}',index_url=SCHOOLS[0][2],title=f'Common Data Set {year}-{str(year+1)[-2:]}',source_type='pdf',provenance='official publisher historical original; no longer linked on current hub'))
 selected=[];seen=set();excluded=[]
 for d in sorted(docs,key=lambda d:(d['school_id'],-d['year'],d['source_type']!='pdf')):
  key=(d['school_id'],d['year'])
  if d['school_id']==SCHOOLS[1][0] and d['year']==2022 and d['source_type']=='pdf':
   d['excluded_reason']='Only two pages; Section C is absent'
   excluded.append(d);continue
  if key in seen:continue
  seen.add(key);selected.append(d)
 assert len(selected)==69,('Archive coverage changed; review all newly available or removed years',len(selected))
 return selected+excluded

def ocr_pages(path,year):
 import pymupdf
 name=f'university-of-delaware-{year}-ocr-pages.json'
 cache=WORK/name
 if cache.exists():return json.loads(cache.read_text(encoding='utf8'))
 tessdata=ROOT/'.sites-runtime/ocr-tessdata';tessdata.mkdir(parents=True,exist_ok=True)
 model=tessdata/'eng.traineddata'
 if not model.exists():
  raw,_=fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata');model.write_bytes(raw)
 doc=pymupdf.open(path);pages=[]
 for i in (range(4,8) if year==1997 else range(12,24)):
  p=doc[i];tp=p.get_textpage_ocr(language='eng',dpi=300,full=True,tessdata=str(tessdata))
  words=[dict(str=w[4],x=w[0],y=-(w[1]+w[3])/2,width=w[2]-w[0]) for w in p.get_text('words',textpage=tp)]
  lines=[]
  for w in sorted(words,key=lambda w:(-w['y'],w['x'])):
   line=next((l for l in lines if abs(l['words'][0]['y']-w['y'])<3),None)
   if line is None:lines.append(dict(text='',words=[w]))
   else:line['words'].append(w)
  for line in lines:
   line['words'].sort(key=lambda w:w['x']);line['text']=' '.join(w['str'] for w in line['words'])
  pages.append(dict(page=i+1,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=[],offline_ocr='PyMuPDF Tesseract English 300 dpi; original source retained'))
 cache.write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
 return pages

def cache(d):
 sid,year=d['school_id'],d['year']
 base=f'{sid}-{year}'
 if sid==SCHOOLS[0][0] and year<2015:base+='-revised' if year==2010 else '-legacy'
 if sid==SCHOOLS[2][0]:base+='-official'
 if d.get('excluded_reason'):base+='-excluded-pdf'
 d['cache_key']=base;file=WORK/f'{base}.{d["source_type"]}'
 if not file.exists():
  raw,final=fetch(d['url'])
  if not raw.startswith(b'%PDF') and raw[:4] not in [b'PK\x03\x04',b'\xd0\xcf\x11\xe0']:raise ValueError(f'Publisher returned a wrapper instead of the source file: {d["url"]}')
  file.write_bytes(raw)
  if final!=d['url']:d['resolved_url']=final
 d['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
 pages=geometry(file) if d['source_type']=='pdf' else worksheet_pages(file,d['source_type'])
 (WORK/f'{base}-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
 (WORK/f'{base}-text.txt').write_text('\n\n'.join(f"PAGE {p['page']}\n{p['text']}" for p in pages),encoding='utf8')
 d['usable_report']=not bool(d.get('excluded_reason'))
 if sid==SCHOOLS[2][0] and year in [1997,2024]:
  ocr=ocr_pages(file,year);known={p['page'] for p in ocr}
  combined=sorted([p for p in pages if p['page'] not in known]+ocr,key=lambda p:p['page'])
  d['normalization_cache_key']=base+'-normalized'
  (WORK/f'{d["normalization_cache_key"]}-pages.json').write_text(json.dumps(combined,ensure_ascii=False),encoding='utf8')
  d['offline_adapter']='Local Section C OCR: image-only 1997 PDF or corrupt 2024 font mappings; original PDF text/geometry and OCR output both retained'
 print('Cached',base,len(pages),'pages/worksheets',flush=True)
 return d

if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=6) as pool:docs=list(pool.map(cache,catalog()))
 (ROOT/'data/batch-e-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print('Collected',sum(d['usable_report'] for d in docs),'genuine reports and',sum(not d['usable_report'] for d in docs),'excluded publisher files')
