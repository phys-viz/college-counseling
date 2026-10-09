"""Retrieve public Wayback copies of Clemson-issued reports when OPEN rejects downloads."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests, json

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.sites-runtime/archive-import'
mirror_file = WORK / 'clemson-mirrors.json'
mirrors = json.loads(mirror_file.read_text(encoding='utf-8'))

def fetch(year):
    official = f'https://www.clemson.edu/institutional-effectiveness/documents/oir/CommonDataSet{year}.pdf'
    url = f'https://web.archive.org/web/20240000000000id_/{official}'
    response = requests.get(url, timeout=50)
    response.raise_for_status()
    if not response.content.startswith(b'%PDF-'):
        raise ValueError('Archive returned a non-PDF response')
    (ROOT / f'data/sources/clemson-{year}.pdf').write_bytes(response.content)
    print('Archived Clemson PDF', year, len(response.content), flush=True)
    return dict(year=year, extraction_url=response.url, archived_official_url=official)

if __name__ == '__main__':
    results, failures = [], []
    def safe(year):
        try: return fetch(year)
        except Exception as error:
            failures.append(dict(year=year,error=str(error)))
            print('Unavailable archived PDF',year,str(error)[:180],flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = [r for r in pool.map(safe, list(range(2008,2018))+[2021]) if r]
    by_year = {m['year']: m for m in mirrors}
    by_year.update({m['year']:m for m in results})
    mirror_file.write_text(json.dumps(list(by_year.values()),indent=2),encoding='utf-8')
    (WORK / 'archive-errors.json').write_text(json.dumps(failures,indent=2),encoding='utf-8')
