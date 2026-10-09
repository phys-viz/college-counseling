"""Cache NYU-authored archived files and retain PDF geometry / worksheet cell evidence.

NYU's public server rejected direct downloads during this import. The manifest
identifies the archived bytes actually used, rather than claiming a NYU fetch.
Worksheet pages are numbered CDS-A=1 ... CDS-J=10; they are not physical PDF pages.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import datetime, hashlib, json, re, requests, pymupdf, openpyxl

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.sites-runtime/nyu'
WORK.mkdir(parents=True, exist_ok=True)

def formatted(cell):
    value = cell.value
    if isinstance(value, datetime.datetime):
        return value.strftime('%m/%d/%Y')
    if isinstance(value, (int, float)):
        return f'{value * 100:g}%' if '%' in cell.number_format else f'{value:g}'
    return re.sub(r'\s+', ' ', str(value)).strip()

def cache(record):
    file = WORK / f"nyu-{record['year']}.{record['source_type']}"
    if not file.exists():
        response = requests.get(record['url'], timeout=45)
        response.raise_for_status()
        file.write_bytes(response.content)
    raw = file.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == record['sha256'], 'Archived source bytes changed'
    pages = []
    if record['source_type'] == 'xlsx':
        workbook = openpyxl.load_workbook(file, data_only=True)
        sheets = [s for s in workbook if re.fullmatch(r'CDS-[A-J]', s.title)]
        for page_number, sheet in enumerate(sheets, 1):
            # Newer CDS workbooks append an answer dictionary outside the report.
            # Its unrelated rows must not be merged into the printed questions.
            dictionary = next((c.column for c in sheet[1] if c.value == 'Question Number'), None)
            last_column = dictionary - 1 if dictionary else sheet.max_column
            positions = [0]
            for col in range(1, sheet.max_column + 1):
                letter = openpyxl.utils.get_column_letter(col)
                positions.append(positions[-1] + sheet.column_dimensions[letter].width * 7)
            lines = []
            for row in sheet:
                words = [dict(str=formatted(c), x=positions[c.column-1], y=-c.row*20,
                              width=positions[c.column]-positions[c.column-1], cell=f'{sheet.title}!{c.coordinate}')
                         for c in row if c.value is not None and c.column <= last_column]
                if words:
                    lines.append(dict(text=' '.join(w['str'] for w in words), words=words))
            pages.append(dict(page=page_number, text='\n'.join(l['text'] for l in lines), lines=lines, form_fields=[]))
    else:
        for page in pymupdf.open(file):
            words = [dict(str=w[4], x=w[0], y=-w[3], width=w[2]-w[0])
                     for w in page.get_text('words', flags=pymupdf.TEXTFLAGS_WORDS & ~pymupdf.TEXT_PRESERVE_LIGATURES)]
            lines = []
            for word in sorted(words, key=lambda w: (-w['y'], w['x'])):
                line = next((l for l in lines if abs(l['words'][0]['y']-word['y']) < 3), None)
                if line is None:
                    lines.append(dict(text='', words=[word]))
                else:
                    line['words'].append(word)
            for line in lines:
                line['words'].sort(key=lambda w:w['x'])
                line['text'] = re.sub(r'\s+', ' ', ' '.join(w['str'] for w in line['words'])).strip()
            pages.append(dict(page=page.number+1, text='\n'.join(l['text'] for l in lines), lines=lines, form_fields=[]))
    (WORK / f"{record['year']}-pages.json").write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
    print('Cached', record['year'], len(pages), 'source pages/worksheets', flush=True)

if __name__ == '__main__':
    manifest = json.loads((ROOT/'data/nyu-sources.json').read_text(encoding='utf-8'))
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(cache, manifest))
