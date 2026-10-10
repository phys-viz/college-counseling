"""Cache genuine CDS originals for UMass Amherst, OSU Columbus, and Fordham.

Run from the repository: python scripts/collect_batch_d.py
Dependencies: requests, beautifulsoup4, PyMuPDF, Pillow.
Published-source coverage is frozen to fall 2025 for this reviewed batch.
Fordham 2020–22 use institution-authored archived originals; 2023–24 remain
unavailable SharePoint links. Never bypass their authentication/download policy.
OSU 2024–25 require a separately identified offline OCR adapter. Original PDF
bytes, selectable text, geometry, and independently reviewed responses remain
separate from OCR and from the website's automatic PDF parsing capability.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
import hashlib, io, json, re
import requests, pymupdf
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw
from collect_new_archives import geometry

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.sites-runtime/batch-d'
WORK.mkdir(parents=True, exist_ok=True)
INDEXES = {
    'umass': 'https://www.umass.edu/uair/data/common-data-set',
    'osu': 'https://irp.osu.edu/institutional-data-and-reports',
    'fordham': 'https://www.fordham.edu/about/leadership-and-administration/administrative-offices/office-of-the-provost/provost-office-units/institutional-research-and-assessment/consumer-information/common-data-set/',
}
FORDHAM_ARCHIVES = {
    2020: '222d0d0b63f56bee7be1928aee2628ce910b7457bda6fe07709c78a585693bde',
    2021: 'f169bd239a170f3253dc31a1ab2c816182a83e1b84734ecf5d6aabb39c495064',
    2022: '767c79652c0a782068a018cc0f89644c068d47737c7e9414e91b04f6bdb583cd',
}

def index(name):
    file = WORK / f'{name}-index.html'
    if not file.exists():
        response = requests.get(INDEXES[name], timeout=45)
        response.raise_for_status()
        file.write_text(response.text, encoding='utf-8')
    return BeautifulSoup(file.read_text(encoding='utf-8'), 'html.parser')

def source(sid, school, year, name, url, title, source_type='pdf'):
    return dict(school_id=sid, school=school, year=year, index_url=INDEXES[name],
                url=url, title=title, source_type=source_type,
                provenance='official publisher file', usable_report=source_type == 'pdf',
                index_sha256=hashlib.sha256((WORK / f'{name}-index.html').read_bytes()).hexdigest())

def discover():
    docs = []
    for a in index('umass').find_all('a', href=True):
        if a.get_text(' ', strip=True) != 'Common Data Set' or '/media/' not in a['href']:
            continue  # Appendix and unrelated files are not complete CDS reports.
        row = a.find_parent('tr')
        context = row.get_text(' ', strip=True) if row else a.find_parent('p').find_previous_sibling('p').get_text(' ', strip=True)
        match = re.search(r'\b(20\d{2}|19\d{2})\b', context)
        assert match, f'No report year in UMass link context: {context}'
        year = int(match[1])
        if year > 2025:
            continue
        docs.append(source('university-of-massachusetts-amherst', 'University of Massachusetts Amherst',
                           year, 'umass', urljoin(INDEXES['umass'], a['href']),
                           f'UMass Amherst Common Data Set {year}-{year+1}'))
    soup = index('osu')
    heading = next(p for p in soup.find_all('p') if p.get_text(' ', strip=True) == 'Columbus Campus')
    for a in heading.find_next('p').find_all('a', href=True):
        year = int(a.get_text(' ', strip=True)[:4])
        if year > 2025:
            continue
        docs.append(source('ohio-state-university-columbus', 'The Ohio State University (Columbus)',
                           year, 'osu', urljoin(INDEXES['osu'], a['href']),
                           f'Ohio State Columbus Common Data Set {year}-{year+1}'))
        docs[-1]['provenance'] = 'official Columbus campus publisher file; regional-campus links excluded'
    for a in index('fordham').find_all('a', href=True):
        label = a.get_text(' ', strip=True)
        match = re.match(r'^CDS (20\d{2})', label)
        if not match or int(match[1]) > 2025:
            continue
        url = urljoin(INDEXES['fordham'], a['href'])
        typ = 'docx' if '/:w:/' in url else 'xlsx' if '/:x:/' in url else 'pdf'
        docs.append(source('fordham-university', 'Fordham University', int(match[1]), 'fordham', url, label, typ))
    for year, sha in FORDHAM_ARCHIVES.items():
        official = next((d for d in docs if d['school_id'] == 'fordham-university' and d['year'] == year), None)
        if official:
            docs.remove(official)
        url = f'https://api.collegedata.fyi/storage/v1/object/public/sources/fordham-university/{year}-{str(year+1)[-2:]}/{sha}.pdf'
        doc = source('fordham-university', 'Fordham University', year, 'fordham', url,
                     f'Fordham Common Data Set {year}-{year+1}')
        doc.update(expected_sha256=sha, archive_index_url='https://collegedata.fyi/schools/fordham-university',
                   provenance='archived Fordham-authored original; current publisher serves request-only or non-downloadable SharePoint file')
        if official:
            doc.update(official_url=official['url'], official_source_type=official['source_type'])
        docs.append(doc)
    return docs

def offline_ocr(doc, file):
    """Scoped OCR of visible vector responses; does not modify the source PDF."""
    output = WORK / f'{file.stem}-ocr-pages.json'
    if output.exists():
        existing = json.loads(output.read_text(encoding='utf-8'))
        if existing and all(p.get('source_sha256') == doc['sha256'] for p in existing):
            return
    tessdata = ROOT / '.sites-runtime/ocr-tessdata'
    tessdata.mkdir(parents=True, exist_ok=True)
    if not (tessdata / 'eng.traineddata').exists():
        response = requests.get('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata', timeout=60)
        response.raise_for_status()
        (tessdata / 'eng.traineddata').write_bytes(response.content)
    pages = []
    original = pymupdf.open(file)
    for i in range(12, 23):  # Actual source Section C physical pages13–23.
        p = original[i]
        scale = 4
        pix = p.get_pixmap(matrix=pymupdf.Matrix(scale, scale))
        raster = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
        draw = ImageDraw.Draw(raster)
        def erase_grid(a, b):
            vertical = abs(a.x-b.x) < 1 and abs(a.y-b.y) > 30
            horizontal = abs(a.y-b.y) < 1 and abs(a.x-b.x) > 80
            if vertical or horizontal:
                draw.line([(a.x*scale, a.y*scale), (b.x*scale, b.y*scale)], fill='white', width=5)
        for path in p.get_drawings():
            for item in path['items']:
                if item[0] == 'l':
                    erase_grid(item[1], item[2])
                elif item[0] == 're' and item[1].width > 50:
                    r = item[1]
                    for a, b in [(r.tl,r.tr),(r.tr,r.br),(r.br,r.bl),(r.bl,r.tl)]:
                        erase_grid(a,b)
        buffer = io.BytesIO()
        raster.save(buffer, format='PNG')
        scan = pymupdf.open()
        page = scan.new_page(width=p.rect.width, height=p.rect.height)
        page.insert_image(page.rect, stream=buffer.getvalue())
        recognized = page.get_textpage_ocr(language='eng', dpi=300, full=True, tessdata=str(tessdata))
        words = [dict(str=a[4], x=a[0], y=-(a[1]+a[3])/2, width=a[2]-a[0])
                 for a in page.get_text('words', textpage=recognized)]
        lines = []
        for word in sorted(words, key=lambda a:(-a['y'],a['x'])):
            line = next((l for l in lines if abs(l['words'][0]['y']-word['y']) < 3), None)
            if line is None:
                lines.append(dict(text='', words=[word]))
            else:
                line['words'].append(word)
        for line in lines:
            line['words'].sort(key=lambda a:a['x'])
            line['text'] = re.sub(r'\s+', ' ', ' '.join(a['str'] for a in line['words'])).strip()
        pages.append(dict(page=i+1, text='\n'.join(l['text'] for l in lines), lines=lines,
                          form_fields=[], source_sha256=doc['sha256'],
                          offline_ocr='PyMuPDF Tesseract 300dpi with offline table grid removal; original preserved separately'))
        print('Offline OCR', doc['year'], i+1, flush=True)
    output.write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')

def cache(doc):
    if not doc['usable_report']:
        # These original SharePoint links redirect to authentication; a download
        # attempt returned an explicit no-download-capability response. Record
        # the actual format and known limitation; do not bypass either policy.
        doc['unusable_reason'] = 'SharePoint public view requires Microsoft authentication; download response denies download capability'
        response = WORK / f'fordham-{doc["year"]}-share.html'
        if response.exists():
            doc['unavailable_response_sha256'] = hashlib.sha256(response.read_bytes()).hexdigest()
        return doc
    file = WORK / f'{doc["school_id"]}-{doc["year"]}.pdf'
    if not file.exists():
        response = requests.get(doc['url'], timeout=60)
        response.raise_for_status()
        raw = response.content
        doc['resolved_url'] = response.url
        if not raw.startswith(b'%PDF'):
            soup = BeautifulSoup(raw, 'html.parser')
            link = next((a['href'] for a in soup.find_all('a',href=True)
                         if a['href'].lower().split('?')[0].endswith('.pdf')), None)
            assert link, f'No original PDF at {doc["url"]}'
            response = requests.get(urljoin(response.url,link),timeout=60)
            response.raise_for_status()
            raw = response.content
            doc['resolved_url'] = response.url
        assert raw.startswith(b'%PDF'), f'Non-PDF original response: {doc["url"]}'
        file.write_bytes(raw)
    doc['sha256'] = hashlib.sha256(file.read_bytes()).hexdigest()
    if doc.get('expected_sha256'):
        assert doc['sha256'] == doc['expected_sha256'], 'Archived original bytes changed'
    pages = geometry(file)
    (WORK / f'{file.stem}-pages.json').write_text(json.dumps(pages, ensure_ascii=False),encoding='utf-8')
    (WORK / f'{file.stem}-text.txt').write_text('\n\n'.join(f'PAGE {p["page"]}\n{p["text"]}' for p in pages),encoding='utf-8')
    if doc['school_id'] == 'ohio-state-university-columbus' and doc['year'] in (2024,2025):
        offline_ocr(doc,file)
        doc['offline_adapter'] = 'original selectable text plus separately preserved Section C OCR and individually reviewed source responses'
    print('Cached', doc['school_id'], doc['year'], len(pages), 'physical pages',flush=True)
    return doc

if __name__ == '__main__':
    docs = discover()
    assert len(docs) == 53 and sum(d['usable_report'] for d in docs) == 51, 'Reviewed source coverage changed'
    with ThreadPoolExecutor(max_workers=4) as pool:
        docs = list(pool.map(cache, docs))
    (ROOT / 'data/batch-d-sources.json').write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Preserved',len(docs),'source entries;',sum(d['usable_report']for d in docs),'genuine reports')
