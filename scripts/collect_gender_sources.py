"""Re-read original cached/saved report bytes for source-backed gender enrichment."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,requests
from collect_new_archives import geometry
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/gender-sources';WORK.mkdir(parents=True,exist_ok=True)
def collect(r):
    if r['source_type']!='pdf':return
    sid,y=r['school_id'],r['year'];name=f'{sid}-{y}'
    matches=list((ROOT/'data/sources').glob(f'{name}.pdf'))
    if sid=='new-york-university':matches=[ROOT/f'.sites-runtime/nyu/nyu-{y}.pdf']
    file=next((p for p in matches if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256']),WORK/f'{name}.pdf')
    try:
        if not file.exists():
            response=requests.get(r['source_url'],timeout=45);response.raise_for_status();file.write_bytes(response.content)
        assert hashlib.sha256(file.read_bytes()).hexdigest()==r['sha256'],'Saved source hash differs; no enrichment applied'
        pages=geometry(file)
        (WORK/f'{name}-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
        print('Source matched',name,flush=True)
    except Exception as e:print('Source unavailable',name,str(e),flush=True)
if __name__=='__main__':
    reports=json.loads((ROOT/'.sites-runtime/shared-before-gender.json').read_text(encoding='utf-8'))
    with ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(collect,reports))
