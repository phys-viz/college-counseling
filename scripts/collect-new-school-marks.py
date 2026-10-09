"""Bundle official publicly displayed school icons with source hashes."""
import hashlib,io,json,requests
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
specs=[
 ('university-of-michigan-ann-arbor','#00274C','https://cm.engin.umich.edu/our-brand/colors/','https://umich.edu/skins/um2013/media/images/touch-icon-iphone-retina.png'),
 ('the-college-of-new-jersey','#293F6F','https://brand.tcnj.edu/wp-content/uploads/sites/11/2026/03/Graphic-Identity-Standards-Guide.pdf','https://tcnj.edu/wp-content/uploads/sites/249/2026/04/headway-imported-image-18.png'),
]
brands=json.loads((ROOT/'data/school-branding.json').read_text(encoding='utf-8'))
for sid,color,color_source,url in specs:
    r=requests.get(url,timeout=30);r.raise_for_status();raw=r.content
    im=Image.open(io.BytesIO(raw)).convert('RGBA');im.save(ROOT/f'public/school-marks/{sid}.png')
    item=dict(id=sid,aliases=[sid],color=color,color_source=color_source,logo=f'/school-marks/{sid}.png',logo_source=url,logo_source_sha256=hashlib.sha256(raw).hexdigest())
    brands=[b for b in brands if b['id']!=sid]+[item];print('Official mark',sid,im.size)
(ROOT/'data/school-branding.json').write_text(json.dumps(brands,indent=2)+'\n',encoding='utf-8')
