(function () {
  'use strict';
  var DM = window.DM, CFG = DM.CFG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = DM.esc, fmtNum = DM.fmtNum;
  var KEY_DRAFT = 'drmo-stock-receive-draft';
  var MAX_ROWS = 60;

  var items = [], byId = {}, cat = '__all', q = '';
  var lines = [];          // {itemId | newItem, qty, exp, lotNo, note}
  var editing = null;      // { index } | { itemId } | { isNew: true }
  var lastBatch = null;

  function demo() { return !CFG.API_URL; }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return isoDay(new Date()); }

  // ---------- draft ----------
  function saveDraft() { DM.store.set(KEY_DRAFT, JSON.stringify({ date: $('rc-date').value, lines: lines })); }
  function loadDraft() {
    try { var d = JSON.parse(DM.store.get(KEY_DRAFT) || 'null'); if (d && d.lines) { lines = d.lines; if (d.date) $('rc-date').value = d.date; } } catch (e) {}
  }

  // ---------- items ----------
  function load(force) {
    return DM.loadItems(force).then(function (list) {
      items = list || []; byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      lines = lines.filter(function (ln) { return ln.newItem || byId[ln.itemId]; });
      renderChips(); renderList(); renderLines();
    });
  }
  function categories() {
    var seen = {}, out = [];
    items.forEach(function (it) { if (!seen[it.category]) { seen[it.category] = 0; out.push(it.category); } seen[it.category]++; });
    return { order: out, counts: seen };
  }

  function renderChips() {
    var c = categories();
    $('rc-cats').innerHTML = '<button class="chip" type="button" data-cat="__all" aria-pressed="' + (cat === '__all') + '">ทั้งหมด</button>' +
      c.order.map(function (k) { return '<button class="chip" type="button" data-cat="' + esc(k) + '" aria-pressed="' + (cat === k) + '">' + esc(k) + '<span class="cnt">' + c.counts[k] + '</span></button>'; }).join('');
  }
  function stockText(it) {
    return it.qty === null || it.qty === undefined ? 'ยังไม่ทราบยอด' : 'มีอยู่ ' + esc(DM.fmtStock(it));
  }
  function renderList() {
    var qq = q.trim().toLowerCase();
    var list = items.filter(function (it) {
      if (cat !== '__all' && it.category !== cat) return false;
      return !qq || String(it.name).toLowerCase().indexOf(qq) >= 0;
    });
    var html = list.slice(0, MAX_ROWS).map(function (it) {
      return '<div class="rc-row"><div><div class="name">' + esc(it.name) + '</div><div class="sub">' + stockText(it) + ' · ' + esc(it.category) + '</div></div>' +
        '<button class="rc-add" type="button" data-id="' + esc(it.id) + '">+ รับเข้า</button></div>';
    }).join('');
    if (!items.length) html = '<div class="empty">กำลังโหลดรายการสินค้า</div>';
    else if (!list.length) html = '<div class="empty">ไม่พบสินค้า · กด "+ สินค้าใหม่" ถ้าเป็นสินค้าที่ยังไม่เคยมี</div>';
    if (list.length > MAX_ROWS) html += '<div class="list-foot">แสดง ' + MAX_ROWS + ' จาก ' + list.length + ' รายการ · พิมพ์ค้นหาเพื่อดูเพิ่ม</div>';
    $('rc-list').innerHTML = html;
  }

  function lineName(ln) { return ln.newItem ? ln.newItem.name : (byId[ln.itemId] || {}).name; }
  function lineUnit(ln) { return ln.newItem ? ln.newItem.unit : (byId[ln.itemId] || {}).unit; }
  function lineQtyText(ln) {
    var base = '+' + fmtNum(ln.qty) + ' ' + esc(lineUnit(ln) || '');
    return ln.packQty ? '+' + fmtNum(ln.packQty) + ' ' + esc(ln.packUnit) + ' <span class="sub-q">(' + base + ')</span>' : base;
  }
  // หน่วยที่กรอกในฟอร์ม: 'pack' (ขวด/กล่อง) หรือ 'base' (u/cc/amp)
  var qtyMode = 'base', formPack = null;
  function setQtyMode(m) {
    qtyMode = m;
    document.querySelectorAll('#rc-f-mode button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.m === m)); });
    $('rc-f-unit-l').textContent = formPack ? '(' + (m === 'pack' ? formPack.packUnit : formPack.unit || 'หน่วยย่อย') + ')' : $('rc-f-unit-l').textContent;
    calcHint();
  }
  function calcHint() {
    var h = $('rc-f-calc'), v = Number($('rc-f-qty').value);
    if (!formPack || qtyMode !== 'pack' || !(v > 0)) { h.hidden = true; return; }
    h.hidden = false; h.textContent = '= ' + fmtNum(v * formPack.packSize) + ' ' + (formPack.unit || '') + ' (1 ' + formPack.packUnit + ' = ' + fmtNum(formPack.packSize) + ' ' + (formPack.unit || '') + ')';
  }
  $('rc-f-mode').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (b) setQtyMode(b.dataset.m); });
  function lineMeta(ln) {
    var p = [];
    p.push(ln.exp ? 'EXP ' + DM.fmtShort(ln.exp) : '<span class="nox">ไม่มี EXP</span>');
    if (ln.lotNo) p.push('ล็อต ' + esc(ln.lotNo));
    if (ln.note) p.push(esc(ln.note));
    return p.join(' · ');
  }
  function renderLines() {
    $('rc-lines-sec').hidden = !lines.length;
    $('rc-count').textContent = lines.length + ' รายการ';
    $('rc-lines').innerHTML = lines.map(function (ln, i) {
      return '<div class="rc-line"><div class="name">' + esc(lineName(ln)) + (ln.newItem ? '<span class="newtag">ใหม่</span>' : '') + '</div>' +
        '<div class="q">' + lineQtyText(ln) + '</div><div class="meta">' + lineMeta(ln) + '</div>' +
        '<div class="ops"><button type="button" data-edit="' + i + '">แก้ไข</button><button type="button" class="del" data-del="' + i + '">ลบ</button></div></div>';
    }).join('');
    $('rc-n').textContent = lines.length;
    $('rc-bar').hidden = !lines.length || !$('rc-done').hidden || $('view-receive').hidden;
  }

  // ---------- item form ----------
  function openForm(mode) {
    editing = mode;
    var ln = mode.index !== undefined ? lines[mode.index] : null;
    var isNew = mode.isNew || (ln && ln.newItem);
    var it = isNew ? null : byId[ln ? ln.itemId : mode.itemId];
    $('rc-f-new').hidden = !isNew;
    $('rc-f-title').textContent = isNew ? 'เพิ่มสินค้าใหม่' : 'รับเข้า: ' + it.name;
    $('rc-f-lead').innerHTML = isNew ? 'สินค้าที่ยังไม่มีในระบบ จะถูกเพิ่มเข้าชีต Items ตอนบันทึก' : stockText(it) + ' · ' + esc(it.category);
    if (isNew) {
      var c = categories().order;
      $('rc-f-cat').innerHTML = '<option value="">เลือกหมวด</option>' + c.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
      $('rc-f-name').value = ln ? ln.newItem.name : ($('rc-q').value || '');
      $('rc-f-cat').value = ln ? ln.newItem.category : (cat !== '__all' ? cat : '');
      $('rc-f-unit').value = ln ? ln.newItem.unit : '';
    }
    $('rc-f-unit-l').textContent = isNew ? '' : (it.unit ? '(' + it.unit + ')' : '');
    formPack = !isNew && it.packSize && it.packUnit ? it : null;
    $('rc-f-mode').hidden = !formPack;
    if (formPack) {
      $('rc-f-mode').innerHTML = '<button type="button" data-m="pack">เป็น' + esc(it.packUnit) + '</button><button type="button" data-m="base">เป็น ' + esc(it.unit || 'หน่วยย่อย') + '</button>';
      setQtyMode(ln ? (ln.packQty ? 'pack' : 'base') : 'pack');
    } else { qtyMode = 'base'; }
    $('rc-f-qty').value = ln ? (ln.packQty || ln.qty) : '';
    if (isNew) { $('rc-f-punit').value = ln && ln.newItem.packUnit || ''; $('rc-f-psize').value = ln && ln.newItem.packSize || ''; }
    $('rc-f-exp').value = ln ? (ln.exp || '') : '';
    $('rc-f-lot').value = ln ? (ln.lotNo || '') : '';
    $('rc-f-note').value = ln ? (ln.note || '') : '';
    $('rc-f-ok').textContent = ln ? 'บันทึกการแก้ไข' : 'เพิ่มในรายการ';
    $('rc-f-err').hidden = true; checkExp(); calcHint();
    $('rc-sheet').hidden = false;
    (isNew ? $('rc-f-name') : $('rc-f-qty')).focus();
  }
  function closeForm() { $('rc-sheet').hidden = true; editing = null; }
  function checkExp() {
    var v = $('rc-f-exp').value, w = $('rc-f-warn');
    if (!v) { w.hidden = false; w.textContent = 'ถ้าไม่ใส่ EXP ระบบจะแจ้งเตือนวันหมดอายุของล็อตนี้ไม่ได้'; }
    else if (v <= today()) { w.hidden = false; w.textContent = 'วันหมดอายุนี้เลยมาแล้วหรือเป็นวันนี้ ตรวจสอบอีกครั้ง'; }
    else w.hidden = true;
  }
  $('rc-f-exp').addEventListener('input', checkExp);
  $('rc-f-qty').addEventListener('input', function (e) { var v = e.target.value.replace(/[^\d.]/g, ''); if (v !== e.target.value) e.target.value = v; calcHint(); });
  $('rc-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('rc-f-err'), qty = Number($('rc-f-qty').value);
    function fail(m, el) { err.hidden = false; err.textContent = m; if (el) el.focus(); }
    var ln = { qty: Math.round(qty * 1000) / 1000, exp: $('rc-f-exp').value, lotNo: $('rc-f-lot').value.trim(), note: $('rc-f-note').value.trim() };
    var old = editing.index !== undefined ? lines[editing.index] : null;
    if (editing.isNew || (old && old.newItem)) {
      var name = $('rc-f-name').value.trim(), c = $('rc-f-cat').value;
      if (!name) return fail('ใส่ชื่อสินค้าใหม่', $('rc-f-name'));
      if (!c) return fail('เลือกหมวดของสินค้าใหม่', $('rc-f-cat'));
      var dup = items.find(function (it) { return it.name.toLowerCase() === name.toLowerCase(); });
      if (dup) return fail('มีสินค้าชื่อนี้อยู่แล้วในหมวด ' + dup.category + ' · ให้ค้นหาแล้วกด + รับเข้า แทน', $('rc-f-name'));
      ln.newItem = { name: name, category: c, unit: $('rc-f-unit').value.trim() };
      var pu = $('rc-f-punit').value.trim(), ps = Number($('rc-f-psize').value);
      if (pu || ps) {
        if (!pu || !(ps > 0)) return fail('ขนาดบรรจุต้องใส่ทั้งหน่วยบรรจุและจำนวนต่อหน่วย หรือเว้นว่างทั้งคู่', $('rc-f-punit'));
        ln.newItem.packUnit = pu; ln.newItem.packSize = ps;
      }
    } else ln.itemId = old ? old.itemId : editing.itemId;
    if (!(ln.qty > 0)) return fail('ใส่จำนวนที่รับมากกว่า 0', $('rc-f-qty'));
    if (formPack && qtyMode === 'pack') { ln.packQty = ln.qty; ln.packUnit = formPack.packUnit; ln.qty = Math.round(ln.qty * formPack.packSize * 1000) / 1000; }
    if (old) lines[editing.index] = ln; else lines.push(ln);
    saveDraft(); closeForm(); renderLines();
    DM.say(old ? 'แก้ไขแล้ว' : 'เพิ่ม ' + lineName(ln) + ' ในรายการแล้ว');
  });
  $('rc-f-cancel').onclick = closeForm;
  $('rc-sheet').addEventListener('click', function (e) { if (e.target === $('rc-sheet')) closeForm(); });

  // ---------- list events ----------
  $('rc-list').addEventListener('click', function (e) { var b = e.target.closest('.rc-add'); if (b) openForm({ itemId: b.dataset.id }); });
  $('rc-lines').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) openForm({ index: Number(ed.dataset.edit) });
    if (del) { lines.splice(Number(del.dataset.del), 1); saveDraft(); renderLines(); }
  });
  $('rc-new').onclick = function () { openForm({ isNew: true }); };
  $('rc-cats').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { cat = b.dataset.cat; renderChips(); renderList(); } });
  var qt;
  $('rc-q').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { q = e.target.value; renderList(); }, 120); });
  $('rc-date').addEventListener('change', saveDraft);
  $('rc-clear').onclick = function () { lines = []; saveDraft(); renderLines(); DM.say('ล้างรายการแล้ว'); };

  // ---------- review & save ----------
  function openReview() {
    var noExp = lines.filter(function (ln) { return !ln.exp; }).length;
    $('rc-rv-lead').textContent = 'รับวันที่ ' + DM.fmtShort($('rc-date').value) + ' · ผู้รับ ' + DM.getUser() + ' · ' + lines.length + ' รายการ';
    $('rc-rv-list').innerHTML = lines.map(function (ln) {
      var it = ln.newItem ? null : byId[ln.itemId], ba;
      if (ln.newItem) ba = 'สินค้าใหม่ · ' + esc(ln.newItem.category);
      else if (it.qty === null || it.qty === undefined) ba = 'ยังไม่ทราบยอด · จะเริ่มนับจาก ' + fmtNum(ln.qty);
      else ba = 'คงเหลือ ' + fmtNum(it.qty) + ' → ' + fmtNum(Math.round((it.qty + ln.qty) * 1000) / 1000) + ' ' + esc(it.unit || '');
      return '<div class="rv"><div class="name">' + esc(lineName(ln)) + '</div><div class="q" style="color:var(--ok)">' + lineQtyText(ln) + '</div><div class="ba">' + ba + ' · ' + lineMeta(ln) + '</div></div>';
    }).join('');
    var w = $('rc-rv-warn'); w.hidden = !noExp;
    w.textContent = noExp ? noExp + ' รายการไม่มี EXP จะไม่ได้รับแจ้งเตือนวันหมดอายุ' : '';
    $('rc-rv-err').hidden = true;
    $('rc-rv-save').disabled = false; $('rc-rv-save').textContent = 'บันทึกรับของเข้า';
    $('rc-review-s').hidden = false;
  }
  function closeReview() { $('rc-review-s').hidden = true; }

  function applyDemo(body) {
    var D = window.DEMO_DATA, maxNum = 0;
    D.items.forEach(function (it) { var m = /^IT(\d+)$/.exec(it.id); if (m) maxNum = Math.max(maxNum, Number(m[1])); });
    var results = body.lines.map(function (ln) {
      var it;
      if (ln.newItem) {
        maxNum++;
        it = { id: 'IT' + ('000' + maxNum).slice(-4), name: ln.newItem.name, category: ln.newItem.category, unit: ln.newItem.unit, qty: 0, packUnit: ln.newItem.packUnit || '', packSize: ln.newItem.packSize || null };
        D.items.push(it);
        var c = D.categories.find(function (x) { return x.name === it.category; }); if (c) c.count++;
        D.totals.items++;
      } else it = D.items.find(function (x) { return x.id === ln.itemId; });
      var before = ln.newItem ? 0 : it.qty;
      it.qty = Math.round(((it.qty || 0) + ln.qty) * 1000) / 1000;
      return { itemId: it.id, name: it.name, unit: it.unit, qty: ln.qty, before: before, after: it.qty, exp: ln.exp, lotNo: ln.lotNo, isNew: !!ln.newItem };
    });
    var batchId = 'DEMO-R' + Date.now();
    if (!D.history) D.history = [];
    D.history.unshift({ batchId: batchId, type: 'IN', date: body.date, by: body.by, createdAt: new Date().toISOString(),
      lines: results.map(function (r) { return { itemId: r.itemId, name: r.name, unit: r.unit, qty: r.qty }; }) });
    return { batchId: batchId, date: body.date, by: body.by, results: results };
  }

  $('rc-rv-save').onclick = function () {
    var btn = $('rc-rv-save');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    var body = { action: 'receive', date: $('rc-date').value, by: DM.getUser(), lines: lines.map(function (ln) {
      var x = Object.assign({}, ln);
      if (ln.packQty) x.note = [ln.packQty + ' ' + ln.packUnit, ln.note].filter(Boolean).join(' · ');
      delete x.packQty; delete x.packUnit; return x;
    }) };
    var p = demo() ? Promise.resolve().then(function () { return applyDemo(body); }) : DM.apiPost(body);
    p.then(function (res) {
      lastBatch = { batchId: res.batchId, demo: demo(), lines: lines.slice(), date: res.date };
      lines = []; saveDraft(); closeReview(); showDone(res);
      document.dispatchEvent(new CustomEvent('dm:stock-changed'));
      load(true); DM.reloadHome();
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'ลองบันทึกอีกครั้ง';
      var e = $('rc-rv-err'); e.hidden = false;
      e.textContent = 'บันทึกไม่สำเร็จ: ' + err.message + ' รายการยังอยู่ ลองกดบันทึกอีกครั้ง';
    });
  };
  $('rc-review').onclick = openReview;
  $('rc-rv-back').onclick = closeReview;
  $('rc-review-s').addEventListener('click', function (e) { if (e.target === $('rc-review-s')) closeReview(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('rc-sheet').hidden) closeForm(); else if (!$('rc-review-s').hidden) closeReview();
  });

  function showDone(res) {
    $('rc-main').hidden = true; $('rc-done').hidden = false; $('rc-bar').hidden = true;
    $('rc-done-title').textContent = 'รับของเข้าเรียบร้อย ' + res.results.length + ' รายการ';
    $('rc-done-sub').textContent = 'วันที่ ' + DM.fmtShort(res.date) + ' · โดย ' + res.by;
    $('rc-done-demo').hidden = !lastBatch.demo;
    $('rc-done-list').innerHTML = res.results.map(function (r) {
      return '<div class="item"><div class="name">' + esc(r.name) + (r.isNew ? '<span class="newtag">ใหม่</span>' : '') + '</div><div class="sub">คงเหลือ ' + fmtNum(r.after) + ' ' + esc(r.unit || '') +
        (r.exp ? ' · EXP ' + DM.fmtShort(r.exp) : '') + '</div><div class="qty"><b style="color:var(--ok)">+' + fmtNum(r.qty) + '</b><span>' + esc(r.unit || 'ชิ้น') + '</span></div></div>';
    }).join('');
    var u = $('rc-undo'); u.disabled = false; u.textContent = 'ยกเลิกการรับเข้าชุดนี้';
    window.scrollTo(0, 0);
  }
  function backToMain() { $('rc-main').hidden = false; $('rc-done').hidden = true; renderLines(); }
  $('rc-again').onclick = backToMain;

  var armed = false;
  $('rc-undo').onclick = function () {
    var u = $('rc-undo');
    if (!armed) { armed = true; u.textContent = 'กดอีกครั้งเพื่อยืนยันการยกเลิก'; setTimeout(function () { if (armed) { armed = false; u.textContent = 'ยกเลิกการรับเข้าชุดนี้'; } }, 4000); return; }
    armed = false; u.disabled = true; u.textContent = 'กำลังยกเลิก…';
    var b = lastBatch;
    var p = b.demo ? Promise.resolve().then(function () { DM.demoUndo(b.batchId); }) : DM.apiPost({ action: 'undoCut', batchId: b.batchId });
    p.then(function () {
      lines = b.lines; $('rc-date').value = b.date; saveDraft(); lastBatch = null;
      document.dispatchEvent(new CustomEvent('dm:stock-changed'));
      load(true).then(function () { backToMain(); DM.say('ยกเลิกแล้ว รายการเดิมยังอยู่ให้แก้ไข'); });
      DM.reloadHome();
    }).catch(function (err) { u.disabled = false; u.textContent = 'ยกเลิกการรับเข้าชุดนี้'; DM.say('ยกเลิกไม่สำเร็จ: ' + err.message); });
  };

  // ---------- enter view ----------
  $('rc-date').value = today();
  $('rc-date').max = today();
  loadDraft();
  document.addEventListener('dm:user', function (e) { $('rc-by').textContent = e.detail; });
  document.addEventListener('dm:view', function (e) {
    if (e.detail !== 'receive') { $('rc-bar').hidden = true; closeForm(); closeReview(); return; }
    $('rc-by').textContent = DM.getUser();
    if (!$('rc-done').hidden) { lastBatch = null; $('rc-main').hidden = false; $('rc-done').hidden = true; }
    load(false);
  });
})();
