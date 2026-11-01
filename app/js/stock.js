(function () {
  'use strict';
  // หน้าสต๊อก: ดูยอดคงเหลือตามหมวด ของหมด ใกล้หมดอายุ · แตะสินค้าเพื่อดูล็อตและความเคลื่อนไหว
  var DM = window.DM, CFG = DM.CFG, esc = DM.esc;
  var $ = function (id) { return document.getElementById(id); };
  var MAX_ROWS = 80;
  var items = [], byId = {}, loaded = false, loading = null;
  var filter = 'all', cat = '__all', q = '';
  var TX = { OUT: ['ตัดยอด', -1], WASTE: ['ตัดทิ้ง', -1], BORROW: ['ยืม', -1], IN: ['รับเข้า', 1], RETURN: ['คืน', 1], ADJUST: ['นับสต๊อก', 0], COUNT: ['ยอดตั้งต้น', 0] };

  function demo() { return !CFG.API_URL; }
  function alertDays() { var s = DM.summary; return s && s.alertDays ? s.alertDays[1] : 180; }
  function todayISO() {
    if (DM.summary && DM.summary.asOf) return DM.summary.asOf;
    var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysTo(exp) {
    var a = todayISO().split('-').map(Number), b = exp.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }

  // ---------- โหลดข้อมูล ----------
  function fetchStock() {
    if (!demo()) return DM.apiPost({ action: 'stock' });
    var D = window.DEMO_DATA;
    if (!D) return Promise.reject(new Error('ยังไม่ได้ใส่ API_URL ใน js/config.js'));
    var lotsBy = {};
    (D.lots || []).forEach(function (l) {
      if (!(Number(l.qty) > 0)) return;
      (lotsBy[l.item_id] = lotsBy[l.item_id] || []).push({ lotNo: l.lot_no || '', exp: l.exp || '', qty: Number(l.qty), days: l.exp ? daysTo(l.exp) : null });
    });
    return Promise.resolve(D.items.map(function (it) {
      var o = Object.assign({}, it), min = it.minQty == null ? 0 : it.minQty;
      o.out = it.qty !== null && it.qty !== undefined && it.qty <= min;
      o.lots = (lotsBy[it.id] || []).sort(function (a, b) { return (a.exp || '9999') < (b.exp || '9999') ? -1 : 1; });
      return o;
    }));
  }
  function ensure(force) {
    if (loaded && !force) return Promise.resolve();
    if (loading && !force) return loading;
    $('st-list').innerHTML = '<div class="empty">กำลังโหลดยอดคงเหลือ</div>';
    loading = fetchStock().then(function (list) {
      items = list; byId = {};
      items.forEach(function (it) {
        byId[it.id] = it;
        var first = it.lots.filter(function (l) { return l.days !== null; })[0];
        it.nextDays = first ? first.days : null; it.nextExp = first ? first.exp : '';
      });
      loaded = true; loading = null; render();
    }).catch(function (err) {
      loading = null;
      $('st-list').innerHTML = '<div class="errbox" style="margin:0">โหลดยอดไม่สำเร็จ: ' + esc(err.message) + '</div>';
    });
    return loading;
  }

  // ---------- กรอง ----------
  function isExp(it) { return it.nextDays !== null && it.nextDays <= alertDays(); }
  function passFilter(it) { return filter === 'all' || (filter === 'out' ? it.out : isExp(it)); }
  function passQ(it) { var qq = q.trim().toLowerCase(); return !qq || String(it.name).toLowerCase().indexOf(qq) >= 0 || String(it.id).toLowerCase() === qq; }
  function current() {
    var list = items.filter(function (it) { return passFilter(it) && passQ(it) && (cat === '__all' || it.category === cat); });
    if (filter === 'exp') list.sort(function (a, b) { return a.nextDays - b.nextDays; });
    return list;
  }

  // ---------- แสดงผล ----------
  function expBadge(days) {
    if (days === null) return '';
    var cls = days <= 0 ? 'crit' : days <= (DM.summary && DM.summary.alertDays ? DM.summary.alertDays[0] : 90) ? 'warn' : days <= alertDays() ? 'info' : '';
    return cls ? '<span class="badge ' + cls + '">' + DM.rel(days) + '</span>' : '';
  }
  function rowHtml(it) {
    var qtyTxt = it.qty === null || it.qty === undefined ? '–' : DM.fmtNum(it.qty);
    var sub = [];
    if (it.packSize && it.packUnit && it.qty >= it.packSize) sub.push(esc(DM.fmtStock(it)));
    if (it.nextExp) sub.push('EXP ' + DM.fmtShort(it.nextExp));
    if (it.minQty !== null && it.minQty !== undefined && it.minQty !== '') sub.push('สั่งเมื่อ ≤ ' + DM.fmtNum(it.minQty));
    if (cat === '__all') sub.push(esc(it.category));
    return '<button type="button" class="srow' + (it.out ? ' is-out' : '') + '" data-id="' + esc(it.id) + '">' +
      '<span class="name">' + esc(it.name) + '</span>' +
      '<span class="sub">' + (it.out ? '<span class="badge crit">หมด</span>' : '') + expBadge(it.nextDays) + sub.join(' · ') + '</span>' +
      '<span class="qty"><b>' + qtyTxt + '</b><span>' + esc(it.unit || '') + '</span></span></button>';
  }
  function renderChips() {
    var counts = {}, order = [];
    items.forEach(function (it) {
      if (!(it.category in counts)) { counts[it.category] = 0; order.push(it.category); }
      if (passFilter(it) && passQ(it)) counts[it.category]++;
    });
    var total = order.reduce(function (s, c) { return s + counts[c]; }, 0);
    $('st-cats').innerHTML = '<button class="chip" type="button" data-cat="__all" aria-pressed="' + (cat === '__all') + '">ทุกหมวด<span class="cnt">' + total + '</span></button>' +
      order.map(function (c) {
        return '<button class="chip' + (counts[c] ? '' : ' zero') + '" type="button" data-cat="' + esc(c) + '" aria-pressed="' + (cat === c) + '">' + esc(c) + '<span class="cnt">' + counts[c] + '</span></button>';
      }).join('');
  }
  function render() {
    $('st-n-all').textContent = items.length;
    $('st-n-out').textContent = items.filter(function (it) { return it.out; }).length;
    $('st-n-exp').textContent = items.filter(isExp).length;
    document.querySelectorAll('#st-filter button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.f === filter)); });
    renderChips();
    var list = current();
    var html = list.slice(0, MAX_ROWS).map(rowHtml).join('');
    if (!list.length) html = '<div class="empty">' + (q ? 'ไม่พบสินค้าที่ค้นหา' : filter === 'out' ? 'ไม่มีของหมดในหมวดนี้' : filter === 'exp' ? 'ไม่มีของใกล้หมดอายุในหมวดนี้' : 'ไม่มีสินค้า') + '</div>';
    if (list.length > MAX_ROWS) html += '<div class="list-foot">แสดง ' + MAX_ROWS + ' จาก ' + list.length + ' รายการ · เลือกหมวดหรือพิมพ์ค้นหาเพื่อดูเพิ่ม</div>';
    $('st-list').innerHTML = html;
    var showOrder = filter === 'out' && list.length > 0;
    $('st-order').hidden = !showOrder;
    if (showOrder) $('st-order-t').textContent = 'รายการสั่งซื้อ ' + list.length + ' รายการ';
  }

  // ---------- รายการสั่งซื้อ ----------
  function orderText() {
    var list = current(), groups = {}, order = [];
    list.forEach(function (it) { if (!groups[it.category]) { groups[it.category] = []; order.push(it.category); } groups[it.category].push(it); });
    var L = ['🛒 รายการสั่งซื้อ DR.MO · ' + DM.fmtShort(todayISO()), ''];
    order.forEach(function (c) {
      L.push('【' + c + '】');
      groups[c].forEach(function (it) { L.push('• ' + it.name + ' (เหลือ ' + DM.fmtStock(it) + ')'); });
      L.push('');
    });
    L.push('รวม ' + list.length + ' รายการ');
    return L.join('\n');
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return Promise.resolve();
  }
  $('st-copy').onclick = function () {
    copyText(orderText()).then(function () { DM.say('คัดลอกรายการแล้ว ไปวางในแชทได้เลย'); }, function () { DM.say('คัดลอกไม่สำเร็จ'); });
  };
  $('st-share').onclick = function () {
    var url = 'https://line.me/R/share?text=' + encodeURIComponent(orderText());
    var s = DM.line || {};
    if (window.liff && s.ready && s.inClient) liff.openWindow({ url: url, external: false });
    else window.open(url, '_blank', 'noopener');
  };

  // ---------- รายละเอียดสินค้า ----------
  var openId = null;
  function openItem(id) {
    var it = byId[id]; if (!it) return;
    openId = id;
    $('sd-cat').textContent = it.category + ' · ' + it.id;
    $('sd-name').textContent = it.name;
    var meta = [];
    if (it.packSize && it.packUnit) meta.push('1 ' + esc(it.packUnit) + ' = ' + DM.fmtNum(it.packSize) + ' ' + esc(it.unit || ''));
    if (it.minQty !== null && it.minQty !== undefined) meta.push('จุดสั่งซื้อ ' + DM.fmtNum(it.minQty) + ' ' + esc(it.unit || ''));
    $('sd-qty').innerHTML = '<span class="k">คงเหลือ</span><b>' + esc(DM.fmtStock(it)) + '</b>' + (it.out ? '<span class="badge crit">หมด / ต่ำกว่าจุดสั่งซื้อ</span>' : '') +
      (meta.length ? '<span class="m">' + meta.join(' · ') + '</span>' : '');
    $('sd-lots').innerHTML = it.lots.length ? it.lots.map(function (l) {
      return '<div class="item"><div class="name">' + (l.exp ? 'EXP ' + DM.fmtShort(l.exp) : 'ไม่ระบุวันหมดอายุ') + '</div><div class="sub">' + expBadge(l.days) +
        (l.lotNo ? 'ล็อต ' + esc(l.lotNo) : 'ไม่มีเลขล็อต') + '</div><div class="qty"><b>' + DM.fmtNum(l.qty) + '</b><span>' + esc(it.unit || '') + '</span></div></div>';
    }).join('') : '<div class="empty">ไม่มีล็อตที่ยังเหลือของ</div>';
    fillSettings(it);
    $('sd-tx').innerHTML = '<div class="empty">กำลังโหลด…</div>';
    $('st-sheet').hidden = false; document.body.classList.add('noscroll');
    if (demo()) { $('sd-tx').innerHTML = '<div class="empty">โหมดตัวอย่าง ไม่มีประวัติ</div>'; return; }
    DM.apiPost({ action: 'itemTx', itemId: id, limit: 15 }).then(function (list) {
      if (openId !== id) return;
      $('sd-tx').innerHTML = list.length ? list.map(function (t) { return txHtml(t, it); }).join('') : '<div class="empty">ยังไม่มีความเคลื่อนไหว</div>';
    }).catch(function (err) { if (openId === id) $('sd-tx').innerHTML = '<div class="errbox" style="margin:0">โหลดไม่สำเร็จ: ' + esc(err.message) + '</div>'; });
  }
  function txHtml(t, it) {
    var d = TX[t.type] || [t.type, 0], sign = d[1], amt;
    if (t.type === 'COUNT') amt = '= ' + DM.fmtNum(t.qty);
    else if (sign === 0) amt = t.qty === 0 ? 'ตรง' : (t.qty > 0 ? '+' : '−') + DM.fmtNum(Math.abs(t.qty));
    else amt = (sign > 0 ? '+' : '−') + DM.fmtNum(Math.abs(t.qty));
    var cls = t.type === 'COUNT' || (sign === 0 && t.qty === 0) ? '' : (sign > 0 || (sign === 0 && t.qty > 0) ? 'pos' : 'neg');
    var who = t.by && t.by !== 'นำเข้าจากชีตเดิม' ? esc(t.by) : (t.by ? 'ชีตเดิม' : '');
    return '<div class="item"><div class="name">' + d[0] + (t.patientRef ? ' <button type="button" class="opd-chip opd-link" data-ref="' + esc(t.patientRef) + '">OPD ' + esc(t.patientRef) + '</button>' : '') +
      '</div><div class="sub">' + (t.date ? DM.fmtShort(t.date) : '') + (who ? ' · ' + who : '') +
      (t.note ? ' · ' + esc(t.note) : '') + '</div><div class="qty tx ' + cls + '"><b>' + amt + '</b><span>' + esc(it.unit || '') + '</span></div></div>';
  }
  // ---------- ตั้งค่าสินค้า: จุดสั่งซื้อ / ขนาดบรรจุ ----------
  function numOrEmpty(v) { v = String(v == null ? '' : v).trim(); return v === '' ? '' : Number(v); }
  function fillSettings(it) {
    var u = it.unit || 'หน่วย';
    $('sd-min').value = it.minQty === null || it.minQty === undefined ? '' : it.minQty;
    $('sd-min-u').textContent = u; $('sd-ps-u').textContent = u;
    $('sd-pu').value = it.packUnit || ''; $('sd-ps').value = it.packSize || '';
    $('sd-pk-badge').hidden = it.packNote !== 'รอยืนยัน';
    $('sd-err').hidden = true;
    var s = $('sd-save'); s.disabled = false; s.textContent = it.packNote === 'รอยืนยัน' ? 'บันทึก (ยืนยันขนาดบรรจุ)' : 'บันทึกการตั้งค่า';
    var use = it.use30 || 0, wk = Math.round(use / 30 * 7 * 10) / 10, sug = Math.ceil(use / 30 * 14);
    $('sd-use').innerHTML = demo() ? 'โหมดตัวอย่าง: ไม่มีข้อมูลการใช้' : use
      ? 'ใช้ไป 30 วันล่าสุด ' + DM.fmtNum(use) + ' ' + esc(u) + ' (≈ ' + DM.fmtNum(wk) + ' ต่อสัปดาห์) · ถ้าสั่งแล้วรอของประมาณ 1 สัปดาห์ แนะนำตั้งไว้พอใช้ 2 สัปดาห์ ' +
        '<button type="button" class="link" id="sd-sug" data-v="' + sug + '">ใช้ค่า ' + DM.fmtNum(sug) + '</button>'
      : 'ยังไม่มีการตัดยอดใน 30 วันล่าสุด';
    minEq();
  }
  function minEq() {
    var m = Number($('sd-min').value), ps = Number($('sd-ps').value), pu = $('sd-pu').value.trim();
    $('sd-min-eq').textContent = m > 0 && ps > 1 && pu ? '≈ ' + DM.fmtNum(Math.round(m / ps * 10) / 10) + ' ' + pu : '';
  }
  ['sd-min', 'sd-ps', 'sd-pu'].forEach(function (id) { $(id).addEventListener('input', function (e) {
    if (id !== 'sd-pu') { var r = e.target.value.replace(/[^\d.]/g, ''); if (r !== e.target.value) e.target.value = r; }
    minEq();
  }); });
  $('sd-use').addEventListener('click', function (e) { var b = e.target.closest('#sd-sug'); if (b) { $('sd-min').value = b.dataset.v; minEq(); $('sd-min').focus(); } });
  $('sd-save').onclick = function () {
    var it = byId[openId]; if (!it) return;
    var body = { action: 'setItem', itemId: it.id }, minV = numOrEmpty($('sd-min').value);
    var pu = $('sd-pu').value.trim(), ps = numOrEmpty($('sd-ps').value);
    var curMin = it.minQty === null || it.minQty === undefined ? '' : it.minQty;
    if (minV !== curMin) body.minQty = minV;
    if (pu !== (it.packUnit || '') || ps !== (it.packSize || '') || it.packNote === 'รอยืนยัน') { body.packUnit = pu; body.packSize = ps; }
    if (!('minQty' in body) && !('packUnit' in body)) { DM.say('ไม่มีอะไรเปลี่ยน'); return; }
    var err = $('sd-err'), btn = $('sd-save');
    if ((pu && !(ps > 1)) || (!pu && ps !== '')) { err.hidden = false; err.textContent = 'ขนาดบรรจุต้องใส่ทั้งชื่อ (เช่น ขวด) และจำนวนที่มากกว่า 1 หรือเว้นว่างทั้งคู่'; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    var p = demo() ? Promise.resolve(demoSet(it, body)) : DM.apiPost(body);
    p.then(function (upd) {
      Object.assign(it, upd);
      var first = it.lots.filter(function (l) { return l.days !== null; })[0];
      it.nextDays = first ? first.days : null; it.nextExp = first ? first.exp : '';
      render(); openItem(it.id);
      DM.say('บันทึกการตั้งค่าแล้ว');
      document.dispatchEvent(new CustomEvent('dm:stock-changed'));
      loaded = true;   // ข้อมูลหน้านี้อัปเดตแล้ว ไม่ต้องโหลดใหม่
      if (DM.reloadHome) DM.reloadHome();
    }).catch(function (e2) {
      btn.disabled = false; btn.textContent = 'ลองบันทึกอีกครั้ง';
      err.hidden = false; err.textContent = 'บันทึกไม่สำเร็จ: ' + e2.message;
    });
  };
  function demoSet(it, body) {
    var o = {};
    if ('minQty' in body) o.minQty = body.minQty === '' ? null : body.minQty;
    if ('packUnit' in body) { o.packUnit = body.packUnit; o.packSize = body.packSize === '' ? null : body.packSize; o.packNote = body.packUnit ? 'ยืนยันแล้ว' : ''; }
    var min = 'minQty' in o ? o.minQty : it.minQty;
    o.out = it.qty !== null && it.qty !== undefined && it.qty <= (min == null ? 0 : min);
    var src = (window.DEMO_DATA.items || []).filter(function (x) { return x.id === it.id; })[0];
    if (src) Object.assign(src, { minQty: min, packUnit: 'packUnit' in o ? o.packUnit : src.packUnit, packSize: 'packSize' in o ? o.packSize : src.packSize });
    return o;
  }

  function closeItem() { openId = null; $('st-sheet').hidden = true; document.body.classList.remove('noscroll'); }

  // ---------- events ----------
  $('st-filter').addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (!b) return; filter = b.dataset.f; render(); });
  $('st-cats').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.cat; render(); b.scrollIntoView({ inline: 'center', block: 'nearest' }); });
  $('st-q').addEventListener('input', function (e) { q = e.target.value; render(); });
  $('st-list').addEventListener('click', function (e) { var r = e.target.closest('.srow'); if (r) openItem(r.dataset.id); });
  $('st-reload').onclick = function () { ensure(true).then(function () { if (loaded) DM.say('อัปเดตยอดแล้ว'); }); };
  $('sd-close').onclick = closeItem;
  $('sd-tx').addEventListener('click', function (e) {
    var b = e.target.closest('.opd-link'); if (!b || !DM.searchOpd) return;
    closeItem(); DM.searchOpd(b.dataset.ref);
  });
  $('st-sheet').addEventListener('click', function (e) { if (e.target === $('st-sheet')) closeItem(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('st-sheet').hidden) closeItem(); });
  document.addEventListener('dm:stock-changed', function () { loaded = false; });
  document.addEventListener('dm:summary', function () { loaded = false; });   // หน้าแรกโหลดใหม่หลังบันทึก → ยอดเปลี่ยน
  document.addEventListener('dm:view', function (e) {
    if (e.detail === 'stock') ensure().then(function () { if (loaded) { render(); scrollChip(); } });
    else if (!$('st-sheet').hidden) closeItem();
  });
  function scrollChip() { var c = document.querySelector('#st-cats .chip[aria-pressed="true"]'); if (c) c.scrollIntoView({ inline: 'center', block: 'nearest' }); }

  // เปิดจากหน้าแรก: data-stock="all" | "out" | "cat" (+ data-cat)
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-stock]'); if (!b) return;
    var k = b.dataset.stock;
    filter = k === 'out' ? 'out' : 'all';
    cat = k === 'cat' ? b.dataset.cat : '__all';
    q = ''; $('st-q').value = '';
    DM.go('stock');
  });
  DM.openStock = function (opts) { filter = opts.filter || 'all'; cat = opts.cat || '__all'; DM.go('stock'); };
})();
