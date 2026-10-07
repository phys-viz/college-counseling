"""Discover Cornell's annual CDS sources, cache PDFs, and preserve Section C evidence."""
from pathlib import Path
import json, re, hashlib, concurrent.futures
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data' / 'sources'
CACHE.mkdir(parents=True, exist_ok=True)
INDEX = 'https://irp.cornell.edu/common-data-set'

def fetch(record):
    year, url = record
    url = url.replace('http://', 'https://').split('#')[0]
    path = CACHE / f'cornell-{year}.pdf'
    if not path.exists():
        r = requests.get(url, timeout=90); r.raise_for_status()
        path.write_bytes(r.content)
    doc = pymupdf.open(path)
    pages = []
    started = False
    for i, page in enumerate(doc):
        text = page.get_text(sort=True)
        if re.search(r'\bC\s*1\b', text):
            started = True
        if started and re.search(r'\bD\.?\s*(?:TRANSFER|Transfer)|\bD\s*1\b', text):
            break
        if started:
            widgets = [{'name':w.field_name,'value':w.field_value,'label':w.field_label,'rect':list(w.rect)} for w in page.widgets() or [] if w.field_value not in (None,'','Off')]
            pages.append({'page':i+1,'text':text,'widgets':widgets})
    result = {'school_id':'cornell','school':'Cornell University','year':year,'report_label':f'{year}–{str(year+1)[-2:]}','source_url':url,'index_url':INDEX,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pages':pages}
    (CACHE / f'cornell-{year}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{year}: {len(pages)} Section C pages, {sum(len(p["widgets"]) for p in pages)} populated form fields',flush=True)
    return result

def main():
    soup = BeautifulSoup(requests.get(INDEX,timeout=30).text,'html.parser')
    records=[]
    for li in soup.select('li'):
        match=re.search(r'Common Data Set Fall (\d{4})',li.get_text())
        if not match: continue
        pdf=next((a for a in li.select('a[href]') if '.pdf' in a['href'].lower()),None)
        if pdf: records.append((int(match[1]),urljoin(INDEX,pdf['href'])))
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        reports=list(pool.map(fetch,records))
    (ROOT/'data'/'reports-raw.json').write_text(json.dumps(sorted(reports,key=lambda x:-x['year']),ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__': main()
