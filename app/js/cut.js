(function () {
  'use strict';
  var DM = window.DM, CFG = DM.CFG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = DM.esc, fmtNum = DM.fmtNum;
  var KEY_DRAFT = 'drmo-stock-cut-draft';
  var MAX_ROWS = 80;

  var items = [], byId = {}, loaded = false, loading = null;
  var cart = {};          // itemId -> qty
  var pts = {};           // itemId -> [{ ref, qty }] รหัส OPD ของคนไข้ (qty รวม = cart)
  var cat = '__all';      // '__all' | '__cart' | category name
  var q = '';
  var lastBatch = null;   // { batchId, results, demo }
  var mode = 'OUT';       // 'OUT' เบิกใช้ตามใบ OPD | 'WASTE' ตัดทิ้ง/สูญเสีย

  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function yesterday() { var d = new Date(); d.setDate(d.getDate() - 1); return isoDay(d); }
  function demo() { return !CFG.API_URL; }

  // ---------- data ----------
  function fetchItems() {
    if (demo()) return window.DEMO_DATA ? Promise.resolve(window.DEMO_DATA.items) : Promise.reject(new Error('ยังไม่ได้ใส่ API_URL ใน js/config.js'));
    return DM.apiPost({ action: 'items' });
  }
  function ensureItems(force) {
    if (loaded && !force) return Promise.resolve();
    if (loading && !force) return loading;
    loading = fetchItems().then(function (list) {
      items = list; byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      Object.keys(cart).forEach(function (id) { if (!byId[id]) delete cart[id]; });
      Object.keys(pts).forEach(function (id) { if (!byId[id]) delete pts[id]; });
      loaded = true; loading = null;
      renderChips(); renderList(); updateBar();
    }).catch(function (err) {
      loading = null;
      $('cut-list').innerHTML = '<div class="errbox" style="margin:0">โหลดรายการไม่สำเร็จ: ' + esc(err.message) + '</div>';
    });
    return loading;
  }

  function post(body) { return DM.apiPost(body); }

  // ---------- draft (กันข้อมูลหายถ้าปิดแอปกลางคัน) ----------
  function saveDraft() { DM.store.set(KEY_DRAFT, JSON.stringify({ date: $('cut-date').value, cart: cart, pts: pts })); }
  function loadDraft() {
    try {
      var d = JSON.parse(DM.store.get(KEY_DRAFT) || 'null');
      if (d && d.cart) { cart = d.cart; pts = d.pts || {}; if (d.date) $('cut-date').value = d.date; }
    } catch (e) {}
  }
  function clearDraft() { cart = {}; pts = {}; DM.store.set(KEY_DRAFT, ''); }

  // ---------- render ----------
  function cartCount() { var k = {}; Object.keys(cart).concat(Object.keys(pts)).forEach(function (id) { k[id] = 1; }); return Object.keys(k).length; }

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
    if (!take) return 'เหลือ ' + esc(DM.fmtStock(it));
    var after = Math.round((it.qty - take) * 1000) / 1000;
    return 'เหลือ ' + fmtNum(it.qty) + ' → <span class="' + (after < 0 ? 'neg' : '') + '">' + fmtNum(after) + '</span>' + unit;
  }

  // ---------- รหัส OPD ----------
  var OPD_RE = /^[A-Za-z0-9\-\/.]{1,20}$/;
  function needsOpd(it) {
    if (mode !== 'OUT') return false;
    return it.opd !== undefined ? !!it.opd : (CFG.OPD_CATEGORIES || []).indexOf(it.category) >= 0;
  }
  function usesPts(it) { return mode === 'OUT' && !!(pts[it.id] && pts[it.id].length); }
  function cleanRef(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }
  function sumPts(id) { return Math.round((pts[id] || []).reduce(function (s, p) { return s + (Number(p.qty) || 0); }, 0) * 1000) / 1000; }
  function ptsHtml(it) {
    var u = esc(it.unit || '');
    return '<div class="pts">' + pts[it.id].map(function (p, i) {
      var bad = p.ref && !OPD_RE.test(cleanRef(p.ref));
      return '<div class="pt' + (bad ? ' bad' : '') + '" data-i="' + i + '"><span class="pk">OPD</span>' +
        '<input class="pref" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="รหัสการ์ด" aria-label="รหัส OPD คนที่ ' + (i + 1) + '" value="' + esc(p.ref) + '">' +
        '<input class="pq" inputmode="decimal" placeholder="0" aria-label="จำนวน คนที่ ' + (i + 1) + '" value="' + esc(p.qty) + '"><span class="u">' + u + '</span>' +
        '<button type="button" class="px" aria-label="ลบคนไข้คนที่ ' + (i + 1) + '">×</button></div>';
    }).join('') + '<button type="button" class="padd">+ เพิ่มคนไข้</button></div>';
  }
  function rightHtml(it, v) {
    if (usesPts(it)) return '<div class="ptot"><b>' + (v ? fmtNum(v) : '0') + '</b><span>' + esc(it.unit || '') + '</span></div>';
    if (needsOpd(it)) return '<button type="button" class="padd first">+ ใส่ OPD</button>';
    return '<div class="step"><button type="button" class="m" aria-label="ลด ' + esc(it.name) + '">−</button>' +
      '<input class="qin" inputmode="decimal" aria-label="จำนวนที่ตัด ' + esc(it.name) + '" value="' + v + '" placeholder="0">' +
      '<button type="button" class="p" aria-label="เพิ่ม ' + esc(it.name) + '">+</button><span class="u">' + esc(it.unit || '') + '</span></div>';
  }
  function subHtml(it, v) {
    return remainText(it, v) + (cat === '__all' || cat === '__cart' ? ' · ' + esc(it.category) : '') +
      (needsOpd(it) ? ' <span class="opd-tag">ต้องใส่ OPD</span>' : '');
  }
  function rowHtml(it) {
    var v = cart[it.id] || '';
    return '<div class="crow' + (v ? ' on' : '') + (usesPts(it) ? ' has-pts' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div><div class="name">' + esc(it.name) + '</div><div class="sub">' + subHtml(it, v) + '</div>' +
      (mode === 'OUT' && !needsOpd(it) && !usesPts(it) ? '<button type="button" class="link popd">ระบุ OPD คนไข้</button>' : '') + '</div>' +
      rightHtml(it, v) + (usesPts(it) ? ptsHtml(it) : '') + '</div>';
  }
  function rerenderRow(id, focusSel) {
    var row = document.querySelector('.crow[data-id="' + CSS.escape(id) + '"]');
    if (!row) return;
    var tmp = document.createElement('div'); tmp.innerHTML = rowHtml(byId[id]);
    var nr = tmp.firstChild; row.replaceWith(nr);
    if (focusSel) { var f = nr.querySelector(focusSel); if (f) f.focus(); }
  }
  function syncPts(id) {
    var v = sumPts(id);
    if (v > 0) cart[id] = v; else delete cart[id];
    var row = document.querySelector('.crow[data-id="' + CSS.escape(id) + '"]');
    if (row) {
      row.classList.toggle('on', !!cart[id]);
      row.querySelector('.sub').innerHTML = subHtml(byId[id], cart[id] || '');
      var t = row.querySelector('.ptot b'); if (t) t.textContent = cart[id] ? fmtNum(cart[id]) : '0';
    }
    updateBar(); saveDraft();
  }
  function addPt(id) {
    var list = pts[id] = pts[id] || [];
    var first = !list.length;
    list.push({ ref: '', qty: first && cart[id] ? String(cart[id]) : '' });
    rerenderRow(id, '.pt:last-of-type .pref');
    syncPts(id);
  }
  function removePt(id, i) {
    pts[id].splice(i, 1);
    if (!pts[id].length) delete pts[id];
    rerenderRow(id); syncPts(id);
  }

  function filtered() {
    var qq = q.trim().toLowerCase();
    return items.filter(function (it) {
      if (cat === '__cart' && !cart[it.id] && !pts[it.id]) return false;
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
    var inp = row.querySelector('.qin');
    if (!inp) { rerenderRow(id); return; }
    row.classList.toggle('on', !!v);
    row.querySelector('.sub').innerHTML = subHtml(it, v);
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
    var row = e.target.closest('.crow'); if (!row) return;
    if (e.target.closest('.padd,.popd')) { addPt(row.dataset.id); return; }
    var x = e.target.closest('.px'); if (x) { removePt(row.dataset.id, Number(x.closest('.pt').dataset.i)); return; }
    var b = e.target.closest('.m,.p'); if (!b) return;
    var id = b.closest('.crow').dataset.id, cur = cart[id] || 0;
    setQty(id, b.classList.contains('p') ? Math.floor(cur) + 1 : Math.max(0, Math.ceil(cur) - 1));
  });
  $('cut-list').addEventListener('input', function (e) {
    var pt = e.target.closest('.pt');
    if (pt) {
      var id = e.target.closest('.crow').dataset.id, p = pts[id][Number(pt.dataset.i)];
      if (e.target.classList.contains('pq')) {
        var rq = e.target.value.replace(/[^\d.]/g, ''); if (rq !== e.target.value) e.target.value = rq;
        p.qty = rq;
      } else p.ref = e.target.value;
      pt.classList.toggle('bad', !!p.ref && !OPD_RE.test(cleanRef(p.ref)));
      syncPts(id); return;
    }
    if (!e.target.classList.contains('qin')) return;
    var raw = e.target.value.replace(/[^\d.]/g, '');
    if (raw !== e.target.value) e.target.value = raw;
    setQty(e.target.closest('.crow').dataset.id, raw);
  });
  $('cut-list').addEventListener('focusout', function (e) {
    if (e.target.classList.contains('qin')) updateRow(e.target.closest('.crow').dataset.id);
    if (e.target.classList.contains('pref')) {
      var id = e.target.closest('.crow').dataset.id, p = pts[id] && pts[id][Number(e.target.closest('.pt').dataset.i)];
      if (p && OPD_RE.test(cleanRef(p.ref))) { p.ref = cleanRef(p.ref); e.target.value = p.ref; saveDraft(); }
    }
  });
  $('cut-list').addEventListener('keydown', function (e) {
    // Enter ในช่อง OPD → ไปช่องจำนวน · Enter ในช่องจำนวน → เพิ่มคนถัดไป
    if (e.key !== 'Enter') return;
    if (e.target.classList.contains('pref')) { e.preventDefault(); e.target.parentNode.querySelector('.pq').focus(); }
    else if (e.target.classList.contains('pq')) { e.preventDefault(); addPt(e.target.closest('.crow').dataset.id); }
  });
  $('cut-date').addEventListener('change', saveDraft);
  $('btn-clear').onclick = function () {
    clearDraft(); updateBar();
    if (cat === '__cart') cat = '__all';
    renderChips(); renderList();
    DM.say('ล้างรายการที่เลือกแล้ว');
  };

  // ---------- review & save ----------
  function lines() {
    var note = mode === 'WASTE' ? $('cut-reason').value.trim() : '';
    return Object.keys(cart).map(function (id) {
      var ln = { itemId: id, qty: cart[id], note: note };
      if (mode === 'OUT' && pts[id] && pts[id].length) ln.patients = pts[id].map(function (p) { return { ref: cleanRef(p.ref), qty: Number(p.qty) || 0 }; });
      return ln;
    });
  }
  // ปัญหาที่ต้องแก้ก่อนบันทึก (รหัส OPD)
  function opdProblems() {
    if (mode !== 'OUT') return [];
    var out = [];
    Object.keys(cart).concat(Object.keys(pts).filter(function (id) { return !cart[id]; })).forEach(function (id) {
      var it = byId[id]; if (!it) return;
      var list = pts[id] || [];
      if (needsOpd(it) && !list.length) out.push(it.name + ': ยังไม่ได้ใส่รหัส OPD');
      list.forEach(function (p, i) {
        var r = cleanRef(p.ref), q = Number(p.qty);
        if (!r) out.push(it.name + ' คนที่ ' + (i + 1) + ': ยังไม่ได้ใส่รหัส OPD');
        else if (!OPD_RE.test(r)) out.push(it.name + ' · ' + p.ref + ': รหัสใช้ได้เฉพาะอังกฤษ ตัวเลข - / .');
        if (!(q > 0)) out.push(it.name + ' · OPD ' + (r || '?') + ': ยังไม่ได้ใส่จำนวน');
      });
    });
    return out;
  }
  function setMode(m) {
    mode = m;
    document.querySelectorAll('#cut-mode button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.m === m)); });
    $('cut-reason-f').hidden = m !== 'WASTE';
    $('cut-date-l').textContent = m === 'WASTE' ? 'วันที่ตัดทิ้ง' : 'วันที่ในใบ OPD';
    $('btn-review').firstChild.nodeValue = m === 'WASTE' ? 'ตรวจสอบตัดทิ้ง ' : 'ตรวจสอบ ';
  }
  $('cut-mode').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (b) {
    setMode(b.dataset.m);
    if (mode === 'OUT') Object.keys(pts).forEach(function (id) { var v = sumPts(id); if (v > 0) cart[id] = v; else delete cart[id]; });
    if (loaded) { renderList(); updateBar(); }
  } });
  function fmtDateLong(s) { return DM.fmtShort(s); }

  function openReview() {
    var date = $('cut-date').value;
    var neg = 0;
    $('rv-lead').textContent = (mode === 'WASTE' ? 'ตัดทิ้ง/สูญเสีย วันที่ ' : 'ใบ OPD วันที่ ') + fmtDateLong(date) + ' · โดย ' + DM.getUser() + ' · ' + cartCount() + ' รายการ' +
      (mode === 'WASTE' && $('cut-reason').value.trim() ? ' · สาเหตุ: ' + $('cut-reason').value.trim() : '');
    $('rv-title').textContent = mode === 'WASTE' ? 'ตรวจสอบก่อนตัดทิ้ง' : 'ตรวจสอบก่อนบันทึก';
    $('rv-list').innerHTML = lines().map(function (ln) {
      var it = byId[ln.itemId], ba = '';
      if (it.qty !== null && it.qty !== undefined) {
        var after = Math.round((it.qty - ln.qty) * 1000) / 1000;
        if (after < 0) neg++;
        ba = 'คงเหลือ ' + fmtNum(it.qty) + ' → <span class="' + (after < 0 ? 'neg' : '') + '">' + fmtNum(after) + '</span> ' + esc(it.unit || '');
      } else ba = 'ยังไม่ทราบยอดคงเหลือ บันทึกเฉพาะประวัติการเบิก';
      var pl = ln.patients ? '<div class="rv-pts">' + ln.patients.map(function (p) { return '<span>OPD ' + esc(p.ref || '?') + ' · ' + fmtNum(p.qty) + ' ' + esc(it.unit || '') + '</span>'; }).join('') + '</div>' : '';
      return '<div class="rv"><div class="name">' + esc(it.name) + '</div><div class="q">−' + fmtNum(ln.qty) + ' ' + esc(it.unit || '') + '</div><div class="ba">' + ba + '</div>' + pl + '</div>';
    }).join('');
    var w = $('rv-warn');
    w.hidden = !neg;
    w.textContent = neg ? neg + ' รายการยอดจะติดลบ ตรวจจำนวนในใบ OPD อีกครั้ง ถ้าถูกแล้วบันทึกได้ และควรนับของจริงภายหลัง' : '';
    var today = isoDay(new Date());
    if (date > today) { w.hidden = false; w.textContent = 'วันที่ที่เลือกเป็นวันในอนาคต ตรวจสอบวันที่อีกครั้ง'; }
    var probs = opdProblems();
    $('rv-err').hidden = !probs.length;
    $('rv-err').innerHTML = probs.length ? '<b>แก้ก่อนบันทึก</b><br>' + probs.map(esc).join('<br>') : '';
    $('rv-save').disabled = !!probs.length; $('rv-save').textContent = 'บันทึกการตัดยอด';
    $('review').hidden = false;
    $('rv-save').focus();
  }
  function closeReview() { $('review').hidden = true; }

  // ---------- โหมดตัวอย่าง: จำลองการบันทึก/ยกเลิกในหน่วยความจำ ----------
  function applyDemo(body) {
    var D = window.DEMO_DATA;
    if (!D.history) D.history = [];
    if (D._origLastCut === undefined) D._origLastCut = D.lastCut;
    var results = body.lines.map(function (ln) {
      var it = byId[ln.itemId], before = it.qty, after = before === null || before === undefined ? null : Math.round((before - ln.qty) * 1000) / 1000;
      if (after !== null) it.qty = after;
      return { itemId: it.id, name: it.name, unit: it.unit, qty: ln.qty, before: before, after: after, patients: ln.patients };
    });
    var batchId = 'DEMO-' + Date.now();
    D.history.unshift({ batchId: batchId, type: body.type || 'OUT', date: body.date, by: body.by, createdAt: new Date().toISOString(),
      lines: results.map(function (r) { return { itemId: r.itemId, name: r.name, unit: r.unit, qty: r.qty, patients: r.patients }; }) });
    demoLastCut(); recountDemo();
    return { batchId: batchId, date: body.date, by: body.by, results: results };
  }
  function undoDemo(batchId) {
    var D = window.DEMO_DATA, h = D.history || [], i = h.findIndex(function (b) { return b.batchId === batchId; });
    if (i < 0) throw new Error('ไม่พบการตัดยอดชุดนี้ อาจถูกยกเลิกไปแล้ว');
    var sign = h[i].type === 'IN' || h[i].type === 'ADJUST' ? -1 : 1;
    h[i].lines.forEach(function (ln) {
      var it = D.items.find(function (x) { return x.id === ln.itemId; });
      if (it && it.qty !== null && it.qty !== undefined) it.qty = Math.round((it.qty + sign * ln.qty) * 1000) / 1000;
    });
    h.splice(i, 1);
    demoLastCut(); recountDemo();
  }
  function demoLastCut() {
    var D = window.DEMO_DATA, last = D._origLastCut || null;
    (D.history || []).forEach(function (b) { if (b.type === 'OUT' && (!last || b.date >= last.date)) last = { date: b.date, by: b.by }; });
    D.lastCut = last;
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
    var body = { action: 'cut', type: mode, date: $('cut-date').value, by: DM.getUser(), lines: lines() };
    var p = demo() ? Promise.resolve(applyDemo(body)) : post(body);
    p.then(function (res) {
      lastBatch = { batchId: res.batchId, results: res.results, demo: demo(), date: res.date, type: mode };
      if (mode === 'WASTE') { $('cut-reason').value = ''; setMode('OUT'); }
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
    $('done-title').textContent = (lastBatch.type === 'WASTE' ? 'ตัดทิ้งเรียบร้อย ' : 'ตัดยอดเรียบร้อย ') + res.results.length + ' รายการ';
    $('done-sub').textContent = (lastBatch.type === 'WASTE' ? 'วันที่ ' : 'ใบ OPD วันที่ ') + fmtDateLong(res.date) + ' · โดย ' + res.by;
    $('done-demo').hidden = !lastBatch.demo;
    $('done-list').innerHTML = res.results.map(function (r) {
      var after = r.after === null || r.after === undefined ? 'ไม่ทราบยอด' : 'เหลือ ' + fmtNum(r.after) + ' ' + esc(r.unit || '');
      var pl = r.patients && r.patients.length ? ' · ' + r.patients.map(function (p) { return 'OPD ' + esc(p.ref) + ' (' + fmtNum(p.qty) + ')'; }).join(', ') : '';
      return '<div class="item"><div class="name">' + esc(r.name) + '</div><div class="sub">' + after + pl + '</div><div class="qty"><b>−' + fmtNum(r.qty) + '</b><span>' + esc(r.unit || 'ชิ้น') + '</span></div></div>';
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
    var p = b.demo ? Promise.resolve().then(function () { undoDemo(b.batchId); }) : post({ action: 'undoCut', batchId: b.batchId });
    p.then(function () {
      // คืนรายการเดิมเข้าตะกร้า ให้แก้แล้วบันทึกใหม่ได้
      cart = {}; pts = {};
      b.results.forEach(function (r) {
        cart[r.itemId] = r.qty;
        if (r.patients && r.patients.length) pts[r.itemId] = r.patients.map(function (p) { return { ref: p.ref, qty: String(p.qty) }; });
      });
      $('cut-date').value = b.date; saveDraft(); lastBatch = null;
      ensureItems(true).then(function () { resetView(); DM.say('ยกเลิกแล้ว รายการเดิมยังอยู่ให้แก้ไข'); });
      DM.reloadHome();
    }).catch(function (err) { u.disabled = false; u.textContent = 'ยกเลิกการตัดยอดชุดนี้'; DM.say('ยกเลิกไม่สำเร็จ: ' + err.message); });
  };

  // ใช้ร่วมกับหน้าประวัติ/รับของเข้า
  DM.post = post;
  DM.loadItems = function (force) { return ensureItems(force).then(function () { return items; }); };
  DM.demoUndo = undoDemo;
  document.addEventListener('dm:stock-changed', function () { loaded = false; });

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
