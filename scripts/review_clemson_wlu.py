"""Review archived Section C layouts; keep source totals and disclose inconsistencies."""
from pathlib import Path
import json,re,unicodedata,hashlib
from datetime import datetime,timezone
import openpyxl,pymupdf

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/archive-import'
def clean(t):
    return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',t).replace('\u00ad','-').translate(str.maketrans({c:'-' for c in '\u2010\u2011\u2012\u2013\u2014\u2212'}))).strip()
def lines_for(pages,n):
    lines=[dict(l,page=p['page'],text=clean(l['text'])) for p in pages for l in p['lines']]
    begin=next((i for i,l in enumerate(lines) if re.match(r'^(?:CDS\s+)?C\s*'+str(n)+r'(?:[.\s-]|$)',l['text'])),None)
    if begin is None:return []
    end=next((i for i,l in enumerate(lines[begin+1:],begin+1) if (m:=re.match(r'^(?:CDS\s+)?C\s*(\d+)(?:[.\s-]|$)',l['text'])) and int(m[1])!=n),len(lines))
    return [dict(l,text=re.sub(r'^(?:CDS\s+)?C\s*\d+[A-Z]?(?:[.\s]+|$)','',l['text'])) for l in lines[begin:end]]
def c1_rows(pages):
    rows=[]
    for l in lines_for(pages,1):
        t=l['text']
        if re.match(r'^\**Total\b',t,re.I):rows.append(dict(page=l['page'],parts=[t]))
        elif rows and not re.search(r'^https?://|Common Data|^Page\b|^\d+ of \d+',t,re.I):rows[-1]['parts'].append(t)
    result=[]
    for row in rows:
        text=' '.join(row['parts']);text=re.sub(r'\bin Fall \d{4}\b','',text,flags=re.I)
        # A wrapped label can put its numeric cell between label fragments.
        nums=[int(n.replace(',','')) for n in re.findall(r'(?<!\w)\d[\d,]*(?!\w)',text)]
        label=clean(re.sub(r'(?<!\w)\d[\d,]*(?!\w)','',text))
        result.append(dict(page=row['page'],label=label,numbers=nums,text=text))
    return result

FACTORS=['Rigor of secondary school record','Class rank','Academic GPA','Standardized test scores','Application essay','Recommendations','Interview','Extracurricular activities','Talent/ability','Character/personal qualities','First generation','Alumni/ae relation','Geographical residence','State residency','Religious affiliation/commitment','Racial/ethnic status','Volunteer work','Work experience',"Level of applicant’s interest"]
RATINGS=['Very important','Important','Considered','Not considered']
ALIASES={'Rigor of secondary school record':['Secondary school record'],'Academic GPA':['Academic Grade Point Average (GPA)'],'Application essay':['Essay'],'Recommendations':['Recommendation(s)','Recommendation'],'Extracurricular activities':['Extracurriculuar activities'],'Talent/ability':['Particular talent or ability'],'Religious affiliation/commitment':['Religious affilitation/commitment','Religious affiliation or commitment'],'Racial/ethnic status':['Minority status'],"Level of applicant’s interest":["Level of applicant's interest"]}
# Source-reviewed C1 totals. Page numbers refer to the actual linked file, including covers.
CLEMSON_C1={2008:([14504,8355,2982],[5,6,6]),2009:([19328,12470,4611],[7,7,7]),2010:([16865,9724,3017],[7,7,7]),2011:([17016,10215,2933],[8,9,9]),2012:([18500,10706,3463],[6,6,6]),2013:([18604,10645,3289],[7,8,8]),2014:([20755,10967,3475],[9,9,9]),2015:([22396,11483,3448],[8,8,8]),2016:([23506,11881,3684],[9,9,10]),2017:([26242,12380,3649],[12,13,13]),2018:([28845,13613,3792],[14,14,15]),2019:([29070,14900,3932],[14,14,15]),2020:([28600,17715,4199],[14,14,15]),2022:([52819,22704,4588],[8,8,8]),2023:([60122,22879,4494],[17,17,17]),2024:([61517,23586,4880],[14,14,14]),2025:([64805,27498,5084],[15,15,15])}

def put(report,key,value,n,page,method='Reviewed PDF text/geometry'):
    report['metrics'][key]=value;report['evidence'][key]=dict(section=f'C{n}',page=page,method=method)

