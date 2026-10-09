"""Cache the publicly displayed official VT website favicon for trend legends."""
import requests,hashlib,json,io
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
url='https://assets.cms.vt.edu/favicon/favicon.ico'
r=requests.get(url,timeout=30);r.raise_for_status();raw=r.content
im=Image.open(io.BytesIO(raw)).convert('RGBA');im.save(ROOT/'public/school-marks/virginia-tech.png')
p=ROOT/'data/school-branding.json';brands=json.loads(p.read_text(encoding='utf-8'))
item=dict(id='virginia-tech',aliases=['virginia-tech','virginia-polytechnic-institute-and-state-university'],color='#861F41',color_source='https://brand.vt.edu/content/dam/brand_vt_edu/downloads/FINAL%20Brand%20Guidelines%2010.29.19.pdf',logo='/school-marks/virginia-tech.png',logo_source=url,logo_source_sha256=hashlib.sha256(raw).hexdigest())
p.write_text(json.dumps([b for b in brands if b['id']!='virginia-tech']+[item],indent=2)+'\n',encoding='utf-8')
print('VT official favicon',im.size)
