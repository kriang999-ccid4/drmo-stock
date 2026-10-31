"""สร้างไฟล์ฐานข้อมูลของแอป (drmo-stock-db.xlsx) จากไฟล์ที่แปลงด้วย convert.py
ใช้: python build_db.py "Stock clinic 2026 - ข้อมูลแปลงสำหรับแอป.xlsx" drmo-stock-db.xlsx [demo-data.js] [YYYY-MM-DD]
"""
import sys, re, json, datetime, calendar
import openpyxl
from openpyxl.styles import Font, PatternFill

SRC, DST = sys.argv[1], sys.argv[2]
DEMO = sys.argv[3] if len(sys.argv) > 3 else None
TODAY = datetime.date.fromisoformat(sys.argv[4]) if len(sys.argv) > 4 else datetime.date.today()

def parse_exp(s):
    if not s:
        return None
    p = [x for x in re.split(r'[/\.]', str(s)) if x]
    try:
        p = list(map(int, p))
    except ValueError:
        return None
    if len(p) == 3:
        d, m, y = p
    elif len(p) == 2:
        (m, y), d = p, None
    else:
        return None
    if y < 100: y += 2000
    if y > 2500: y -= 543
    if not (1 <= m <= 12): return None
    if d is None: d = calendar.monthrange(y, m)[1]
    try:
        return datetime.date(y, m, d)
    except ValueError:
        return None

src = openpyxl.load_workbook(SRC)
items_in = list(src['Items'].iter_rows(min_row=2, values_only=True))
tx_in = list(src['Transactions'].iter_rows(min_row=2, values_only=True))

now = datetime.datetime.combine(TODAY, datetime.time(8, 0))
items, lots = [], []
for (code, name, cat, unit, est, last_bal, last_date, n_after, exp, price, n, raw, status) in items_in:
    active = status != 'ไม่มีข้อมูล'
    note = '' if status == 'ok' else status
    qty = est if est is not None else ''
    items.append([code, name, cat, unit or '', qty, '', price if price is not None else '', active, note, now])
    e = parse_exp(exp)
    if e and isinstance(est, (int, float)) and est > 0:
        lots.append([f'L{len(lots)+1:05d}', code, '', e, est, '', 'ยอดตั้งต้นจากชีตเดิม (EXP ในชื่อสินค้า)'])

TYPE = {'นับคงเหลือ': 'COUNT', 'เบิกออก': 'OUT', 'รับเข้า': 'IN', 'คืน': 'RETURN', 'ยืม': 'BORROW'}
txs = []
for i, (d, loc, code, name, kind, q, u, note, cell, orig) in enumerate(tx_in, 1):
    txs.append([f'T{i:06d}', d, code, TYPE.get(kind, kind), q, u or '', '', 'นำเข้าจากชีตเดิม', (note + ' | ' if note else '') + f'{cell}: {orig}', now, ''])

settings = [
    ['clinic_name', 'DR.MO CLINIC', 'ชื่อที่แสดงในแอป'],
    ['alert_days_1', 90, 'แจ้งเตือนของใกล้หมดอายุ รอบแรก (วัน)'],
    ['alert_days_2', 180, 'แจ้งเตือนของใกล้หมดอายุ รอบสอง (วัน)'],
    ['notify_line_user_id', '', 'LINE userId ของผู้รับแจ้งเตือน (Nee) ใส่ภายหลัง'],
    ['notify_time', '08:30', 'เวลาส่งสรุปตอนเช้า'],
]
users = [['', 'Nee', 'admin', True]]

out = openpyxl.Workbook()
def sheet(ws, head, rows, widths, datecols=()):
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='503A3A')
    for r in rows: ws.append(r)
    for i, w in enumerate(widths):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
    for col in datecols:
        for c in ws.iter_rows(min_row=2, min_col=col, max_col=col):
            c[0].number_format = 'yyyy-mm-dd'
    ws.freeze_panes = 'A2'
ws = out.active; ws.title = 'Items'
sheet(ws, ['id', 'name', 'category', 'unit', 'qty', 'min_qty', 'price', 'active', 'note', 'updated_at'], items, [9, 40, 20, 8, 10, 9, 9, 8, 30, 18], (10,))
sheet(out.create_sheet('Lots'), ['lot_id', 'item_id', 'lot_no', 'exp', 'qty', 'received_at', 'note'], lots, [9, 9, 12, 12, 9, 12, 40], (4, 6))
sheet(out.create_sheet('Transactions'), ['tx_id', 'date', 'item_id', 'type', 'qty', 'unit', 'lot_id', 'by', 'note', 'created_at', 'batch_id'], txs, [10, 12, 9, 9, 9, 8, 9, 16, 40, 18, 16], (2, 10))
sheet(out.create_sheet('Settings'), ['key', 'value', 'description'], settings, [22, 30, 50])
sheet(out.create_sheet('Users'), ['line_user_id', 'display_name', 'role', 'active'], users, [36, 20, 10, 8])
out.save(DST)
print('items', len(items), 'lots', len(lots), 'txs', len(txs))

if DEMO:
    # same shape the Apps Script summary API returns
    cats = {}
    for it in items:
        if not it[7]: continue
        c = cats.setdefault(it[2], {'name': it[2], 'count': 0, 'out': 0})
        c['count'] += 1
        if isinstance(it[4], (int, float)) and it[4] <= 0: c['out'] += 1
    byid = {it[0]: it for it in items}
    exp = []
    for l in lots:
        days = (l[3] - TODAY).days
        if days <= 180 and l[4] > 0:
            it = byid[l[1]]
            exp.append({'days': days, 'name': it[1], 'category': it[2], 'qty': l[4], 'unit': it[3], 'exp': l[3].isoformat(), 'lot': l[2]})
    exp.sort(key=lambda e: e['days'])
    outs = [t for t in txs if t[3] == 'OUT' and t[1]]
    last = max(outs, key=lambda t: t[1])[1] if outs else None
    data = {
        'demo': True, 'asOf': TODAY.isoformat(), 'alertDays': [90, 180],
        'totals': {'items': sum(1 for it in items if it[7]), 'categories': len(cats)},
        'categories': list(cats.values()),
        'outCount': sum(c['out'] for c in cats.values()),
        'expiry': exp,
        'items': [{'id': it[0], 'name': it[1], 'category': it[2], 'unit': it[3], 'qty': it[4] if it[4] != '' else None} for it in items if it[7]],
        'lots': [{'lot_id': l[0], 'item_id': l[1], 'exp': l[3].isoformat(), 'qty': l[4]} for l in lots],
        'lastCut': {'date': last.date().isoformat() if hasattr(last, 'date') else str(last), 'by': ''} if last else None,
    }
    with open(DEMO, 'w', encoding='utf-8') as f:
        f.write('// ข้อมูลตัวอย่าง ใช้เมื่อยังไม่ได้ตั้ง API_URL ใน config.js (สร้างโดย tools/build_db.py)\nwindow.DEMO_DATA = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('demo: active', data['totals'], 'out', data['outCount'], 'exp', len(exp), 'lastCut', data['lastCut'])
