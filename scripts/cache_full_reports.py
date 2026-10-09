"""Cache full-document PDF geometry for reusable extended-metric extraction."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,hashlib,requests,pymupdf
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/metrics';WORK.mkdir(parents=True,exist_ok=True)
sources=json.loads((ROOT/'data/archive-sources.json').read_text(encoding='utf8'))
snapshot=ROOT/'.sites-runtime/metrics-existing.json'
reports=json.loads(snapshot.read_text(encoding='utf8')) if snapshot.exists() else json.loads((ROOT/'data/reports.json').read_text(encoding='utf8'))
def cache(r):
    if r['source_type']!='pdf':return None
    out=WORK/f"{r['school_id']}-{r['year']}-pages.json"
    source=next((s for s in sources if s['school_id']==r['school_id'] and s['year']==r['year']),None)
    path=ROOT/source['cache_path'] if source else ROOT/f"data/sources/{r['school_id']}-{r['year']}.pdf"
    if not path.exists():
        response=requests.get(r['source_url'].split('#')[0],timeout=60,stream=True);response.raise_for_status()
        data=bytearray()
        for chunk in response.iter_content(65536):
            data.extend(chunk)
            if len(data)>25_000_000:raise ValueError('Source exceeds 25MB')
        if not data.startswith(b'%PDF-'):raise ValueError('Source is not a PDF')
        path.write_bytes(data)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=r['sha256']:raise ValueError('File differs from the saved report; review a changed source separately')
    if out.exists():return dict(school_id=r['school_id'],year=r['year'],pages_file=out.relative_to(ROOT).as_posix())
    doc=pymupdf.open(path);pages=[]
    if len(doc)>200:raise ValueError('Source exceeds 200 pages')
    for page in doc:
        words=[dict(str=w[4],x=w[0],y=-w[3],width=w[2]-w[0]) for w in page.get_text('words',flags=pymupdf.TEXTFLAGS_WORDS & ~pymupdf.TEXT_PRESERVE_LIGATURES)]
        lines=[]
        for w in sorted(words,key=lambda w:(-w['y'],w['x'])):
            line=next((l for l in lines if abs(l['words'][0]['y']-w['y'])<3),None)
            if line is None:lines.append(dict(text='',words=[w]))
            else:line['words'].append(w)
        for l in lines:l['words'].sort(key=lambda w:w['x']);l['text']=' '.join(w['str'] for w in l['words'])
        fields=[dict(name=w.field_name,value=str(w.field_value),label=w.field_label,rect=list(w.rect)) for w in page.widgets() or [] if w.field_value is not None and str(w.field_value).strip() not in ['', 'Off']]
        pages.append(dict(page=page.number+1,text=page.get_text(sort=True),lines=lines,form_fields=fields))
    # Reuse the visually reviewed Section C OCR cache; other scanned sections remain unparsed.
    ocr=ROOT/'.sites-runtime/archive-import/clemson-2025-pages.json'
    if r['school_id']=='clemson' and r['year']==2025 and ocr.exists():
        recognized={p['page']:p for p in json.loads(ocr.read_text(encoding='utf8'))};pages=[recognized.get(p['page'],p) for p in pages]
    out.write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
    return dict(school_id=r['school_id'],year=r['year'],pages_file=out.relative_to(ROOT).as_posix())
def safe(r):
    try:return cache(r)
    except Exception as e:print('REVIEW',r['school_id'],r['year'],str(e),flush=True);return dict(school_id=r['school_id'],year=r['year'],error=str(e))
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:results=[x for x in pool.map(safe,reports) if x]
    (WORK/'manifest.json').write_text(json.dumps(results,indent=2),encoding='utf8')
    print('Full-report caches:',sum('pages_file' in r for r in results),'of',len(results),flush=True)