def supplement_text(report,pages):
    for n in [2,9,10,13,14,21]:
        lines=lines_for(pages,n)
        for i,line in enumerate(lines):
            text=line['text'];next_line=lines[i+1] if i+1<len(lines) else None
            if next_line and re.fullmatch(r'[\d,.$% /-]+',next_line['text']):text+=' '+next_line['text']
            patterns=[('waitlist_offered',2,r'Number of qualified applicants (?:offered|placed).*?[_ ]*([\d,]+)[_ ]*$'),('waitlist_accepted',2,r'Number accepting a place.*?[_ ]*([\d,]+)[_ ]*$'),('waitlist_admitted',2,r'Number of wait-listed students admitted.*?[_ ]*([\d,]+)[_ ]*$'),('fee',13,r'Amount of (?:the )?application fee\s*[:\-]?\s*\$?([\d.]+)'),('top_tenth',10,r'Percent in top (?:tenth|10th).*?([\d.]+)%'),('top_quarter',10,r'Percent in top quarter.*?([\d.]+)%'),('top_half',10,r'Percent in top half.*?([\d.]+)%'),('rank_submitted',10,r'.*submitted high school class rank:?\s*([\d.]+)%'),('ed_applicants',21,r'Number of early decision applications received.*?([\d,]+)[_ ]*$'),('ed_admitted',21,r'Number of applicants admitted under early decision plan.*?([\d,]+)[_ ]*$')]
            for key,section,pattern in patterns:
                if n==section and (m:=re.search(pattern,text,re.I)):
                    value=m[1].replace(',','').rstrip('.')
                    put(report,key,float(value) if '.' in value else int(value),n,line['page'])
            if n==14 and report['metrics'].get('rd_deadline') is None and (m:=re.match(r'Application closing date \(fall\)\s*[:\-]?\s*(.+)',text,re.I)) and re.search(r'\d',m[1]):put(report,'rd_deadline',m[1],14,line['page'])
            if n==9:
                for test in ['sat','act']:
                    if m:=re.match(f'Percent submitting {test} scores\\s+([\\d.]+)',text,re.I):put(report,test+'_submitted',float(m[1]),9,line['page'])
                    if m:=re.match(f'Number submitting {test} scores\\s+([\\d,]+)',text,re.I):put(report,test+'_submitted_count',int(m[1].replace(',','')),9,line['page'])
                for key,label in [('sat',r'SAT (?:I )?Composite'),('reading',r'SAT (?:I )?(?:Critical Reading|Verbal|Evidence-Based Reading and Writing)'),('math',r'SAT (?:I )?Math'),('act',r'ACT Composite')]:
                    score_text=re.sub(r'\(\d+\s*-\s*\d+\)','',text)
                    if m:=re.fullmatch(label+r'\s+([\d,]+)\s+([\d,]+)(?:\s+([\d,]+))?',score_text,re.I):
                        vals=[int(v.replace(',','')) for v in m.groups() if v]
                        if all((1<=v<=36 if key=='act' else 200<=v<=(1600 if key=='sat' else 800)) for v in vals) and vals==sorted(vals):
                            for pct,v in zip([25,75] if len(vals)==2 else [25,50,75],vals):put(report,f'{key}_{pct}',v,9,line['page'])
                    elif 'prior year data for reference' in ' '.join(l['text'] for l in lines) and (m:=re.fullmatch(label+r'\s+(\d+)\s+(\d+)\s+\d+\s+\d+',score_text,re.I)):
                        for pct,v in zip([25,75],m.groups()):put(report,f'{key}_{pct}',int(v),9,line['page'],'Current-year columns in PDF table; prior-year reference columns excluded')

