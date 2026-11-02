(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var TH_DAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var TH_MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function parseISO(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function fmtShort(s) { var d = parseISO(s); return d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2); }
  function fmtNum(n) { return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 1 }); }
  // แสดงยอดแบบหน่วยบรรจุ เช่น "3 ขวด + 133 u (1,033 u)" (ข้อความล้วน ยังไม่ escape)
  function fmtStock(it, q) {
    if (q === undefined) q = it.qty;
    if (q === null || q === undefined) return 'ไม่ทราบยอด';
    var u = it.unit ? ' ' + it.unit : '';
    if (it.packSize && it.packUnit && q >= it.packSize) {
      var full = Math.floor(q / it.packSize + 1e-9), rem = Math.round((q - full * it.packSize) * 1000) / 1000;
      return full + ' ' + it.packUnit + (rem ? ' + ' + fmtNum(rem) + u : '') + ' (' + fmtNum(q) + u + ')';
    }
    return fmtNum(q) + u;
  }
  function rel(d) {
    if (d < 0) return 'เลยมา ' + (Math.round(-d / 30) || 1) + ' เดือน';
    if (d === 0) return 'หมดวันนี้';
    if (d < 45) return 'อีก ' + d + ' วัน';
    return 'อีก ' + Math.round(d / 30) + ' เดือน';
  }

  // ---------- toast ----------
  var tt;
  function say(m) { var t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2400); }

  // ---------- greeting ----------
  var now = new Date();
  $('today').textContent = 'วัน' + TH_DAY[now.getDay()] + 'ที่ ' + now.getDate() + ' ' + TH_MF[now.getMonth()] + ' ' + (now.getFullYear() + 543);
  var h = now.getHours();
  $('hello').firstChild.nodeValue = (h < 12 ? 'อรุณสวัสดิ์ค่ะ คุณ' : h < 17 ? 'สวัสดีตอนบ่ายค่ะ คุณ' : 'สวัสดีตอนเย็นค่ะ คุณ');

  // ---------- user name (เปิดผ่าน LINE จะใช้ชื่อจาก LINE แทน) ----------
  var KEY_USER = 'drmo-stock-user';
  var uname = store.get(KEY_USER) || CFG.DEFAULT_USER || 'Nee';
  var fromLine = false;
  function setName(n, picture) {
    n = (n || '').trim() || CFG.DEFAULT_USER || 'Nee';
    $('who-name').textContent = n; $('h-name').textContent = ' ' + n;
    var ini = $('ini');
    if (picture) { ini.innerHTML = '<img src="' + esc(picture) + '" alt="">'; ini.classList.add('pic'); }
    else { ini.textContent = Array.from(n)[0].toUpperCase(); ini.classList.remove('pic'); }
    return n;
  }
  uname = setName(uname);
  function setLineUser(name, picture) {
    fromLine = true; uname = setName(name, picture);
    $('who').querySelector('svg').style.display = 'none';
    $('who').setAttribute('aria-label', 'ผู้ใช้จาก LINE: ' + uname);
    document.dispatchEvent(new CustomEvent('dm:user', { detail: uname }));
  }
  var who = $('who'), form = $('editname'), inp = $('name-input');
  var skinBtn = $('skin-btn'), skinPanel = $('skin-panel');
  who.onclick = function () {
    if (CFG.API_URL) { go('account'); return; }   // ใช้งานจริง: หน้าบัญชี/โหมดผู้ดูแล
    if (fromLine) { say('ชื่อนี้มาจาก LINE'); return; }
    skinPanel.hidden = true; skinBtn.setAttribute('aria-expanded', 'false');
    form.hidden = !form.hidden; who.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) { inp.value = uname; inp.focus(); inp.select(); }
  };
  form.onsubmit = function (e) {
    e.preventDefault(); uname = setName(inp.value); store.set(KEY_USER, uname);
    form.hidden = true; who.setAttribute('aria-expanded', 'false'); say('บันทึกชื่อ ' + uname + ' แล้ว');
    document.dispatchEvent(new CustomEvent('dm:user', { detail: uname }));
  };

  // ---------- skins ----------
  var KEY_SKIN = 'drmo-stock-skin';
  function applySkin(s) {
    document.documentElement.dataset.skin = s;
    document.querySelectorAll('.skin').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.skin === s)); });
  }
  applySkin(document.documentElement.dataset.skin || 'mauve');
  skinBtn.onclick = function () {
    form.hidden = true; who.setAttribute('aria-expanded', 'false');
    skinPanel.hidden = !skinPanel.hidden; skinBtn.setAttribute('aria-expanded', String(!skinPanel.hidden));
  };
  document.querySelectorAll('.skin').forEach(function (b) {
    b.onclick = function () { applySkin(b.dataset.skin); store.set(KEY_SKIN, b.dataset.skin); say('เปลี่ยนเป็นธีม ' + b.querySelector('b').textContent); };
  });

  // ---------- ขนาดตัวอักษร (จำไว้ในเครื่องนี้) ----------
  var KEY_FS = 'drmo-stock-fs', FS_NAME = { m: 'ปกติ', l: 'ใหญ่', xl: 'ใหญ่มาก' };
  function applyFs(f) {
    if (!FS_NAME[f]) f = 'm';
    document.documentElement.dataset.fs = f;
    document.querySelectorAll('.fs').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fs === f)); });
  }
  applyFs(document.documentElement.dataset.fs || 'm');
  document.querySelectorAll('.fs').forEach(function (b) {
    b.onclick = function () { applyFs(b.dataset.fs); store.set(KEY_FS, b.dataset.fs); say('ตัวอักษรขนาด' + FS_NAME[b.dataset.fs]); };
  });

  // ---------- data ----------
  function loadData() {
    if (!CFG.API_URL) {
      if (!window.DEMO_DATA) return Promise.reject(new Error('ยังไม่ได้ใส่ API_URL ใน js/config.js'));
      return Promise.resolve(window.DEMO_DATA);
    }
    return apiPost({ action: 'summary' });
  }

  // ส่งคำสั่งบันทึกไปหลังบ้าน (แนบ LINE idToken ถ้าเปิดผ่าน LINE) · text/plain = ไม่ติด CORS preflight
  function apiPost(body) {
    var tok = window.DM && DM.idToken && DM.idToken();
    if (tok) body.idToken = tok;
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('เซิร์ฟเวอร์ตอบกลับ ' + r.status); return r.json(); })
      .then(function (j) {
        if (!j.ok) {
          if (j.code === 'login' || j.code === 'pending' || j.code === 'disabled') showGate(j.code, j.error);
          var err = new Error(j.error || 'บันทึกไม่สำเร็จ'); err.code = j.code; throw err;
        }
        return j.data;
      });
  }

  // ---------- ประตูตรวจสิทธิ์ (ต้องเปิดผ่าน LINE และได้รับอนุมัติ) ----------
  var GATE = {
    checking: ['กำลังตรวจสอบสิทธิ์', 'รอสักครู่…'],
    login: ['เข้าสู่ระบบด้วย LINE', 'ระบบสต๊อกนี้ใช้ได้เฉพาะทีมคลินิก เปิดผ่านแอป LINE หรือกดเข้าสู่ระบบ'],
    pending: ['รอผู้ดูแลอนุมัติ', 'ส่งคำขอใช้งานแล้ว เมื่อผู้ดูแลอนุมัติ จะมีข้อความแจ้งใน LINE'],
    disabled: ['บัญชีถูกปิดการใช้งาน', 'ติดต่อผู้ดูแลระบบของคลินิก'],
    error: ['เชื่อมต่อไม่สำเร็จ', '']
  };
  function showGate(code, msg) {
    var g = GATE[code] || GATE.error, s = (window.DM && DM.line) || {};
    $('gate-title').textContent = g[0];
    $('gate-msg').textContent = msg && code !== 'pending' ? msg : g[1];
    $('gate-who').textContent = s.profile ? 'บัญชี LINE: ' + s.profile.displayName : '';
    var acts = '';
    if (code === 'login') acts = '<button class="cta" type="button" id="gate-login">เข้าสู่ระบบด้วย LINE</button>' + (CFG.LIFF_URL ? '<a class="ghost" href="' + esc(CFG.LIFF_URL) + '">เปิดในแอป LINE</a>' : '');
    else if (code !== 'checking') acts = '<button class="cta" type="button" id="gate-retry">ตรวจสอบอีกครั้ง</button>';
    $('gate-acts').innerHTML = acts;
    if ($('gate-login')) $('gate-login').onclick = function () { DM.lineLogin(); };
    if ($('gate-retry')) $('gate-retry').onclick = function () { location.reload(); };
    $('gate').hidden = false;
  }
  function hideGate() { $('gate').hidden = true; }

  var ICONS = {
    'Filler Botox ไหม': '<path d="M18 2l4 4M17 7l-7 7M14 4l6 6M9 15l-5 5M7 11l6 6"/>',
    'วิตามินตู้หมอ': '<rect x="7" y="3" width="10" height="4" rx="1"/><path d="M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M10 13h4M12 11v4"/>',
    'ตู้เย็นชั้น 2': '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M8 5v2M8 13v3"/>',
    'วิตามินฉีด': '<path d="M8 2h4M10 2v4"/><rect x="7" y="6" width="6" height="12" rx="1"/><path d="M10 18v4"/><path d="M15 9h4l-2 4"/>',
    'ตู้เย็นชั้น 3': '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M8 5v2M8 13v3"/>',
    'รายการสินค้าขาย': '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    'ของใช้ในคลินิก': '<path d="M9 3h6v4H9z"/><path d="M5 7h14v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9 12h6M9 16h4"/>',
    'ยาที่ใช้ในคลินิก': '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    'รายการทรีตเม้นท์': '<path d="M12 3c3 3 6 5 6 9a6 6 0 0 1-12 0c0-4 3-6 6-9z"/>',
    'ของแจกลูกค้า': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9"/>'
  };
  var DEFAULT_ICON = '<rect x="4" y="4" width="16" height="16" rx="3"/>';

  var groups = { expired: [], m3: [], m6: [] }, cur = 'm3', showAll = false;
  function renderList() {
    var rows = groups[cur], cls = { expired: 'crit', m3: 'warn', m6: 'info' }[cur];
    var view = showAll ? rows : rows.slice(0, 5);
    var html = view.map(function (e) {
      return '<div class="item"><div class="name">' + esc(e.name) + '</div><div class="sub"><span class="badge ' + cls + '">' + rel(e.days) + '</span>EXP ' + fmtShort(e.exp) +
        (e.lot ? ' · ล็อต ' + esc(e.lot) : '') + ' · ' + esc(e.category) + '</div><div class="qty"><b>' + fmtNum(e.qty) + '</b><span>' + esc(e.unit || 'ชิ้น') + '</span></div></div>';
    }).join('');
    if (!rows.length) html = '<div class="empty">ไม่มีรายการในช่วงนี้</div>';
    if (rows.length > 5) html += '<button class="more" type="button" id="more">' + (showAll ? 'ย่อรายการ' : 'ดูอีก ' + (rows.length - 5) + ' รายการ') + '</button>';
    $('exp-list').innerHTML = html;
    var m = $('more'); if (m) m.onclick = function () { showAll = !showAll; renderList(); };
    document.querySelectorAll('#view-home .seg button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === cur)); });
  }
  function setTab(t, scroll) {
    cur = t; showAll = false; renderList();
    if (scroll) $('h-exp').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  document.querySelectorAll('#view-home .seg button').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
  document.querySelectorAll('.tile[data-tab]').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab, true); }; });

  function render(d) {
    var a1 = d.alertDays ? d.alertDays[0] : 90, a2 = d.alertDays ? d.alertDays[1] : 180;
    groups.expired = d.expiry.filter(function (e) { return e.days <= 0; }).sort(function (a, b) { return b.days - a.days; });
    groups.m3 = d.expiry.filter(function (e) { return e.days > 0 && e.days <= a1; });
    groups.m6 = d.expiry.filter(function (e) { return e.days > a1 && e.days <= a2; });
    $('n-expired').textContent = groups.expired.length;
    $('n-m3').textContent = groups.m3.length;
    $('n-m6').textContent = groups.m6.length;
    $('n-out').textContent = d.outCount;
    $('subtitle').textContent = 'ระบบสต๊อกคลินิก · ' + fmtNum(d.totals.items) + ' รายการ ใน ' + d.totals.categories + ' หมวด';

    var y = new Date(now); y.setDate(y.getDate() - 1);
    $('cut-for').textContent = 'ใบ OPD วัน' + TH_DAY[y.getDay()] + 'ที่ ' + y.getDate() + ' ' + TH_M[y.getMonth()];
    var yISO = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    var done = d.lastCut && d.lastCut.date >= yISO;
    $('cut-last').textContent = d.lastCut ? fmtShort(d.lastCut.date) + (d.lastCut.by ? ' · ' + d.lastCut.by : '') : '–';
    $('cut-pill').className = 'pill ' + (done ? 'ok' : 'warn');
    $('cut-pill-t').textContent = done ? 'ตัดแล้ว' : 'ยังไม่ได้ตัด';

    $('cats').innerHTML = d.categories.map(function (c) {
      return '<button class="cat" type="button" data-stock="cat" data-cat="' + esc(c.name) + '"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        (ICONS[c.name] || DEFAULT_ICON) + '</svg></span><span class="t">' + esc(c.name) + '</span><span class="c"><span>' + c.count + ' รายการ</span>' + (c.out ? '<span class="z">หมด ' + c.out + '</span>' : '') + '</span></button>';
    }).join('');
    $('source-note').innerHTML = d.demo
      ? 'ข้อมูลตัวอย่างจากชีต Stock clinic 2026 ณ ' + fmtShort(d.asOf) + '<br>ยอดคงเหลือเป็นค่าประมาณจากการแปลงข้อมูล ยังไม่ได้ตรวจนับ'
      : 'ข้อมูลจาก Google Sheet ณ ' + fmtShort(d.asOf);
    renderList();
    $('loading').hidden = true; $('content').hidden = false;
    window.DM.summary = d;
    document.dispatchEvent(new CustomEvent('dm:summary', { detail: d }));
  }

  function boot() { loadData().then(render).catch(function (err) {
    $('loading').hidden = true;
    var e = $('error'); e.hidden = false;
    e.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + err.message + ' · ลองเปิดแอปใหม่อีกครั้ง';
    $('cut-pill-t').textContent = 'ไม่ทราบสถานะ';
  }); }
  if (CFG.API_URL) showGate('checking');
  document.addEventListener('dm:auth', function (e) {
    var a = e.detail || {};
    if (!a.ok) { showGate(a.code || 'error', a.message); return; }
    var u = DM.line && DM.line.user;
    document.body.classList.toggle('viewer', !!(u && u.role === 'viewer'));
    hideGate(); boot(); show();
    $('admin-alert').hidden = !(u && u.role === 'admin' && u.pendingCount > 0);
    if (!$('admin-alert').hidden) $('admin-alert-n').textContent = u.pendingCount;
    $('who').classList.toggle('dot', !$('admin-alert').hidden);
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-soon]'); if (b) say(b.dataset.soon + ' · จะทำในขั้นต่อไป');
    var g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
  });
  $('btn-cut').onclick = function () { go('cut'); };
  $('friend-alert').onclick = function () { if (DM.addFriend) DM.addFriend(); };
  document.addEventListener('dm:friend', function (e) { $('friend-alert').hidden = e.detail !== false; });

  // ---------- views (#cut = หน้าตัดยอด) ----------
  var VIEWS = ['home', 'cut', 'history', 'notify', 'receive', 'account', 'count', 'stock'];
  var EDIT_VIEWS = ['cut', 'receive', 'count'];
  function isViewer() { return document.body.classList.contains('viewer'); }
  function go(v) {
    var h = v === 'home' ? '' : '#' + v;
    if (location.hash === h || (!location.hash && !h)) show(); else location.hash = h;
  }
  function show() {
    var v = (location.hash || '').replace('#', '');
    if (VIEWS.indexOf(v) < 0) v = 'home';
    if (isViewer() && EDIT_VIEWS.indexOf(v) >= 0) { v = 'home'; say('บัญชีนี้ดูได้อย่างเดียว'); }
    VIEWS.forEach(function (n) { $('view-' + n).hidden = n !== v; });
    $('nav').hidden = v !== 'home';
    document.querySelectorAll('#nav [data-go]').forEach(function (b) { b.classList.toggle('on', b.dataset.go === v); });
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('dm:view', { detail: v }));
  }
  window.addEventListener('hashchange', show);

  window.DM = {
    CFG: CFG, say: say, esc: esc, fmtNum: fmtNum, fmtStock: fmtStock, fmtShort: fmtShort, rel: rel, store: store, go: go,
    getUser: function () { return uname; },
    setLineUser: setLineUser, isViewer: isViewer, apiPost: apiPost, showGate: showGate, idToken: function () { return null; }, summary: null,
    reloadHome: function () { return loadData().then(render); }
  };
  setTimeout(show, 0);
})();
