(function () {
  'use strict';
  // นับสต๊อก: กรอกยอดของจริง ระบบปรับยอดและบันทึกส่วนต่าง (ADJUST)
  var DM = window.DM, CFG = DM.CFG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = DM.esc, fmtNum = DM.fmtNum;
  var KEY_DRAFT = 'drmo-stock-count-draft';
  var MAX_ROWS = 80;

  var items = [], byId = {}, cat = null, q = '';
  var entries = {};   // itemId -> { sealed, open } (มีขนาดบรรจุ) หรือ { total }
  var lastBatch = null;

  function demo() { return !CFG.API_URL; }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hasPack(it) { return !!(it.packSize && it.packUnit); }
  function num(v) { return v === '' || v === undefined || v === null ? null : Number(v); }

  /** ยอดรวมที่นับได้ (หน่วยย่อย) หรือ null ถ้ายังไม่ได้กรอก */
  function countedOf(it) {
    var e = entries[it.id]; if (!e) return null;
    if (hasPack(it)) {
      var s = num(e.sealed), o = num(e.open);
      if (s === null && o === null) return null;
      return Math.round(((s || 0) * it.packSize + (o || 0)) * 1000) / 1000;
    }
    return num(e.total);
  }
  function filled() { return items.filter(function (it) { return countedOf(it) !== null; }); }

  function saveDraft() { DM.store.set(KEY_DRAFT, JSON.stringify({ date: $('ct-date').value, entries: entries })); }
  function loadDraft() {
    try { var d = JSON.parse(DM.store.get(KEY_DRAFT) || 'null'); if (d && d.entries) { entries = d.entries; if (d.date) $('ct-date').value = d.date; } } catch (e) {}
  }

  function load(force) {
    return DM.loadItems(force).then(function (list) {
      items = list || []; byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      if (!cat && items.length) cat = items[0].category;
      renderChips(); renderList(); updateBar();
    });
  }

  function renderChips() {
    var counts = {}, order = [], done = {};
    items.forEach(function (it) {
      if (counts[it.category] === undefined) { counts[it.category] = 0; done[it.category] = 0; order.push(it.category); }
      counts[it.category]++; if (countedOf(it) !== null) done[it.category]++;
    });
    $('ct-cats').innerHTML = order.map(function (k) {
      return '<button class="chip" type="button" data-cat="' + esc(k) + '" aria-pressed="' + (cat === k && !q) + '">' + esc(k) + '<span class="cnt">' + (done[k] ? done[k] + '/' : '') + counts[k] + '</span></button>';
    }).join('');
  }

  function resultHtml(it) {
    var c = countedOf(it);
    if (c === null) return '';
    if (it.qty === null || it.qty === undefined) return '<span class="ct-res up">นับได้ ' + esc(DM.fmtStock(it, c)) + ' · ตั้งยอดเริ่มต้น</span>';
    var d = Math.round((c - it.qty) * 1000) / 1000, u = it.unit ? ' ' + esc(it.unit) : '';
    if (d === 0) return '<span class="ct-res ok">✓ ตรงกับระบบ</span>';
    return '<span class="ct-res ' + (d > 0 ? 'up">เกิน +' : 'down">ขาด −') + fmtNum(Math.abs(d)) + u + ' · นับได้ ' + fmtNum(c) + u + '</span>';
  }

  function rowHtml(it) {
    var e = entries[it.id] || {}, v = function (x) { return x === undefined || x === null ? '' : esc(String(x)); };
    var inputs = hasPack(it)
      ? '<label>ยังไม่เปิด <input inputmode="decimal" data-f="sealed" value="' + v(e.sealed) + '" placeholder="0" aria-label="' + esc(it.name) + ' ยังไม่เปิด"> ' + esc(it.packUnit) + '</label>' +
        '<label>เปิดแล้วเหลือ <input inputmode="decimal" data-f="open" value="' + v(e.open) + '" placeholder="0" aria-label="' + esc(it.name) + ' เปิดแล้วเหลือ"> ' + esc(it.unit || '') + '</label>'
      : '<label>นับได้ <input inputmode="decimal" data-f="total" value="' + v(e.total) + '" placeholder="–" aria-label="' + esc(it.name) + ' นับได้"> ' + esc(it.unit || '') + '</label>';
    return '<div class="ct-row' + (countedOf(it) !== null ? ' on' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="top"><span class="name">' + esc(it.name) + (it.packNote === 'รอยืนยัน' ? '<span class="pk-pending">ขนาดบรรจุรอยืนยัน</span>' : '') + '</span><span class="sys">ระบบ: ' + esc(DM.fmtStock(it)) + '</span></div>' +
      '<div class="ct-in">' + inputs + '</div><div class="res">' + resultHtml(it) + '</div></div>';
  }

  function renderList() {
    var qq = q.trim().toLowerCase();
    var list = items.filter(function (it) {
      if (qq) return String(it.name).toLowerCase().indexOf(qq) >= 0;
      return it.category === cat;
    });
    var html = list.slice(0, MAX_ROWS).map(rowHtml).join('');
    if (!items.length) html = '<div class="empty">กำลังโหลดรายการสินค้า</div>';
    else if (!list.length) html = '<div class="empty">ไม่พบสินค้า</div>';
    if (list.length > MAX_ROWS) html += '<div class="list-foot">แสดง ' + MAX_ROWS + ' จาก ' + list.length + ' รายการ · พิมพ์ค้นหาเพื่อดูเพิ่ม</div>';
    $('ct-list').innerHTML = html;
  }

  function updateRow(id) {
    var row = document.querySelector('.ct-row[data-id="' + CSS.escape(id) + '"]'); if (!row) return;
    var it = byId[id];
    row.classList.toggle('on', countedOf(it) !== null);
    row.querySelector('.res').innerHTML = resultHtml(it);
  }
  function updateBar() {
    var n = filled().length;
    $('ct-n').textContent = n;
    $('ct-bar').hidden = !n || !$('ct-done').hidden || $('view-count').hidden;
  }

  // ---------- events ----------
  $('ct-cats').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    cat = b.dataset.cat; q = ''; $('ct-q').value = ''; renderChips(); renderList(); window.scrollTo(0, 0);
  });
  var qt;
  $('ct-q').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { q = e.target.value; renderChips(); renderList(); }, 120); });
  $('ct-list').addEventListener('input', function (e) {
    var inp = e.target.closest('input[data-f]'); if (!inp) return;
    var raw = inp.value.replace(/[^\d.]/g, ''); if (raw !== inp.value) inp.value = raw;
    var id = inp.closest('.ct-row').dataset.id;
    var en = entries[id] || {}; en[inp.dataset.f] = raw;
    if (['sealed', 'open', 'total'].every(function (k) { return en[k] === undefined || en[k] === ''; })) delete entries[id]; else entries[id] = en;
    updateRow(id); updateBar(); saveDraft();
  });
  $('ct-list').addEventListener('focusout', function () { renderChips(); });
  $('ct-date').addEventListener('change', saveDraft);
  $('ct-clear').onclick = function () { entries = {}; saveDraft(); renderChips(); renderList(); updateBar(); DM.say('ล้างยอดที่กรอกแล้ว'); };

  // ---------- review & save ----------
  function openReview() {
    var list = filled(), down = 0, up = 0;
    $('ct-rv-lead').textContent = 'นับวันที่ ' + DM.fmtShort($('ct-date').value) + ' · โดย ' + DM.getUser() + ' · ' + list.length + ' รายการ';
    $('ct-rv-list').innerHTML = list.map(function (it) {
      var c = countedOf(it), known = !(it.qty === null || it.qty === undefined);
      var d = known ? Math.round((c - it.qty) * 1000) / 1000 : null, u = it.unit ? ' ' + esc(it.unit) : '';
      if (d < 0) down++; if (d > 0) up++;
      var q = d === null ? '<span style="color:var(--info)">ตั้งยอด</span>' : d === 0 ? '<span style="color:var(--ok)">ตรง</span>' :
        '<span style="color:var(--' + (d > 0 ? 'info)">+' : 'crit)">−') + fmtNum(Math.abs(d)) + u + '</span>';
      return '<div class="rv"><div class="name">' + esc(it.name) + '</div><div class="q">' + q + '</div><div class="ba">ระบบ ' + esc(DM.fmtStock(it)) + ' → นับได้ ' + esc(DM.fmtStock(it, c)) + '</div></div>';
    }).join('');
    var w = $('ct-rv-warn');
    w.hidden = !(down || up);
    w.textContent = 'ขาด ' + down + ' รายการ · เกิน ' + up + ' รายการ · ยอดในระบบจะถูกปรับเป็นยอดที่นับได้ และเก็บส่วนต่างไว้ในประวัติ';
    $('ct-rv-err').hidden = true;
    $('ct-rv-save').disabled = false; $('ct-rv-save').textContent = 'บันทึกและปรับยอด';
    $('ct-review-s').hidden = false;
  }
  function closeReview() { $('ct-review-s').hidden = true; }
  $('ct-review').onclick = openReview;
  $('ct-rv-back').onclick = closeReview;
  $('ct-review-s').addEventListener('click', function (e) { if (e.target === $('ct-review-s')) closeReview(); });

  function applyDemo(body) {
    var D = window.DEMO_DATA;
    var results = body.lines.map(function (ln) {
      var it = D.items.find(function (x) { return x.id === ln.itemId; });
      var before = it.qty, after = ln.counted, diff = Math.round((after - (before || 0)) * 1000) / 1000;
      it.qty = after;
      return { itemId: it.id, name: it.name, unit: it.unit, before: before, after: after, diff: diff };
    });
    var batchId = 'DEMO-C' + Date.now();
    if (!D.history) D.history = [];
    D.history.unshift({ batchId: batchId, type: 'ADJUST', date: body.date, by: body.by, createdAt: new Date().toISOString(),
      lines: results.map(function (r) { return { itemId: r.itemId, name: r.name, unit: r.unit, qty: r.diff }; }) });
    return { batchId: batchId, date: body.date, by: body.by, results: results };
  }

  $('ct-rv-save').onclick = function () {
    var btn = $('ct-rv-save');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    var body = { action: 'count', date: $('ct-date').value, by: DM.getUser(), lines: filled().map(function (it) { return { itemId: it.id, counted: countedOf(it) }; }) };
    var p = demo() ? Promise.resolve().then(function () { return applyDemo(body); }) : DM.apiPost(body);
    p.then(function (res) {
      lastBatch = { batchId: res.batchId, demo: demo(), entries: JSON.parse(JSON.stringify(entries)), date: res.date };
      entries = {}; saveDraft(); closeReview(); showDone(res);
      document.dispatchEvent(new CustomEvent('dm:stock-changed'));
      load(true); DM.reloadHome();
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'ลองบันทึกอีกครั้ง';
      var e = $('ct-rv-err'); e.hidden = false; e.textContent = 'บันทึกไม่สำเร็จ: ' + err.message + ' ยอดที่กรอกยังอยู่';
    });
  };

  function showDone(res) {
    $('ct-main').hidden = true; $('ct-done').hidden = false; $('ct-bar').hidden = true;
    var diffN = res.results.filter(function (r) { return r.diff !== 0; }).length;
    $('ct-done-title').textContent = 'บันทึกการนับ ' + res.results.length + ' รายการ';
    $('ct-done-sub').textContent = (diffN ? 'ปรับยอด ' + diffN + ' รายการ' : 'ยอดตรงทุกรายการ') + ' · วันที่ ' + DM.fmtShort(res.date) + ' · โดย ' + res.by;
    $('ct-done-demo').hidden = !lastBatch.demo;
    $('ct-done-list').innerHTML = res.results.map(function (r) {
      var u = r.unit ? ' ' + esc(r.unit) : '';
      var d = r.diff === 0 ? '<b style="color:var(--ok)">ตรง</b>' : '<b style="color:var(--' + (r.diff > 0 ? 'info)">+' : 'crit)">−') + fmtNum(Math.abs(r.diff)) + '</b>';
      return '<div class="item"><div class="name">' + esc(r.name) + '</div><div class="sub">' + (r.before === null ? 'เดิมไม่ทราบยอด' : 'ระบบ ' + fmtNum(r.before) + u) + ' → ' + fmtNum(r.after) + u + '</div><div class="qty">' + d + '<span>' + esc(r.unit || '') + '</span></div></div>';
    }).join('');
    var u = $('ct-undo'); u.disabled = false; u.textContent = 'ยกเลิกการนับชุดนี้';
    window.scrollTo(0, 0);
  }
  function backToMain() { $('ct-main').hidden = false; $('ct-done').hidden = true; renderChips(); renderList(); updateBar(); }
  $('ct-again').onclick = backToMain;

  var armed = false;
  $('ct-undo').onclick = function () {
    var u = $('ct-undo');
    if (!armed) { armed = true; u.textContent = 'กดอีกครั้งเพื่อยืนยันการยกเลิก'; setTimeout(function () { if (armed) { armed = false; u.textContent = 'ยกเลิกการนับชุดนี้'; } }, 4000); return; }
    armed = false; u.disabled = true; u.textContent = 'กำลังยกเลิก…';
    var b = lastBatch;
    var p = b.demo ? Promise.resolve().then(function () { DM.demoUndo(b.batchId); }) : DM.apiPost({ action: 'undoCut', batchId: b.batchId });
    p.then(function () {
      entries = b.entries; $('ct-date').value = b.date; saveDraft(); lastBatch = null;
      document.dispatchEvent(new CustomEvent('dm:stock-changed'));
      load(true).then(function () { backToMain(); DM.say('ยกเลิกแล้ว ยอดที่กรอกยังอยู่ให้แก้ไข'); });
      DM.reloadHome();
    }).catch(function (err) { u.disabled = false; u.textContent = 'ยกเลิกการนับชุดนี้'; DM.say('ยกเลิกไม่สำเร็จ: ' + err.message); });
  };

  // ---------- enter view ----------
  $('ct-date').value = isoDay(new Date());
  $('ct-date').max = isoDay(new Date());
  loadDraft();
  document.addEventListener('dm:user', function (e) { $('ct-by').textContent = e.detail; });
  document.addEventListener('dm:view', function (e) {
    if (e.detail !== 'count') { $('ct-bar').hidden = true; closeReview(); return; }
    $('ct-by').textContent = DM.getUser();
    if (!$('ct-done').hidden) { lastBatch = null; $('ct-main').hidden = false; $('ct-done').hidden = true; }
    load(false);
  });
})();
