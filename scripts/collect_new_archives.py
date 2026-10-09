"""Cache official Villanova, Michigan Ann Arbor and TCNJ CDS PDFs with geometry.

The manifest retains exact URLs and hashes; PDF page numbers are physical pages.
Only links explicitly identified as CDS are accepted, excluding unrelated surveys.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
import hashlib, json, re, requests, pymupdf
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.sites-runtime/new-archives'
WORK.mkdir(parents=True, exist_ok=True)
SCHOOLS = [
 ('villanova-university', 'Villanova University', 'https://www.villanova.edu/university/provost/odsdi/external-survey-reporting.html'),
 ('university-of-michigan-ann-arbor', 'University of Michigan–Ann Arbor', 'https://obp.umich.edu/campus-statistics/common-data-set/'),
 ('the-college-of-new-jersey', 'The College of New Jersey', 'https://ira.tcnj.edu/reports/common-data-set-2/'),
]

def geometry(file):
    pages = []
    for p in pymupdf.open(file):
        words = [dict(str=w[4],x=w[0],y=-w[3],width=w[2]-w[0]) for w in p.get_text('words', flags=pymupdf.TEXTFLAGS_WORDS & ~pymupdf.TEXT_PRESERVE_LIGATURES)]
        lines = []
        for w in sorted(words,key=lambda w:(-w['y'],w['x'])):
            line = next((l for l in lines if abs(l['words'][0]['y']-w['y'])<3),None)
            if line is None: lines.append(dict(text='',words=[w]))
            else: line['words'].append(w)
        for l in lines:
            l['words'].sort(key=lambda w:w['x'])
            l['text']=re.sub(r'\s+',' ',' '.join(w['str'] for w in l['words'])).strip()
        fields=[]
        for f in p.widgets() or []:
            if f.field_value is not None and str(f.field_value).strip() not in ('','Off','false'):
                fields.append(dict(name=f.field_name,value=str(f.field_value),label=f.field_label,rect=list(f.rect)))
        pages.append(dict(page=p.number+1,text='\n'.join(l['text'] for l in lines),lines=lines,form_fields=fields))
    return pages

def cache(d):
    base=f"{d['school_id']}-{d['year']}"
    file=WORK/f'{base}.pdf'
    if not file.exists():
        r=requests.get(d['url'],timeout=60);r.raise_for_status()
        assert r.content.startswith(b'%PDF-'), f"Not PDF: {d['url']}"
        file.write_bytes(r.content)
    d['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
    pages=geometry(file)
    (WORK/f'{base}-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
    (WORK/f'{base}-text.txt').write_text('\n\n'.join(f"PAGE {p['page']}\n{p['text']}" for p in pages),encoding='utf-8')
    print('Cached',base,len(pages),'pages',flush=True)
    return d

if __name__=='__main__':
    docs=[]
    for sid,name,url in SCHOOLS:
        r=requests.get(url,timeout=40)
        if sid=='villanova-university' and r.status_code==403:
            # Official archive read with the web tool; do not bypass the site's restriction.
            for year,file in [(2025,'CDS-2025-2026-v3.pdf'),(2024,'2024-2025-CDS_v2.pdf'),(2023,'CDS_2023_2024_v2.pdf')]:
                docs.append(dict(school_id=sid,school=name,index_url=url,url='https://www.villanova.edu/content/dam/villanova/provost/decision_support/'+file,title=f'Common Data Set {year}–{year+1}',year=year,source_type='pdf'))
            continue
        r.raise_for_status()
        (WORK/f'{sid}-index.html').write_text(r.text,encoding='utf-8')
        for a in BeautifulSoup(r.text,'html.parser').find_all('a',href=True):
            label=a.get_text(' ',strip=True)
            if not re.search(r'common\s*data\s*set|\bCDS\b',label,re.I):continue
            link=urljoin(r.url,a['href'])
            year=re.search(r'(19|20)\d{2}',label)
            if not year or not re.search(r'\.pdf(?:[?#]|$)',link,re.I):continue
            docs.append(dict(school_id=sid,school=name,index_url=url,url=link,title=label,year=int(year.group()),source_type='pdf'))
        print('Discovered',name,len([d for d in docs if d['school_id']==sid]),flush=True)
    assert len(docs)==43, f'Archive coverage changed: {len(docs)}'
    def safe_cache(d):
        try:return cache(d)
        except Exception as e:
            d['download_error']=str(e);print('Unavailable',d['school_id'],d['year'],str(e),flush=True);return d
    with ThreadPoolExecutor(max_workers=6) as pool: docs=list(pool.map(safe_cache,docs))
    (ROOT/'data/new-archive-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