def supplement_factors(report,pages,pdf):
    c7=lines_for(pages,7);factor_pages=sorted({l['page'] for l in c7});result={f['label']:f for f in report['factors']}
    # Printed dropdown answers use literal ratings instead of checkbox marks.
    joined=' '.join(l['text'] for l in c7)
    for name in FACTORS:
        for alias in [name]+ALIASES.get(name,[]):
            pattern=re.escape(alias).replace(r'\ ',r'\s+')+r'\s+(Very Important|Not Considered|Important|Considered)\b'
            if m:=re.search(pattern,joined,re.I):
                page=next((l['page'] for l in c7 if alias.lower() in l['text'].lower()),factor_pages[0])
                result[name]=dict(label=name,rating=next(r for r in RATINGS if r.lower()==m[1].lower()),page=page)
                break
    anchors=None
    for pn in factor_pages:
        page=pdf[pn-1]
        vi=page.search_for('Very important');imp=page.search_for('Important');cons=page.search_for('Considered');nc=page.search_for('Not considered')
        if not nc and cons:nc=[b for b in page.search_for('Not') if b.x0>min(c.x0 for c in cons)+20]
        # Four columns must exist; literal dropdown ratings do not qualify as a header.
        if vi and imp and cons and nc:
            xs=[(vi[0].x0+vi[0].x1)/2,max((b.x0+b.x1)/2 for b in imp),min((b.x0+b.x1)/2 for b in cons),(nc[0].x0+nc[0].x1)/2]
            if all(xs[i+1]-xs[i]>20 for i in range(3)):anchors=xs
        if anchors is None:continue
        marks=[]
        for word in page.get_text('words'):
            if word[4].lower() in ['x','☒','✓','✔'] and word[0]>anchors[0]-30:marks.append(((word[0]+word[2])/2,(word[1]+word[3])/2))
        for d in page.get_drawings():
            b=d['rect']
            if d['fill'] and max(d['fill'])<.45 and .5<b.width<5 and .5<b.height<5 and b.x0>anchors[0]-30:marks.append(((b.x0+b.x1)/2,(b.y0+b.y1)/2))
        for info in page.get_image_info(xrefs=True):
            if not info['xref'] or max(info['width'],info['height'])>120:continue
            b=pymupdf.Rect(info['bbox'])
            if not(0<=b.y0<=page.rect.height and b.x0>anchors[0]-30):continue
            pix=pymupdf.Pixmap(pdf,info['xref']);pix=pymupdf.Pixmap(pymupdf.csRGB,pix) if pix.colorspace.n!=3 else pix
            rgb=pix.pixel(pix.width//2,pix.height//2)[:3]
            if max(rgb)<100 or max(rgb)-min(rgb)>25:marks.append(((b.x0+b.x1)/2,(b.y0+b.y1)/2))
        for name in FACTORS:
            boxes=[]
            for alias in [name]+ALIASES.get(name,[]):
                boxes=page.search_for(alias)
                if boxes:break
            if not boxes:continue
            ymin=min(b.y0 for b in boxes);ymax=max(b.y1 for b in boxes)
            hits=list({(round(x,1),round(y,1)) for x,y in marks if ymin-4<=y<=ymax+4})
            if len(hits)==1:
                col=min(range(4),key=lambda j:abs(hits[0][0]-anchors[j]));result[name]=dict(label=name,rating=RATINGS[col],page=pn)
    report['factors']=list(result.values())

def workbook_report():
    path=ROOT/'data/sources/clemson-2021.xlsx';s=openpyxl.load_workbook(path,data_only=True)['CDS-C']
    mirror=next(m for m in json.loads((ROOT/'data/archive-sources.json').read_text(encoding='utf8')) if m['school_id']=='clemson' and m['year']==2021)
    r=dict(school_id='clemson',school='Clemson University',year=2021,report_label='2021–22',source_url=mirror['url'],index_url='https://open.clemson.edu/cds/',source_type='xlsx',sha256=hashlib.sha256(path.read_bytes()).hexdigest(),extracted_at=datetime.now(timezone.utc).isoformat(),review_status='C1 source totals reviewed; source inconsistencies noted',metrics={},evidence={},factors=[],sections=[],warnings=[])
    rows=[]
    for row in s:
        cells=[f'{c.coordinate}: {c.value}' for c in row if c.value is not None]
        if cells:rows.append(' | '.join(cells))
    r['sections']=[dict(page=1,text='Worksheet CDS-C\n'+'\n'.join(rows),form_fields=[])]
    for key,cell,n,scale in [('applicants','E20',1,1),('admitted','E21',1,1),('enrolled','E22',1,1),('waitlist_offered','E33',2,1),('waitlist_accepted','E34',2,1),('waitlist_admitted','E35',2,1),('sat_submitted','C190',9,100),('act_submitted','C191',9,100),('sat_submitted_count','D190',9,1),('act_submitted_count','D191',9,1),('top_tenth','E236',10,100),('top_quarter','E237',10,100),('top_half','E238',10,100),('rank_submitted','E241',10,1),('fee','D268',13,1)]:put(r,key,float(s[cell].value)*scale,n,None,f'XLSX CDS-C!{cell}')
    for key,row in [('sat',198),('reading',199),('math',200),('act',201)]:
        for pct,col in [(25,'C'),(75,'D')]:put(r,f'{key}_{pct}',int(s[f'{col}{row}'].value),9,None,f'XLSX CDS-C!{col}{row}')
    for row,name in zip([81,82,83,84,85,86,88,89,90,91,92,93,94,95,96,97,98,99,100],FACTORS):
        marks=[i for i,col in enumerate('CDEF') if s[f'{col}{row}'].value=='X']
        assert len(marks)==1
        r['factors'].append(dict(label=name,rating=RATINGS[marks[0]],page=1))
    put(r,'rd_deadline',s['C286'].value.strftime('%m/%d'),14,None,'XLSX CDS-C!C286')
    put(r,'test_policy','Not required; considered if submitted',8,None,'XLSX CDS-C!F110')
    r['warnings']=['C1 reports 4,589 enrolled, while its male/female full-time/part-time cells sum to 4,593. The reported overall total is retained; the discrepancy belongs to the source workbook.','School-issued workbook retrieved from a public archival copy because the current repository download was unavailable.','Admissions policies may refer to a later application cycle than the reported cohort.']
    return r

if __name__=='__main__':
    manifest=json.loads((WORK/'manifest.json').read_text(encoding='utf8'))
    reports=[];audit=[]
    wlu_counts={2005:[3950,1141,464],2006:[4215,1158,449],2007:[3719,1018,462],2008:[6386,1074,454],2009:[6222,1181,472],2010:[6627,1259,471],2011:[6487,1182,494],2012:[5972,1163,479],2013:[6222,1147,480],2014:[5797,1136,471],2015:[5377,1284,454],2016:[5101,1203,466],2017:[5455,1200,471],2018:[5855,1239,474],2019:[6178,1147,462],2020:[4998,1225,459],2021:[6614,1248,484],2022:[7224,1225,476],2023:[6820,1184,502],2024:[8213,1147,472],2025:[8963,1214,499]}
    for doc in manifest:
        if doc.get('source_type')=='xlsx':continue
        pages=json.loads((WORK/f"{doc['school_id']}-{doc['year']}-pages.json").read_text(encoding='utf8'))
        draft=WORK/f"{doc['school_id']}-{doc['year']}-draft.json"
        r=json.loads(draft.read_text(encoding='utf8'));year=doc['year']
        if doc['school_id']=='clemson':counts,pns=CLEMSON_C1[year]
        else:
            counts=wlu_counts[year];pns=[lines_for(pages,1)[0]['page']]*3
        for key,value,pn in zip(['applicants','admitted','enrolled'],counts,pns):put(r,key,value,1,pn,'Source-reviewed C1 total; includes all reported gender/status groups')
        r['year']=year;r['report_label']=f'{year}–{str(year+1)[-2:]}'
        r['warnings']=[w for w in r['warnings'] if not any(s in w for s in ['Some headline counts could not','C1 applicants totals disagree','C1 enrolled totals disagree','C1 admitted totals disagree','Automatically extracted'])]
        pdf=pymupdf.open(ROOT/doc['cache_path'])
        supplement_text(r,pages);supplement_factors(r,pages,pdf)
        if doc['school_id']=='clemson':
            # Clemson reports no ED plan; old blank prompts contain years, not counts.
            for key in ['ed_applicants','ed_admitted','ed_rate']:
                r['metrics'].pop(key,None);r['evidence'].pop(key,None)
            if year in [2012,2016]:
                vals,pn=([1820,883,4],6) if year==2012 else ([1794,659,3],10)
                for key,value in zip(['waitlist_offered','waitlist_accepted','waitlist_admitted'],vals):put(r,key,value,2,pn,'Visually reviewed PDF cells above their question labels')
            if year==2012:put(r,'fee',70,13,12,'Visually reviewed PDF cell above its question label')
            if year==2016:
                for key in ['sat_submitted_count','act_submitted_count']:
                    r['metrics'].pop(key,None);r['evidence'].pop(key,None)
            r['warnings'].append('School-issued report retrieved from a public archived copy. The official repository is linked separately; its current PDF download was unavailable.')
            if year==2008:r['warnings'].append('The report is labeled 2008–09 and C9 reports Fall 2008, but C1 instructions still say Fall 2007. Recorded under the report year; verify this source-year discrepancy before using historical comparisons.')
            if year==2010:r['warnings'].append('C1 reports 3,017 full-time enrolled, while its male/female full-time counts sum to 3,016. The reported overall total is retained.')
            if year==2009:r['warnings'].append('The archive identifies this as the 2009–10 report and its C1 table says Fall 2009, but its page header says Common Data Set 2011. The source-reported totals are retained; verify the source-year discrepancy before historical comparisons.')
            if year==2022:r['warnings'].append('C1 reports 52,819 applicants; its male/female counts sum to 52,814. The overall total is retained, consistent with the source instruction that gender details need not sum to the total.')
            if year==2025:
                r['warnings'].append('Scanned PDF: text was recognized with OCR. C1 residency totals (64,805 applicants; 27,498 admitted; 5,084 enrolled) were checked visually. Its gender tables differ by one for admits/enrollment; the residency totals are retained.')
                r['factors']=[dict(label=name,rating=RATINGS[col],page=17) for name,col in zip([n for n in FACTORS if n!='Racial/ethnic status'],[0,0,0,1,2,2,3,2,2,2,2,2,2,0,3,3,3,3])]
                for key,values in [('sat',[1250,1330,1400]),('reading',[630,670,710]),('math',[620,660,700]),('act',[28,31,32])]:
                    for pct,value in zip([25,50,75],values):put(r,f'{key}_{pct}',value,9,20,'Visually reviewed scanned PDF table')
                for key,value in [('sat_submitted',38),('act_submitted',19),('sat_submitted_count',1952),('act_submitted_count',969)]:put(r,key,value,9,20,'Visually reviewed scanned PDF table')
                put(r,'fee',70,13,23,'Visually reviewed scanned PDF')
                for key,value in [('top_tenth',54.57),('top_quarter',92.08),('top_half',99.52),('rank_submitted',61.35)]:put(r,key,value,10,22,'Visually reviewed scanned PDF table')
            if year in [2024,2025]:put(r,'rd_deadline','5/1',14,22 if year==2024 else 23,'Reviewed PDF application closing date')
        if doc['school_id']=='washington-and-lee-university' and year==2018:r['warnings'].append('The 2018–19 report has stale Fall 2017 labels in C1/C2, while its cover and enrolled-student profile identify 2018. Recorded under the report year; the original labels are preserved.')
        if doc['school_id']=='washington-and-lee-university' and year==2019:r['warnings'].append('C1 reports Fall 2019, but C2 still says Fall 2018. Waitlist figures are retained from this report with that source-year discrepancy noted.')
        if doc['school_id']=='washington-and-lee-university' and year==2017:r['warnings'].append('C10 lists 81%, 15%, and 4% for top tenth, quarter, and half. These are not cumulative as the questions request; the source values are retained for review.')
        if len(r['factors'])>=18:r['warnings']=[w for w in r['warnings'] if 'Some admissions factor ratings' not in w]
        r['review_status']='C1 totals reviewed against source; source discrepancies noted; remaining fields source-extracted'
        r['warnings'].append('C1 totals were reviewed against the source. Other extracted fields should be checked before counseling decisions; missing answers are not inferred.')
        audit.append(dict(school_id=r['school_id'],year=year,sha256=r['sha256'],totals=dict(zip(['applicants','admitted','enrolled'],counts)),pages=dict(zip(['applicants','admitted','enrolled'],pns))))
        reports.append(r)
        print(r['school_id'],year,*counts,'metrics',len(r['metrics']),'factors',len(r['factors']))
    workbook=workbook_report();reports.append(workbook)
    audit.append(dict(school_id='clemson',year=2021,sha256=workbook['sha256'],totals={k:workbook['metrics'][k] for k in ['applicants','admitted','enrolled']},pages={k:None for k in ['applicants','admitted','enrolled']},worksheet='CDS-C',cells=['E20','E21','E22']))
    (WORK/'reviewed.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'data/archive-c1-review.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
