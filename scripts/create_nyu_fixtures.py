"""Retain raw source geometry around Section C and independently reviewed values."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
work=root/'.sites-runtime/nyu';target=root/'scripts/fixtures/nyu';target.mkdir(parents=True,exist_ok=True)
docs=json.loads((root/'data/nyu-sources.json').read_text(encoding='utf-8'))
review=json.loads((root/'data/nyu-source-review.json').read_text(encoding='utf-8'))
for d in docs:
 pages=json.loads((work/f"{d['year']}-pages.json").read_text(encoding='utf-8'))
 selected=[];started=False
 for p in pages:
  if any(re.match(r'^(?:CDS\s+)?C\s*1(?:[.\s-]|$)',l['text']) for l in p['lines']):started=True
  if started:selected.append(p)
  if started and any(re.match(r'^(?:CDS\s+)?D\s*\.?\s*1(?:[.\s]|$)',l['text']) for l in p['lines']):break
 fixture=dict(source_url=d['url'],source_type=d['source_type'],sha256=d['sha256'],year=d['year'],expected=review[str(d['year'])],pages=selected)
 (target/f"{d['year']}.json").write_text(json.dumps(fixture,ensure_ascii=False),encoding='utf-8')
