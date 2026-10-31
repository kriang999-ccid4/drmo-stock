import openpyxl, re, datetime, sys, collections
from openpyxl.styles import Font, PatternFill
SRC=sys.argv[1]; DST=sys.argv[2]
wb=openpyxl.load_workbook(SRC)
SEG=re.compile(r'(เหลือ|ลบ|เข้้?า|คืน|คือ|ยืม)(.*?)(?=เหลือ|ลบ|เข้้?า|คืน|$)')
def num(s):
    try: return float(s.replace(',','').rstrip('.')) if s else None
    except: return None
def parse_date(h):
    if isinstance(h,datetime.datetime):
        flag='' if h.year in (1969,2569) else f'ปีในหัวคอลัมน์ผิดปกติ (พิมพ์เป็น {h.year+543})'
        return datetime.date(2026,h.month,h.day),flag
    return None, f'หัวคอลัมน์ไม่ใช่วันที่: {h}'
UNITS=r'(u|unit|amp|ขวด|กป|กล่อง|เส้น|ด้าม|set|เม็ด|cap|แผ่น|ครั้ง|cc|แก้ว|ชิ้น|หลอด|ซอง|ml|ชุด|แคปซูล|ถุง|ม้วน|แพ็ค|โหล|อัน|ตัว)'
PAIR=re.compile(r'([\d,]+(?:\.\d+)?)\s*'+UNITS+'?',re.I)
def parse_name(n):
    n=re.sub(r'\s+',' ',str(n)).strip().lstrip('-').strip()
    exp=re.search(r'\bexp?\b\.?\s*([\d/\.]+)',n,re.I)
    price=re.search(r'ราคา\s*([\d,]+)',n)
    clean=re.sub(r'\bexp?\b\.?\s*[\d/\.]*','',n,flags=re.I)
    clean=re.sub(r'ราคา\s*[\d,]*','',clean)
    return re.sub(r'\s+',' ',clean).strip(' -'),(exp.group(1) if exp else ''),(num(price.group(1)) if price else None)
KMAP={'เข้้า':'เข้า','คือ':'คืน'}
LBL={'เหลือ':'นับคงเหลือ','ลบ':'เบิกออก','เข้า':'รับเข้า','คืน':'คืน','ยืม':'ยืม'}
items=[];txs=[];issues=[];code=0;packs={};seen=set()
def add_issue(*row):
    key=(row[1],row[5]) if not row[5].startswith('ปี') else ('col',row[0],re.sub(r'\d+$','',row[3]),row[5])
    if key in seen: return
    seen.add(key); issues.append(row)
for ws in wb:
    loc=ws.title.strip(); hdr=[c.value for c in ws[1]]
    for r in ws.iter_rows(min_row=2):
        if not r[0].value or not str(r[0].value).strip(): continue
        code+=1; raw=str(r[0].value); name,exp,price=parse_name(raw); icode=f'IT{code:04d}'
        last_bal=None;last_date=None;unit='';after=[];n=0
        for c in r[1:]:
            v=c.value
            if v is None or str(v).strip()=='': continue
            n+=1; s=re.sub(r'\s+',' ',str(v).strip()); col=c.column-1
            h=hdr[col] if col<len(hdr) else None
            d,df=parse_date(h) if h is not None else (None,'ไม่มีวันที่ในหัวคอลัมน์')
            if df: add_issue(loc,icode,name,c.coordinate,s,df)
            segs=[(m.group(1),m.group(2)) for m in SEG.finditer(s)]
            if not segs: add_issue(loc,icode,name,c.coordinate,s,'อ่านรูปแบบไม่ออก');continue
            for kw,body in segs:
                kind=KMAP.get(kw,kw)
                pairs=[(num(a),(b or '').strip()) for a,b in PAIR.findall(body)]
                pairs=[(q,u) for q,u in pairs if q is not None]
                if not pairs: add_issue(loc,icode,name,c.coordinate,s,'ไม่มีตัวเลข');continue
                # prefer the pair in the item's base unit (e.g. 'u' over 'ขวด')
                pick=pairs[0]
                if unit:
                    for p in pairs:
                        if p[1].lower()==unit.lower(): pick=p;break
                q,u=pick
                note=' '.join(f'{int(a) if a==int(a) else a} {b}' for a,b in pairs if (a,b)!=pick)
                extra=PAIR.sub('',body).strip()
                note=(note+' '+extra).strip()
                if len(pairs)>1: packs.setdefault(icode,set()).add(tuple(sorted(f'{a:g} {b}' for a,b in pairs)))
                if kind=='เหลือ':
                    last_bal=q;last_date=d;after=[]
                    if u: unit=u
                else: after.append((kind,q,u))
                txs.append((d,loc,icode,name,LBL[kind],q,u,note,c.coordinate,s))
        est=last_bal;status='ok'
        if last_bal is None:
            if after and all(k=='เข้า' for k,_,_ in after): est=sum(q for _,q,_ in after);status='ไม่เคยนับ ใช้ยอดรวมรับเข้า'
            elif after: est=None;status='ไม่เคยนับคงเหลือ'
            else: status='ไม่มีข้อมูล'
        else:
            for k,q,u in after:
                if u and unit and u.lower()!=unit.lower(): status=f'หน่วยไม่ตรง ({u} กับ {unit})';est=None;break
                est = est - q if k in('ลบ','คืน') else est + q
            if est is not None and est<0: status='ติดลบ'
        if status!='ok' and status!='ไม่มีข้อมูล': add_issue(loc,icode,name,'',f'นับล่าสุด {last_bal} {unit}',status)
        items.append((icode,name,loc,unit,est,last_bal,last_date,len(after),exp,price,n,raw,status))
