/**
 * DR.MO Stock — Apps Script backend
 * ผูกกับ Google Sheet ที่นำเข้า data/drmo-stock-db.xlsx (ชีต Items, Lots, Transactions, Settings, Users)
 *
 * API (Deploy เป็น Web app แล้วเรียกจากหน้าแอป)
 *   GET ?action=summary   ข้อมูลหน้าแรก
 *   GET ?action=items     รายการสินค้าทั้งหมด (ใช้ในหน้าตัดยอด/สต๊อก ขั้นต่อไป)
 *   GET ?action=ping      ทดสอบการเชื่อมต่อ
 *   POST {action:'cut', date:'yyyy-MM-dd', by:'Nee', lines:[{itemId, qty, note}]}   บันทึกตัดยอดประจำวัน
 *   POST {action:'undoCut', batchId:'B...'}                                       ยกเลิกการตัดยอดชุดนั้น
 *   (หน้าแอปส่ง POST แบบ text/plain เพื่อไม่ให้ติด CORS)
 */

var TZ = 'Asia/Bangkok';
var SHEETS = {
  items: { name: 'Items', head: ['id', 'name', 'category', 'unit', 'qty', 'min_qty', 'price', 'active', 'note', 'updated_at'] },
  lots: { name: 'Lots', head: ['lot_id', 'item_id', 'lot_no', 'exp', 'qty', 'received_at', 'note'] },
  txs: { name: 'Transactions', head: ['tx_id', 'date', 'item_id', 'type', 'qty', 'unit', 'lot_id', 'by', 'note', 'created_at', 'batch_id'] },
  settings: { name: 'Settings', head: ['key', 'value', 'description'] },
  users: { name: 'Users', head: ['line_user_id', 'display_name', 'role', 'active'] }
};

// ---------------- Web app ----------------
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    var data;
    if (action === 'ping') data = { pong: true, time: new Date().toISOString() };
    else if (action === 'summary') data = getSummary_();
    else if (action === 'items') data = getItems_();
    else throw new Error('ไม่รู้จัก action: ' + action);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var data;
    if (body.action === 'cut') data = saveCut_(body);
    else if (body.action === 'undoCut') data = undoCut_(body);
    else throw new Error('ไม่รู้จัก action: ' + body.action);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Reading sheets ----------------
function readTable_(key, withRows) {
  var def = SHEETS[key];
  var sh = SpreadsheetApp.getActive().getSheetByName(def.name);
  if (!sh) throw new Error('ไม่พบชีต ' + def.name + ' — รัน setup() ก่อน');
  var values = sh.getDataRange().getValues();
  var head = values.shift().map(String);
  var out = [];
  values.forEach(function (r, i) {
    if (r.join('') === '') return;
    var o = {};
    head.forEach(function (h, j) { o[h] = r[j]; });
    if (withRows) o._row = i + 2;
    out.push(o);
  });
  return out;
}

function readSettings_() {
  var s = {};
  readTable_('settings').forEach(function (r) { if (r.key) s[r.key] = r.value; });
  return s;
}

function ymd_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }

function getItems_() {
  return readTable_('items').filter(function (it) { return isActive_(it.active); }).map(function (it) {
    return { id: it.id, name: it.name, category: it.category, unit: it.unit, qty: it.qty === '' ? null : Number(it.qty), minQty: it.min_qty === '' ? null : Number(it.min_qty) };
  });
}

function isActive_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function getSummary_() {
  return buildSummary_({
    items: readTable_('items'),
    lots: readTable_('lots'),
    txs: readTable_('txs'),
    settings: readSettings_(),
    today: ymd_(new Date())
  });
}

/**
 * คำนวณข้อมูลหน้าแรก (แยกเป็นฟังก์ชันบริสุทธิ์ เพื่อทดสอบนอก Apps Script ได้)
 * input.today เป็น 'yyyy-MM-dd' ตามเวลาไทย; วันที่ในชีตเป็น Date หรือข้อความ 'yyyy-MM-dd'
 */
