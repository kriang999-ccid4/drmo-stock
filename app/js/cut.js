(function () {
  'use strict';
  var DM = window.DM, CFG = DM.CFG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = DM.esc, fmtNum = DM.fmtNum;
  var KEY_DRAFT = 'drmo-stock-cut-draft';
  var MAX_ROWS = 80;

  var items = [], byId = {}, loaded = false, loading = null;
  var cart = {};          // itemId -> qty
  var cat = '__all';      // '__all' | '__cart' | category name
  var q = '';
  var lastBatch = null;   // { batchId, results, demo }

  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function yesterday() { var d = new Date(); d.setDate(d.getDate() - 1); return isoDay(d); }
  function demo() { return !CFG.API_URL; }

  // ---------- data ----------
  function fetchItems() {
    if (demo()) return window.DEMO_DATA ? Promise.resolve(window.DEMO_DATA.items) : Promise.reject(new Error('ยังไม่ได้ใส่ API_URL ใน js/config.js'));
    return fetch(CFG.API_URL + '?action=items', { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('เซิร์ฟเวอร์ตอบกลับ ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'โหลดรายการไม่สำเร็จ'); return j.data; });
  }
  function ensureItems(force) {
    if (loaded && !force) return Promise.resolve();
    if (loading && !force) return loading;
    loading = fetchItems().then(function (list) {
      items = list; byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      Object.keys(cart).forEach(function (id) { if (!byId[id]) delete cart[id]; });
      loaded = true; loading = null;
      renderChips(); renderList(); updateBar();
    }).catch(function (err) {
      loading = null;
      $('cut-list').innerHTML = '<div class="errbox" style="margin:0">โหลดรายการไม่สำเร็จ: ' + esc(err.message) + '</div>';
    });
    return loading;
  }

  function post(body) {
    // text/plain = simple request, ไม่ต้องผ่าน CORS preflight ของ Apps Script
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('เซิร์ฟเวอร์ตอบกลับ ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'บันทึกไม่สำเร็จ'); return j.data; });
  }

  // ---------- draft (กันข้อมูลหายถ้าปิดแอปกลางคัน) ----------
  function saveDraft() { DM.store.set(KEY_DRAFT, JSON.stringify({ date: $('cut-date').value, cart: cart })); }
  function loadDraft() {
    try {
      var d = JSON.parse(DM.store.get(KEY_DRAFT) || 'null');
      if (d && d.cart) { cart = d.cart; if (d.date) $('cut-date').value = d.date; }
    } catch (e) {}
  }
  function clearDraft() { cart = {}; DM.store.set(KEY_DRAFT, ''); }

  // ---------- render ----------
  function cartCount() { return Object.keys(cart).length; }

  function renderChips() {
    var counts = {}, order = [];
    items.forEach(function (it) { if (!counts[it.category]) { counts[it.category] = 0; order.push(it.category); } counts[it.category]++; });
    var html = '<button class="chip" type="button" data-cat="__all" aria-pressed="' + (cat === '__all') + '">ทั้งหมด</button>';
    if (cartCount()) html += '<button class="chip" type="button" data-cat="__cart" aria-pressed="' + (cat === '__cart') + '">เลือกแล้ว<span class="cnt">' + cartCount() + '</span></button>';
    html += order.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + esc(c) + '" aria-pressed="' + (cat === c) + '">' + esc(c) + '<span class="cnt">' + counts[c] + '</span></button>';
    }).join('');
    $('cut-cats').innerHTML = html;
  }

  function remainText(it, take) {
    if (it.qty === null || it.qty === undefined) return 'ยังไม่ทราบยอดคงเหลือ';
    var unit = it.unit ? ' ' + esc(it.unit) : '';
    if (!take) return 'เหลือ ' + fmtNum(it.qty) + unit;
    var after = Math.round((it.qty - take) * 1000) / 1000;
    return 'เหลือ ' + fmtNum(it.qty) + ' → <span class="' + (after < 0 ? 'neg' : '') + '">' + fmtNum(after) + '</span>' + unit;
  }

  function rowHtml(it) {
    var v = cart[it.id] || '';
    return '<div class="crow' + (v ? ' on' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div><div class="name">' + esc(it.name) + '</div><div class="sub">' + remainText(it, v) + (cat === '__all' || cat === '__cart' ? ' · ' + esc(it.category) : '') + '</div></div>' +
      '<div class="step"><button type="button" class="m" aria-label="ลด ' + esc(it.name) + '">−</button>' +
      '<input class="qin" inputmode="decimal" aria-label="จำนวนที่ตัด ' + esc(it.name) + '" value="' + v + '" placeholder="0">' +
      '<button type="button" class="p" aria-label="เพิ่ม ' + esc(it.name) + '">+</button><span class="u">' + esc(it.unit || '') + '</span></div></div>';
  }

  function filtered() {
    var qq = q.trim().toLowerCase();
    return items.filter(function (it) {
      if (cat === '__cart' && !cart[it.id]) return false;
      if (cat !== '__all' && cat !== '__cart' && it.category !== cat) return false;
      if (qq && String(it.name).toLowerCase().indexOf(qq) < 0) return false;
      return true;
    });
  }

  function renderList() {
    var list = filtered();
    var html = list.slice(0, MAX_ROWS).map(rowHtml).join('');
    if (!list.length) html = '<div class="empty">' + (cat === '__cart' ? 'ยังไม่ได้เลือกรายการ' : 'ไม่พบสินค้าที่ค้นหา') + '</div>';
    if (list.length > MAX_ROWS) html += '<div class="list-foot">แสดง ' + MAX_ROWS + ' จาก ' + list.length + ' รายการ · พิมพ์ค้นหาหรือเลือกหมวดเพื่อดูเพิ่ม</div>';
    $('cut-list').innerHTML = html;
  }

  function updateRow(id) {
    var row = document.querySelector('.crow[data-id="' + CSS.escape(id) + '"]');
    if (!row) return;
    var it = byId[id], v = cart[id] || '';
    row.classList.toggle('on', !!v);
    row.querySelector('.sub').innerHTML = remainText(it, v) + (cat === '__all' || cat === '__cart' ? ' · ' + esc(it.category) : '');
    var inp = row.querySelector('.qin');
    if (document.activeElement !== inp) inp.value = v;
  }

  function updateBar() {
    var n = cartCount();
    $('cart-n').textContent = n;
    $('cartbar').hidden = !n || !$('cut-done').hidden;
    var hasChip = !!document.querySelector('.chip[data-cat="__cart"]');
    if (!!n !== hasChip) renderChips();
    else if (hasChip) document.querySelector('.chip[data-cat="__cart"] .cnt').textContent = n;
  }

  function setQty(id, v) {
    v = Math.round(Number(v) * 1000) / 1000;
    if (v > 0) cart[id] = v; else delete cart[id];
    updateRow(id); updateBar(); saveDraft();
  }

  // ---------- events ----------
  $('cut-cats').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    cat = b.dataset.cat; renderChips(); renderList();
  });
  var qt;
  $('cut-q').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { q = e.target.value; renderList(); }, 120); });
  $('cut-list').addEventListener('click', function (e) {
    var b = e.target.closest('.m,.p'); if (!b) return;
    var id = b.closest('.crow').dataset.id, cur = cart[id] || 0;
    setQty(id, b.classList.contains('p') ? Math.floor(cur) + 1 : Math.max(0, Math.ceil(cur) - 1));
  });
  $('cut-list').addEventListener('input', function (e) {
    if (!e.target.classList.contains('qin')) return;
    var raw = e.target.value.replace(/[^\d.]/g, '');
    if (raw !== e.target.value) e.target.value = raw;
    setQty(e.target.closest('.crow').dataset.id, raw);
  });
  $('cut-list').addEventListener('focusout', function (e) {
    if (e.target.classList.contains('qin')) updateRow(e.target.closest('.crow').dataset.id);
  });
  $('cut-date').addEventListener('change', saveDraft);
  $('btn-clear').onclick = function () {
    var ids = Object.keys(cart); clearDraft(); ids.forEach(updateRow); updateBar();
    if (cat === '__cart') { cat = '__all'; renderChips(); renderList(); }
    DM.say('ล้างรายการที่เลือกแล้ว');
  };

  // ---------- review & save ----------
  function lines() { return Object.keys(cart).map(function (id) { return { itemId: id, qty: cart[id] }; }); }
  function fmtDateLong(s) { return DM.fmtShort(s); }

  function openReview() {
    var date = $('cut-date').value;
    var neg = 0;
    $('rv-lead').textContent = 'ใบ OPD วันที่ ' + fmtDateLong(date) + ' · ผู้ตัดยอด ' + DM.getUser() + ' · ' + cartCount() + ' รายการ';
    $('rv-list').innerHTML = lines().map(function (ln) {
      var it = byId[ln.itemId], ba = '';
      if (it.qty !== null && it.qty !== undefined) {
        var after = Math.round((it.qty - ln.qty) * 1000) / 1000;
        if (after < 0) neg++;
        ba = 'คงเหลือ ' + fmtNum(it.qty) + ' → <span class="' + (after < 0 ? 'neg' : '') + '">' + fmtNum(after) + '</span> ' + esc(it.unit || '');
      } else ba = 'ยังไม่ทราบยอดคงเหลือ บันทึกเฉพาะประวัติการเบิก';
      return '<div class="rv"><div class="name">' + esc(it.name) + '</div><div class="q">−' + fmtNum(ln.qty) + ' ' + esc(it.unit || '') + '</div><div class="ba">' + ba + '</div></div>';
    }).join('');
    var w = $('rv-warn');
    w.hidden = !neg;
    w.textContent = neg ? neg + ' รายการยอดจะติดลบ ตรวจจำนวนในใบ OPD อีกครั้ง ถ้าถูกแล้วบันทึกได้ และควรนับของจริงภายหลัง' : '';
    var today = isoDay(new Date());
    if (date > today) { w.hidden = false; w.textContent = 'วันที่ที่เลือกเป็นวันในอนาคต ตรวจสอบวันที่อีกครั้ง'; }
    $('rv-err').hidden = true;
    $('rv-save').disabled = false; $('rv-save').textContent = 'บันทึกการตัดยอด';
    $('review').hidden = false;
    $('rv-save').focus();
  }
  function closeReview() { $('review').hidden = true; }

  function applyDemo(body) {
    var results = body.lines.map(function (ln) {
      var it = byId[ln.itemId], before = it.qty, after = before === null || before === undefined ? null : Math.round((before - ln.qty) * 1000) / 1000;
      if (after !== null) it.qty = after;
      return { itemId: it.id, name: it.name, unit: it.unit, qty: ln.qty, before: before, after: after };
    });
    var D = window.DEMO_DATA;
    D._prevLastCut = D.lastCut;
    D.lastCut = { date: body.date, by: body.by };
    recountDemo();
    return { batchId: 'DEMO-' + Date.now(), date: body.date, by: body.by, results: results };
  }
  function undoDemo(batch) {
    batch.results.forEach(function (r) { var it = byId[r.itemId]; if (it && r.before !== null && r.before !== undefined) it.qty = r.before; });
    var D = window.DEMO_DATA; D.lastCut = D._prevLastCut || null; recountDemo();
  }
  function recountDemo() {
    var D = window.DEMO_DATA, out = {};
    D.items.forEach(function (it) { if (it.qty !== null && it.qty <= 0) out[it.category] = (out[it.category] || 0) + 1; });
    D.categories.forEach(function (c) { c.out = out[c.name] || 0; });
    D.outCount = D.categories.reduce(function (s, c) { return s + c.out; }, 0);
  }

  function save() {
    var btn = $('rv-save');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    var body = { action: 'cut', date: $('cut-date').value, by: DM.getUser(), lines: lines() };
    var p = demo() ? Promise.resolve(applyDemo(body)) : post(body);
    p.then(function (res) {
      lastBatch = { batchId: res.batchId, results: res.results, demo: demo(), date: res.date };
      clearDraft(); closeReview(); showDone(res);
      ensureItems(true); DM.reloadHome();
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'ลองบันทึกอีกครั้ง';
      var e = $('rv-err'); e.hidden = false;
      e.textContent = 'บันทึกไม่สำเร็จ: ' + err.message + ' รายการที่เลือกยังอยู่ ลองกดบันทึกอีกครั้ง';
    });
  }

  function showDone(res) {
    $('cut-main').hidden = true; $('cut-done').hidden = false; $('cartbar').hidden = true;
    $('done-title').textContent = 'ตัดยอดเรียบร้อย ' + res.results.length + ' รายการ';
    $('done-sub').textContent = 'ใบ OPD วันที่ ' + fmtDateLong(res.date) + ' · โดย ' + res.by;
    $('done-demo').hidden = !lastBatch.demo;
    $('done-list').innerHTML = res.results.map(function (r) {
      var after = r.after === null || r.after === undefined ? 'ไม่ทราบยอด' : 'เหลือ ' + fmtNum(r.after) + ' ' + esc(r.unit || '');
      return '<div class="item"><div class="name">' + esc(r.name) + '</div><div class="sub">' + after + '</div><div class="qty"><b>−' + fmtNum(r.qty) + '</b><span>' + esc(r.unit || 'ชิ้น') + '</span></div></div>';
    }).join('');
    var u = $('btn-undo'); u.hidden = false; u.disabled = false; u.textContent = 'ยกเลิกการตัดยอดชุดนี้';
    window.scrollTo(0, 0);
  }

  var undoArmed = false;
  $('btn-undo').onclick = function () {
    var u = $('btn-undo');
    if (!undoArmed) { undoArmed = true; u.textContent = 'กดอีกครั้งเพื่อยืนยันการยกเลิก'; setTimeout(function () { if (undoArmed) { undoArmed = false; u.textContent = 'ยกเลิกการตัดยอดชุดนี้'; } }, 4000); return; }
    undoArmed = false; u.disabled = true; u.textContent = 'กำลังยกเลิก…';
    var b = lastBatch;
    var p = b.demo ? Promise.resolve(undoDemo(b)) : post({ action: 'undoCut', batchId: b.batchId });
    p.then(function () {
      // คืนรายการเดิมเข้าตะกร้า ให้แก้แล้วบันทึกใหม่ได้
      cart = {}; b.results.forEach(function (r) { cart[r.itemId] = r.qty; });
      $('cut-date').value = b.date; saveDraft(); lastBatch = null;
      ensureItems(true).then(function () { resetView(); DM.say('ยกเลิกแล้ว รายการเดิมยังอยู่ให้แก้ไข'); });
      DM.reloadHome();
    }).catch(function (err) { u.disabled = false; u.textContent = 'ยกเลิกการตัดยอดชุดนี้'; DM.say('ยกเลิกไม่สำเร็จ: ' + err.message); });
  };

  $('btn-review').onclick = openReview;
  $('rv-back').onclick = closeReview;
  $('rv-save').onclick = save;
  $('review').addEventListener('click', function (e) { if (e.target === $('review')) closeReview(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('review').hidden) closeReview(); });

  function resetView() {
    $('cut-main').hidden = false; $('cut-done').hidden = true;
    cat = cartCount() ? '__cart' : '__all';
    renderChips(); renderList(); updateBar();
  }

  // ---------- enter view ----------
  $('cut-date').value = yesterday();
  $('cut-date').max = isoDay(new Date());
  loadDraft();
  document.addEventListener('dm:user', function (e) { $('cut-by').textContent = e.detail; });
  document.addEventListener('dm:view', function (e) {
    if (e.detail !== 'cut') { closeReview(); return; }
    $('cut-by').textContent = DM.getUser();
    if (!$('cut-done').hidden) { lastBatch = null; $('cut-main').hidden = false; $('cut-done').hidden = true; cat = '__all'; }
    ensureItems().then(function () { renderList(); updateBar(); });
  });
})();
