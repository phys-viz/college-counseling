"""Cache all official Clemson/W&L CDS PDFs and extraction geometry for normalization."""
from pathlib import Path
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib, json, re, requests, pymupdf
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'data/sources'
WORK = ROOT / '.sites-runtime/archive-import'
WORK.mkdir(parents=True, exist_ok=True)
ARCHIVES = [
    ('clemson', 'Clemson University', 'https://open.clemson.edu/cds/'),
    ('washington-and-lee-university', 'Washington and Lee University', 'https://www.wlu.edu/accreditation-and-institutional-research/common-data-set'),
]

def collect():
    records = []
    for school_id, school, index_url in ARCHIVES:
        response = requests.get(index_url, timeout=40)
        response.raise_for_status()
        (WORK / (school_id + '-index.html')).write_bytes(response.content)
        soup = BeautifulSoup(response.content, 'html.parser')
        base_tag = soup.find('base', href=True)
        base = urljoin(response.url, base_tag['href']) if base_tag else response.url
        seen = set()
        for a in soup.select('a[href]'):
            label = a.get('aria-label') or a.get('title') or a.get_text(' ', strip=True)
            url = urljoin(base, a['href'])
            if not ('.pdf' in url.lower() or 'viewcontent.cgi' in url):
                continue
            match = re.search(r'\b((?:19|20)\d{2})[-–]', label)
            if not match or url in seen:
                continue
            year = int(match[1]); seen.add(url)
            records.append(dict(school_id=school_id, school=school, year=year, title=label, url=url, index_url=index_url))
    return records

def download(record):
    mirror_path = WORK / 'clemson-mirrors.json'
    saved = ROOT / 'data/archive-sources.json'
    mirrors = [dict(m,extraction_url=m['url']) for m in json.loads(saved.read_text(encoding='utf-8')) if m['school_id']=='clemson'] if saved.exists() else json.loads(mirror_path.read_text(encoding='utf-8')) if mirror_path.exists() else []
    mirror = next((m for m in mirrors if record['school_id'] == 'clemson' and m['year'] == record['year']), None)
    if mirror:
        record['official_url'] = record['url']
        record['url'] = mirror['extraction_url']
    workbook=record['url'].endswith('.xlsx')
    path = SOURCES / f"{record['school_id']}-{record['year']}.{'xlsx' if workbook else 'pdf'}"
    # W&L 2025 was already independently checked and cached under its short name.
    short = SOURCES / 'wlu-2025.pdf'
    if record['school_id'] == 'washington-and-lee-university' and record['year'] == 2025 and short.exists():
        path = short
    if not path.exists():
        response = requests.get(record['url'], timeout=60)
        response.raise_for_status()
        if not response.content.startswith(b'PK' if workbook else b'%PDF-'):
            raise ValueError('Not a PDF: ' + record['url'])
        if len(response.content) > 25_000_000:
            raise ValueError('PDF exceeds 25MB')
        path.write_bytes(response.content)
        record['url'] = response.url
    data = path.read_bytes()
    if workbook:
        record['sha256']=hashlib.sha256(data).hexdigest();record['cache_path']=path.relative_to(ROOT).as_posix();record['source_type']='xlsx'
        return record
    doc = pymupdf.open(stream=data, filetype='pdf')
    page_path = WORK / f"{record['school_id']}-{record['year']}-pages.json"
    if record['school_id']=='clemson' and record['year']==2025 and page_path.exists() and not doc[1].get_text().strip():
        record['sha256'] = hashlib.sha256(data).hexdigest()
        record['cache_path'] = path.relative_to(ROOT).as_posix()
        return record
    pages = []
    for page in doc:
        words = []
        for word in page.get_text('words',flags=pymupdf.TEXTFLAGS_WORDS & ~pymupdf.TEXT_PRESERVE_LIGATURES):
            words.append(dict(str=word[4],x=word[0],y=-word[3],width=word[2]-word[0]))
        lines = []
        for word in sorted(words, key=lambda w: (-w['y'], w['x'])):
            target = next((l for l in lines if abs(l['words'][0]['y']-word['y']) < 3), None)
            if target is None:
                lines.append(dict(text='', words=[word]))
            else:
                target['words'].append(word)
        for line in lines:
            line['words'].sort(key=lambda w: w['x'])
            line['text'] = re.sub(r'\s+', ' ', ' '.join(w['str'] for w in line['words'])).strip()
        fields = []
        for widget in page.widgets() or []:
            value = str(widget.field_value or '').strip()
            if value and value not in ['Off', 'false']:
                fields.append(dict(name=widget.field_name, value=value, label=widget.field_label, rect=list(widget.rect)))
        pages.append(dict(page=page.number+1, text='\n'.join(l['text'] for l in lines), lines=lines, form_fields=fields))
    record['sha256'] = hashlib.sha256(data).hexdigest()
    record['cache_path'] = path.relative_to(ROOT).as_posix()
    (WORK / f"{record['school_id']}-{record['year']}-pages.json").write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
    return record

if __name__ == '__main__':
    discovered = collect()
    completed, errors = [], []
    with ThreadPoolExecutor(max_workers=5) as pool:
        tasks = {pool.submit(download, r): r for r in discovered}
        for task in as_completed(tasks):
            record = tasks[task]
            try:
                completed.append(task.result())
                print('Cached', record['school_id'], record['year'], flush=True)
            except Exception as error:
                errors.append(dict(**record, error=str(error)))
                print('FAILED', record['school_id'], record['year'], str(error), flush=True)
    (WORK / 'manifest.json').write_text(json.dumps(sorted(completed, key=lambda r:(r['school_id'],r['year'])), indent=2), encoding='utf-8')
    (WORK / 'errors.json').write_text(json.dumps(errors, indent=2), encoding='utf-8')
    print('Downloaded',len(completed),'of',len(discovered),'reports')
    if errors:
        raise SystemExit(1)