function buildSummary_(input) {
  var alert1 = Number(input.settings.alert_days_1) || 90;
  var alert2 = Number(input.settings.alert_days_2) || 180;
  var today = toDay_(input.today);

  var active = input.items.filter(function (it) { return isActive_(it.active); });
  var byId = {};
  active.forEach(function (it) { byId[it.id] = it; });

  var cats = {}, order = [];
  active.forEach(function (it) {
    if (!cats[it.category]) { cats[it.category] = { name: it.category, count: 0, out: 0 }; order.push(it.category); }
    cats[it.category].count++;
    if (isOut_(it)) cats[it.category].out++;
  });

  var expiry = [];
  input.lots.forEach(function (l) {
    var it = byId[l.item_id];
    var qty = Number(l.qty);
    if (!it || !(qty > 0) || !l.exp) return;
    var days = Math.round((toDay_(l.exp) - today) / 86400000);
    if (days > alert2) return;
    expiry.push({ days: days, name: it.name, category: it.category, qty: qty, unit: it.unit, exp: dayStr_(l.exp), lot: l.lot_no || '' });
  });
  expiry.sort(function (a, b) { return a.days - b.days; });

  var lastCut = null;
  input.txs.forEach(function (t) {
    if (t.type !== 'OUT' || !t.date) return;
    var d = dayStr_(t.date);
    if (!lastCut || d > lastCut.date) lastCut = { date: d, by: t.by === 'นำเข้าจากชีตเดิม' ? '' : String(t.by || '') };
  });

  var categories = order.map(function (k) { return cats[k]; });
  return {
    demo: false,
    asOf: input.today,
    alertDays: [alert1, alert2],
    totals: { items: active.length, categories: categories.length },
    categories: categories,
    outCount: categories.reduce(function (s, c) { return s + c.out; }, 0),
    expiry: expiry,
    lastCut: lastCut
  };
}

function isOut_(it) {
  if (it.qty === '' || it.qty === null) return false;
  var q = Number(it.qty), min = it.min_qty === '' || it.min_qty === null ? 0 : Number(it.min_qty);
  return q <= min;
}

// วันที่ -> เที่ยงคืนของวันนั้น (ตัดเวลาออก) เพื่อนับจำนวนวันได้ตรง
function toDay_(v) {
  var s = dayStr_(v).split('-').map(Number);
  return Date.UTC(s[0], s[1] - 1, s[2]);
}
function dayStr_(v) {
  if (v instanceof Date) return (typeof Utilities !== 'undefined') ? ymd_(v) : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// ---------------- Writing: daily cut ----------------
function sheetOf_(key) { return SpreadsheetApp.getActive().getSheetByName(SHEETS[key].name); }
function col_(key, name) { return SHEETS[key].head.indexOf(name) + 1; }

function saveCut_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var items = readRows_('items'), lots = readRows_('lots');
    var now = new Date();
    var batchId = 'B' + Utilities.formatDate(now, TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
    var plan = applyCut_(items, lots, body, { batchId: batchId, createdAt: now });

    var itemSh = sheetOf_('items'), lotSh = sheetOf_('lots'), txSh = sheetOf_('txs');
    plan.itemUpdates.forEach(function (u) {
      itemSh.getRange(u.row, col_('items', 'qty')).setValue(u.qty);
      itemSh.getRange(u.row, col_('items', 'updated_at')).setValue(now);
    });
    plan.lotUpdates.forEach(function (u) { lotSh.getRange(u.row, col_('lots', 'qty')).setValue(u.qty); });
    var rows = plan.txRows.map(function (r) { r[1] = toSheetDate_(r[1]); return r; });
    txSh.getRange(txSh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return { batchId: batchId, date: body.date, by: body.by, results: plan.results };
  } finally {
    lock.releaseLock();
  }
}

function undoCut_(body) {
  if (!body.batchId) throw new Error('ไม่มีรหัสชุดที่จะยกเลิก');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var txs = readRows_('txs').filter(function (t) { return t.batch_id === body.batchId && t.type === 'OUT'; });
    if (!txs.length) throw new Error('ไม่พบการตัดยอดชุดนี้ อาจถูกยกเลิกไปแล้ว');
    var items = readRows_('items'), lots = readRows_('lots');
    var itemById = {}, lotById = {};
    items.forEach(function (it) { itemById[it.id] = it; });
    lots.forEach(function (l) { lotById[l.lot_id] = l; });
    var itemSh = sheetOf_('items'), lotSh = sheetOf_('lots'), txSh = sheetOf_('txs');
    var back = {};
    txs.forEach(function (t) {
      back[t.item_id] = (back[t.item_id] || 0) + Number(t.qty);
      var l = lotById[t.lot_id];
      if (l) { l.qty = Number(l.qty) + Number(t.qty); lotSh.getRange(l._row, col_('lots', 'qty')).setValue(l.qty); }
    });
    Object.keys(back).forEach(function (id) {
      var it = itemById[id];
      if (!it || it.qty === '' || it.qty === null) return;
      itemSh.getRange(it._row, col_('items', 'qty')).setValue(round_(Number(it.qty) + back[id]));
      itemSh.getRange(it._row, col_('items', 'updated_at')).setValue(new Date());
    });
    txs.map(function (t) { return t._row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { txSh.deleteRow(r); });
    return { batchId: body.batchId, undone: txs.length };
  } finally {
    lock.releaseLock();
  }
}

function readRows_(key) {
  return readTable_(key, true);
}

function toSheetDate_(s) {
  var p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function round_(n) { return Math.round(n * 1000) / 1000; }

/**
 * วางแผนการตัดยอด (ฟังก์ชันบริสุทธิ์ ทดสอบนอก Apps Script ได้)
 * - รวมรายการซ้ำ, ตรวจจำนวน, หักจากยอดสินค้า
 * - หักจากล็อตที่หมดอายุก่อน (FEFO) แยกเป็น 1 แถวต่อ 1 ล็อต ส่วนที่เกินยอดล็อตบันทึกโดยไม่ระบุล็อต
 */
function applyCut_(items, lots, body, meta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) throw new Error('วันที่ไม่ถูกต้อง');
  var by = String(body.by || '').trim();
  if (!by) throw new Error('ไม่มีชื่อผู้ตัดยอด');
  var lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) throw new Error('ยังไม่ได้เลือกรายการ');
  if (lines.length > 300) throw new Error('รายการมากเกินไปในครั้งเดียว');

  var byId = {};
  items.forEach(function (it) { byId[it.id] = it; });
  var merged = {}, order = [];
  lines.forEach(function (ln) {
    var q = Number(ln.qty);
    if (!(q > 0)) throw new Error('จำนวนต้องมากกว่า 0');
    var it = byId[ln.itemId];
    if (!it || !isActive_(it.active)) throw new Error('ไม่พบสินค้า ' + ln.itemId);
    if (!merged[ln.itemId]) { merged[ln.itemId] = { qty: 0, note: '' }; order.push(ln.itemId); }
    merged[ln.itemId].qty = round_(merged[ln.itemId].qty + q);
    if (ln.note) merged[ln.itemId].note = String(ln.note).slice(0, 200);
  });

  var txRows = [], itemUpdates = [], lotUpdates = [], results = [], n = 0;
  order.forEach(function (id) {
    var it = byId[id], q = merged[id].qty, left = q;
    var known = !(it.qty === '' || it.qty === null);
    var before = known ? Number(it.qty) : null, after = known ? round_(before - q) : null;
    if (known) itemUpdates.push({ row: it._row, qty: after });

    var mine = lots.filter(function (l) { return l.item_id === id && Number(l.qty) > 0; })
      .sort(function (a, b) { return (a.exp ? dayStr_(a.exp) : '9999') < (b.exp ? dayStr_(b.exp) : '9999') ? -1 : 1; });
    var portions = [];
    mine.forEach(function (l) {
      if (left <= 0) return;
      var take = Math.min(left, Number(l.qty));
      l.qty = round_(Number(l.qty) - take);
      lotUpdates.push({ row: l._row, qty: l.qty });
      portions.push({ lot: l.lot_id, qty: round_(take) });
      left = round_(left - take);
    });
    if (left > 0) portions.push({ lot: '', qty: left });
    portions.forEach(function (p) {
      n++;
      txRows.push([meta.batchId + '-' + n, body.date, id, 'OUT', p.qty, it.unit || '', p.lot, by, merged[id].note, meta.createdAt, meta.batchId]);
    });
    results.push({ itemId: id, name: it.name, unit: it.unit || '', qty: q, before: before, after: after });
  });
  return { txRows: txRows, itemUpdates: itemUpdates, lotUpdates: lotUpdates, results: results };
}