out=openpyxl.Workbook()
def sheet(ws,head,rows,widths):
    ws.append(head)
    for c in ws[1]: c.font=Font(bold=True,color='FFFFFF');c.fill=PatternFill('solid',fgColor='2F5D50')
    for r in rows: ws.append(list(r))
    for i,w in enumerate(widths): ws.column_dimensions[openpyxl.utils.get_column_letter(i+1)].width=w
    ws.freeze_panes='A2'; ws.auto_filter.ref=ws.dimensions
a=out.active;a.title='Items'
sheet(a,['รหัส','ชื่อสินค้า','ตำแหน่ง/หมวด','หน่วย','คงเหลือ (คำนวณ)','นับล่าสุด','วันที่นับล่าสุด','รายการหลังนับ','EXP','ราคา','จำนวนบันทึก','ชื่อเดิมในชีต','สถานะ'],items,[9,40,20,8,14,10,14,12,12,10,10,45,30])
for row in a.iter_rows(min_row=2):
    row[6].number_format='dd/mm/yyyy'
    if row[12].value not in('ok',): row[12].fill=PatternFill('solid',fgColor='FCE4D6')
t=out.create_sheet('Transactions')
sheet(t,['วันที่','ตำแหน่ง/หมวด','รหัส','ชื่อสินค้า','ประเภท','จำนวน','หน่วย','หมายเหตุ','เซลล์เดิม','ข้อความเดิม'],txs,[12,20,9,36,12,9,8,18,10,30])
for row in t.iter_rows(min_row=2): row[0].number_format='dd/mm/yyyy'
i=out.create_sheet('ต้องตรวจสอบ')
sheet(i,['ตำแหน่ง/หมวด','รหัส','ชื่อสินค้า','เซลล์','ข้อความ','ปัญหา'],issues,[20,9,36,8,30,40])
p=out.create_sheet('หน่วยบรรจุ (ต้องยืนยัน)')
sheet(p,['รหัส','ชื่อสินค้า','ตัวเลขที่พบคู่กันในช่องเดียว (ช่วยกำหนดขนาดบรรจุ เช่น 1 ขวด = 300 u)'],[(k,next(x[1] for x in items if x[0]==k),' ; '.join(' + '.join(t) for t in v)) for k,v in packs.items()],[9,40,60])
out.save(DST)
print('packs',len(packs))
print('items',len(items),'txs',len(txs),'issues',len(issues))
print(collections.Counter('หน่วยไม่ตรง' if x[12].startswith('หน่วย') else x[12] for x in items))
print(collections.Counter(x[4] for x in txs))
print(collections.Counter(x[5][:30] for x in issues).most_common(15))
print('exp',sum(1 for x in items if x[8]),'price',sum(1 for x in items if x[9]))
print('zero/neg',sum(1 for x in items if x[4] is not None and x[4]<=0))
