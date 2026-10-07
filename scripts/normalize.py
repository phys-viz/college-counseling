"""Normalize counseling metrics without imputing missing responses or adding SAT subscores."""
import json,re,hashlib,datetime
from pathlib import Path
import pymupdf,openpyxl
ROOT=Path(__file__).resolve().parents[1]
FACTORS=['Rigor of secondary school record','Class rank','Academic GPA','Standardized test scores','Application essay','Recommendations','Interview','Extracurricular activities','Talent/ability','Character/personal qualities','First generation','Alumni/ae relation','Geographical residence','State residency','Religious affiliation/commitment','Racial/ethnic status','Volunteer work','Work experience',"Level of applicant’s interest"]
NUM=r'\d[\d,]*(?:\.\d+)?'
def number(v):
    try: return float(str(v).replace(',','').replace('$','').replace('%','').strip())
    except (ValueError,TypeError): return None
def normalize(r):
    if r['year']==2022:
        workbook=ROOT/'data/sources/cornell-2022.xlsx'
        s=openpyxl.load_workbook(workbook,data_only=True)['CDS-C']
        lines=[]
        for row in s:
            values=[]
            for c in row:
                if c.value is None: continue
                v=c.value
                if isinstance(v,datetime.datetime): v=f'{v.month}/{v.day}'
                elif isinstance(v,(int,float)) and '%' in c.number_format: v=f'{v*100:g}%'
                values.append(str(v).replace('\n',' '))
            if values: lines.append('    '.join(values))
        r['pages']=[{'page':1,'text':'\n'.join(lines),'widgets':[]}]
        r['source_url']='https://irp.dpb.cornell.edu/wp-content/uploads/2025/03/CDS_2022-2023_Cornell-University-v8.xlsx'
        r['sha256']=hashlib.sha256(workbook.read_bytes()).hexdigest()
        r['source_type']='xlsx'
    else: r['source_type']='pdf'
    text='\n'.join(p['text'] for p in r['pages'])
    # Some older reports share a physical page between Sections B and C.
    first=re.search(r'\bC\.\s*FIRST-TIME',text)
    if first: text=text[first.start():]
    lines=text.splitlines()
    widgets={w['name']:(w['value'],p['page']) for p in r['pages'] for w in p['widgets'] if str(w['value']).strip()}
    metrics={}; evidence={}; factors=[]
    def put(key,value,section,page=None,method='reported'):
        if value is not None:
            metrics[key]=value; evidence[key]={'section':section,'page':page,'method':method}
    def linefind(pattern,section):
        for p in r['pages']:
            for l in p['text'].splitlines():
                m=re.search(pattern,l,re.I)
                if m: return m,p['page']
        return None,None
    def numeric(key,pattern,section):
        m,p=linefind(pattern,section)
        if m: put(key,number(m[1]),section,p)
    mappings={'applicants':'AP_RECD_1ST_N','admitted':'AP_ADMT_1ST_N','enrolled':'EN_TOT_1ST_N','waitlist_offered':'AP_RECD_WAIT_N','waitlist_accepted':'AP_ACPT_WAIT_N','waitlist_admitted':'AP_ADMT_WAIT_N','ed_applicants':'AP_RECD_EDEC_N','ed_admitted':'AP_ADMT_EDEC_N','fee':'AP_FEE_RES_D','top_tenth':'FRSH_HS_RANK_10_P','top_quarter':'FRSH_HS_RANK_25_P','top_half':'FRSH_HS_RANK_50_P','rank_submitted':'FRSH_HS_RANK_SUBMIT_P','sat_submitted_count':'SUBMIT_SAT1_N','act_submitted_count':'SUBMIT_ACT_N'}
    for key,name in mappings.items():
        if name in widgets:
            section='C1' if key in ['applicants','admitted','enrolled'] else 'C2' if key.startswith('waitlist') else 'C21' if key.startswith('ed_') else 'C13' if key=='fee' else 'C9' if 'submitted_count' in key else 'C10'
            put(key,number(widgets[name][0]),section,widgets[name][1])
    for key,verb in [('applicants','applied'),('admitted','admitted'),('enrolled','enrolled')]:
        if key in metrics: continue
        prefix={'applicants':'AP_RECD_1ST_','admitted':'AP_ADMT_1ST_','enrolled':'EN_TOT_1ST_'}[key]
        values=[(number(v[0]),v[1]) for name,v in widgets.items() if name in [prefix+suffix for suffix in ['MEN_N','WMN_N','NON_BINARY_N','UNK_N']]]
        if values:
            put(key,sum(v[0] for v in values if v[0] is not None),'C1',values[0][1],'sum of reported gender counts'); continue
        # Prefer reported totals; otherwise sum reported gender breakdowns.
        m,p=linefind(r'Total first-time.*degree-seeking.*(?:'+verb+r')\s*:?\s*(.+)$','C1')
        if m:
            nums=re.findall(NUM,m[1])
            if nums: put(key,number(nums[-1]),'C1',p); continue
        values=[]
        for pg in r['pages']:
            for l in pg['text'].splitlines():
                if re.search(r'Total.*(?:men|women|another gender).*'+verb,l,re.I) or re.search(r'Total (?:men|women) '+verb,l,re.I):
                    if 'part-time' in l: continue
                    tail=re.split(verb,l,flags=re.I)[-1]
                    nums=re.findall(NUM,tail)
                    if nums: values.append(number(nums[-1])); p=pg['page']
        if values: put(key,sum(values),'C1',p,'sum of reported gender counts')
        else:
            m,p=linefind(r'Total first-time, first-year students.*'+verb+r' in Fall \d{4}\s+(.+)','C1')
            if m: put(key,sum(number(n) for n in re.findall(NUM,m[1])),'C1',p,'sum of reported gender counts')
    patterns={'waitlist_offered':r'Number of qualified applicants offered.*?('+NUM+r')\D*$','waitlist_accepted':r'Number accepting a place.*?('+NUM+r')\D*$','waitlist_admitted':r'Number of wait-listed students admitted.*?('+NUM+r')\D*$','ed_applicants':r'(?:Number|er) of early decision applications received.*?('+NUM+r')\D*$','ed_admitted':r'Number of applicants admitted under early decision plan.*?('+NUM+r')\D*$','fee':r'(?:Amount of application fee|amount of the application fee)\s*:?\s*\$?('+NUM+r')','top_tenth':r'Percent in top (?:tenth|10th).*?('+NUM+r')%','top_quarter':r'Percent in top quarter.*?('+NUM+r')%','top_half':r'Percent in top half.*?('+NUM+r')%','rank_submitted':r'(?:Percent.*submitted high school class rank).*?('+NUM+r')%'}
    for key,pattern in patterns.items():
        if key not in metrics: numeric(key,pattern,'C2' if key.startswith('waitlist') else 'C21' if key.startswith('ed') else 'C13' if key=='fee' else 'C10')
    for key,prefix,pattern in [('sat','SAT1_COMP',r'SAT Composite'),('reading','SAT1_VERB',r'SAT (?:I Verbal|Critical Reading|Evidence-Based Reading and Writing|Evidence.*Writing|Evidence-Based Reading)'),('math','SAT1_MATH',r'SAT (?:I )?Math'),('act','ACT_COMP',r'ACT Composite')]:
        for percentile in [25,50,75]:
            name=f'{prefix}_{percentile}TH_P'
            if name in widgets: put(f'{key}_{percentile}',number(widgets[name][0]),'C9',widgets[name][1])
        if f'{key}_25' not in metrics:
            for pg in r['pages']:
                for l in pg['text'].splitlines():
                    m=re.search(pattern+r'\s*(?:\([^)]*\))?\s+('+NUM+r')\s+('+NUM+r')(?:\s+('+NUM+r'))?\s*$',l,re.I)
                    if m:
                        put(f'{key}_25',number(m[1]),'C9',pg['page']); put(f'{key}_75',number(m[3] or m[2]),'C9',pg['page'])
                        if m[3]: put(f'{key}_50',number(m[2]),'C9',pg['page'])
                        break
    for key,label,prefix in [('rd_deadline','Application closing date (fall)','AP_DL_FRSH'),('ed_deadline','First or only early decision plan closing date','AP_DL_EDEC_1'),('ed_notification','First or only early decision plan notification date','AP_NOTF_DL_EDEC_1')]:
        if prefix+'_MON' in widgets and prefix+'_DAY' in widgets:
            put(key,f'{widgets[prefix+"_MON"][0]}/{widgets[prefix+"_DAY"][0]}','C21' if key.startswith('ed') else 'C14',widgets[prefix+'_MON'][1])
        elif prefix+'_MON' in widgets:
            month=int(widgets[prefix+'_MON'][0]); put(key,['January','February','March','April','May','June','July','August','September','October','November','December'][month-1]+' (day not reported)','C21',widgets[prefix+'_MON'][1])
        else:
            m,p=linefind(re.escape(label)+r'\s*:?\s*_*\s*([^_]+?)\s*_?\s*$','C21')
            if m and m[1].strip() and not m[1].strip()==':': put(key,m[1].strip(),'C21' if key.startswith('ed') else 'C14',p)
    if widgets:
        rating={'VI':'Very important','I':'Important','C':'Considered','NC':'Not considered'}
        factor_names=[('Q111_'+str(i+1),FACTORS[i]) for i in range(6)]+[('Q112_'+str(i+1),FACTORS[i+6]) for i in range(13)]
        for name,label in factor_names:
            if name in widgets and widgets[name][0] in rating: factors.append({'label':label,'rating':rating[widgets[name][0]],'page':widgets[name][1]})
        if 'EXAM_CODE_S1A' in widgets: put('test_policy',{'ADMS_REQ':'Required','ADMS_CONS':'Consider if submitted','ADMS_NCON':'Not considered','ADMS_REC':'Recommended','ADMS_REQ_SOME':'Required for some'}.get(widgets['EXAM_CODE_S1A'][0],widgets['EXAM_CODE_S1A'][0]),'C8',widgets['EXAM_CODE_S1A'][1])
    elif r['year']==2022:
        header={str(c.value):c.column for c in s[86] if c.value}
        for row in list(s)[87:107]:
            label=next((str(c.value).strip() for c in row if c.value and str(c.value)!='X'),None)
            check=next((c for c in row if c.value=='X'),None)
            if label and check:
                rating=next((k for k,v in header.items() if v==check.column),'Needs review')
                factors.append({'label':label,'rating':rating[0].upper()+rating[1:].lower(),'page':1})
        # SAT or ACT is in the "consider if submitted" column.
        check=next((c for c in s[121] if c.value=='X'),None)
        if check: put('test_policy',str(s.cell(120,check.column).value),'C8',1)
    else:
        # Resolve marked C7 table columns from PDF coordinates, not whitespace.
        d=pymupdf.open(ROOT/f'data/sources/cornell-{r["year"]}.pdf')
        for pg in r['pages']:
            page=d[pg['page']-1]; words=page.get_text('words')
            if not ('rigor' in pg['text'].lower() or 'Secondary school record' in pg['text']): continue
            # Header columns Very Important, Important, Considered, Not Considered.
            starts=[v for v in words if v[4].lower()=='rigor'] or [v for v in words if v[4]=='Secondary']
            if not starts: continue
            table_top=min(v[1] for v in starts)
            anchors=sorted([w[0]+(w[2]-w[0])/2 for w in words if w[4].lower() in ['important','considered'] and table_top-50<w[1]<table_top])
            if len(anchors)<4 and pg['page']>1:
                previous=d[pg['page']-2].get_text('words')
                anchors=sorted([w[0]+(w[2]-w[0])/2 for w in previous if w[4].lower() in ['important','considered'] and w[1]>d[pg['page']-2].rect.height-150])
            if len(anchors)<4: continue
            anchors=anchors[-4:]
            graphic_marks=[]
            for draw in page.get_drawings():
                for item in draw['items']:
                    if item[0]=='l':
                        a,b=item[1],item[2]
                        if 3<abs(a.x-b.x)<15 and 3<abs(a.y-b.y)<15:
                            graphic_marks.append(((a.x+b.x)/2,(a.y+b.y)/2))
            for label in FACTORS:
                first=label.split()[0].lower()
                if label=='Rigor of secondary school record' and not any(w[4].lower()=='rigor' for w in words): first='secondary'
                if label=='Application essay' and not any(w[4].lower()=='application' and w[1]>table_top for w in words): first='essay'
                if label=='Racial/ethnic status' and not any(w[4].lower()=='racial/ethnic' for w in words): first='minority'
                if label=='Recommendations': first='recommendation'
                candidates=[w for w in words if w[4].lower().rstrip(':').replace('(s)','').rstrip('s')==first.rstrip('s')]
                if label=='Application essay': candidates=[w for w in words if w[4].lower() in ['application','essay']]
                if label=='Recommendations': candidates=[w for w in words if w[4].lower().startswith(('recommend','recommond'))]
                candidates=[w for w in candidates if w[1]>=table_top]
                for word in candidates:
                    marks=[w for w in words if w[4].upper()=='X' and abs(w[1]-word[1])<6 and w[0]>anchors[0]-50]
                    if marks:
                        mark=marks[0]; idx=min(range(4),key=lambda i:abs((mark[0]+mark[2])/2-anchors[i]))
                        factors.append({'label':label,'rating':['Very important','Important','Considered','Not considered'][idx],'page':pg['page']}); break
                    marks=[m for m in graphic_marks if abs(m[1]-(word[1]+word[3])/2)<5 and m[0]>anchors[0]-50]
                    if marks:
                        idx=min(range(4),key=lambda i:abs(marks[0][0]-anchors[i]))
                        factors.append({'label':label,'rating':['Very important','Important','Considered','Not considered'][idx],'page':pg['page']}); break
        if 'test_policy' not in metrics:
            for pg in r['pages']:
                page=d[pg['page']-1]; words=page.get_text('words')
                for row in page.search_for('SAT or ACT'):
                    if row.x0>180: continue
                    hdr=[w for w in words if row.y0-65<w[1]<row.y0 and w[0]>170 and w[4].lower() in ['require','required','recommend','recommended','consider','considered','not']]
                    hdr=sorted(hdr,key=lambda w:w[0])
                    if len(hdr)!=5: continue
                    anchors=[(w[0]+w[2])/2 for w in hdr]
                    marks=[((w[0]+w[2])/2,(w[1]+w[3])/2) for w in words if w[4].upper()=='X' and abs((w[1]+w[3])/2-(row.y0+row.y1)/2)<6]
                    for draw in page.get_drawings():
                        for item in draw['items']:
                            if item[0]=='l':
                                a,b=item[1],item[2]
                                if 3<abs(a.x-b.x)<15 and 3<abs(a.y-b.y)<15 and abs((a.y+b.y)/2-(row.y0+row.y1)/2)<6: marks.append(((a.x+b.x)/2,(a.y+b.y)/2))
                    if marks:
                        idx=min(range(5),key=lambda i:abs(marks[0][0]-anchors[i])); put('test_policy',['Required','Recommended','Required for some','Consider if submitted','Not considered'][idx],'C8',pg['page']); break
    # Capture submission percentages and wrapped SAT reading rows in older templates.
    for key in ['sat','act']:
        if key+'_submitted' not in metrics:
            numeric(key+'_submitted',r'(?:Percent submitting '+key+r' scores|Submitting '+key+r' Scores)\s*_?\s*('+NUM+r')%','C9')
    if 'reading_25' not in metrics:
        for pg in r['pages']:
            for i,line in enumerate(pg['text'].splitlines()):
                if re.search(r'SAT Evidence',line,re.I):
                    nums=re.findall(r'\b[6-8]\d{2}\b',line)
                    if len(nums)>=2: put('reading_25',number(nums[0]),'C9',pg['page']);put('reading_75',number(nums[-1]),'C9',pg['page']);break
    for key,n,d in [('admit_rate','admitted','applicants'),('yield_rate','enrolled','admitted'),('waitlist_rate','waitlist_admitted','waitlist_accepted'),('ed_rate','ed_admitted','ed_applicants')]:
        if metrics.get(d,0)>0 and n in metrics: put(key,round(metrics[n]/metrics[d]*100,3),evidence[n]['section'],evidence[n]['page'],'calculated')
    for key,numerator in [('sat_submitted','sat_submitted_count'),('act_submitted','act_submitted_count')]:
        if numerator in metrics and metrics.get('enrolled',0)>0: put(key,round(metrics[numerator]/metrics['enrolled']*100,2),'C9',evidence[numerator]['page'],'calculated')
    sections=[]
    for pg in r['pages']:
        t=pg['text']
        if pg==r['pages'][0] and first: t=t[t.find('C. FIRST-TIME'):]
        sections.append({'page':pg['page'],'text':t,'form_fields':pg['widgets']})
    warnings=[]
    if r['year']==2022: warnings.append('Section C comes from the official companion spreadsheet; the linked PDF contains only Section B. Spreadsheet dates are shown as month/day because its date years conflict with the reporting cohort.')
    if r['year']==2023: warnings.append('The official PDF and spreadsheet leave multiple policy responses and C7 factor ratings blank. Blank responses are preserved rather than inferred from adjacent years.')
    if r['year']==2007: warnings.append('The source reports SAT Critical Reading 630–770 and Math 660–730. These unusual ranges are preserved exactly as published.')
    if not metrics.get('sat_25'): warnings.append('SAT composite range is not reported. Reading and math percentiles are shown separately; they are not added together.')
    warnings.append('This report combines enrollment figures for its fall cohort with admissions policies for a later application cycle. Historical policies are not current admissions guidance.')
    return {k:r[k] for k in ['school_id','school','year','report_label','source_url','index_url','sha256','source_type']}|{'metrics':metrics,'evidence':evidence,'factors':factors,'sections':sections,'warnings':warnings,'extracted_at':'2026-10-07','review_status':'Extracted; source checks completed for headline metrics'}

if __name__=='__main__':
    raw=json.loads((ROOT/'data/reports-raw.json').read_text(encoding='utf8'))
    reports=[normalize(r) for r in raw]
    (ROOT/'data/reports.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
    for r in reports: print(r['year'],json.dumps(r['metrics']),len(r['factors']))