// ---------------- Setup ----------------
/** รันครั้งเดียวหลังนำเข้าไฟล์ drmo-stock-db.xlsx: ตรวจหัวตาราง สร้างชีตที่ขาด และจัดรูปแบบวันที่ */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var report = [];
  Object.keys(SHEETS).forEach(function (k) {
    var def = SHEETS[k];
    var sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      sh.getRange(1, 1, 1, def.head.length).setValues([def.head]);
      report.push('สร้างชีต ' + def.name);
    } else {
      var head = sh.getRange(1, 1, 1, def.head.length).getValues()[0].map(String);
      // เติมคอลัมน์ใหม่ที่ต่อท้าย (เช่น batch_id) ถ้ายังว่างอยู่
      def.head.forEach(function (h, i) {
        if (head[i] === '') { sh.getRange(1, i + 1).setValue(h); head[i] = h; report.push('เพิ่มคอลัมน์ ' + h + ' ในชีต ' + def.name); }
      });
      var missing = def.head.filter(function (h, i) { return head[i] !== h; });
      if (missing.length) throw new Error('หัวตารางชีต ' + def.name + ' ไม่ตรง ต้องเป็น: ' + def.head.join(', '));
      report.push(def.name + ' ' + (sh.getLastRow() - 1) + ' แถว');
    }
    sh.setFrozenRows(1);
  });
  ss.setSpreadsheetTimeZone(TZ);
  Logger.log(report.join('\n'));
  return report;
}

/** ทดสอบหลัง setup(): ดูผลใน Execution log */
function testSummary() {
  var s = getSummary_();
  Logger.log(JSON.stringify({ totals: s.totals, outCount: s.outCount, expiry: s.expiry.length, lastCut: s.lastCut }));
}

if (typeof module !== 'undefined') module.exports = { buildSummary_: buildSummary_, applyCut_: applyCut_, isActive_: isActive_ };
