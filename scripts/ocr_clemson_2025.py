"""Extract Section C text/geometry from Clemson's scanned 2025 report."""
from pathlib import Path
import pymupdf, json, re, requests
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/archive-import'
WORK.mkdir(parents=True,exist_ok=True)
tessdata=ROOT/'.sites-runtime/ocr-tessdata';tessdata.mkdir(parents=True,exist_ok=True)
if not (tessdata/'eng.traineddata').exists():
    response=requests.get('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata',timeout=60);response.raise_for_status()
    (tessdata/'eng.traineddata').write_bytes(response.content)
doc=pymupdf.open(ROOT/'data/sources/clemson-2025.pdf')
pages=[]
cache=WORK/'clemson-2025-pages.json'
existing={p['page']:p for p in json.loads(cache.read_text(encoding='utf-8'))} if cache.exists() else {}
# The scanned report's Section C follows retention and precedes transfer admissions.
for i in range(13,len(doc)):
    if i+1 in existing:
        p=existing[i+1];pages.append(p)
        if re.search(r'^(?:D1|D\. TRANSFER)',p['text'],re.M):break
        continue
    page=doc[i]
    tp=page.get_textpage_ocr(language='eng',dpi=250,full=True,tessdata=str(ROOT/'.sites-runtime/ocr-tessdata'))
    words=page.get_text('words',textpage=tp)
    lines=[]
    for w in sorted(words,key=lambda w:(w[1],w[0])):
        word=dict(str=w[4],x=w[0],y=-(w[1]+w[3])/2,width=w[2]-w[0])
        line=next((l for l in lines if abs(l['words'][0]['y']-word['y'])<3),None)
        if line is None:lines.append(dict(text='',words=[word]))
        else:line['words'].append(word)
    for line in lines:
        line['words'].sort(key=lambda w:w['x']);line['text']=' '.join(w['str'] for w in line['words'])
    text='\n'.join(l['text'] for l in lines)
    pages.append(dict(page=i+1,text=text,lines=lines,form_fields=[]))
    (WORK/f'clemson2025-p{i+1}.txt').write_text(text,encoding='utf-8')
    print('OCR page',i+1,flush=True)
    if re.search(r'^(?:D1|D\. TRANSFER)',text,re.M):break
(WORK/'clemson-2025-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
