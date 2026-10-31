(function () {
  'use strict';
  // หน้าบัญชีของฉัน + โหมดผู้ดูแล (อนุมัติผู้ใช้จากมือถือ ต้องใส่รหัสผู้ดูแล)
  var DM = window.DM, CFG = DM.CFG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = DM.esc;
  var KEY_ADMIN = 'drmo-stock-admin';
  var users = [], busy = false, renaming = null;

  // ---------- เซสชันผู้ดูแล (เก็บเฉพาะในแท็บนี้ หมดอายุตามเซิร์ฟเวอร์) ----------
  function getSession() {
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY_ADMIN) || 'null');
      return s && s.exp > Date.now() ? s.token : null;
    } catch (e) { return null; }
  }
  function setSession(token, sec) { try { sessionStorage.setItem(KEY_ADMIN, JSON.stringify({ token: token, exp: Date.now() + (sec - 60) * 1000 })); } catch (e) {} }
  function clearSession() { try { sessionStorage.removeItem(KEY_ADMIN); } catch (e) {} }
  var memToken = null;
  function token() { return memToken || getSession(); }

  function adminCall(body) {
    body.adminToken = token();
    return DM.apiPost(body).catch(function (err) {
      if (err.code === 'admin') { memToken = null; clearSession(); renderAdmin(); DM.say('เซสชันผู้ดูแลหมดอายุ ใส่รหัสอีกครั้ง'); }
      throw err;
    });
  }

  // ---------- ส่วนบน: ข้อมูลของฉัน ----------
  function renderMe() {
    var s = DM.line || {}, u = s.user, p = s.profile;
    if (!CFG.API_URL) { $('ac-me').innerHTML = '<div><b>โหมดตัวอย่าง</b><span>ต่อหลังบ้านและเปิดผ่าน LINE เพื่อใช้หน้านี้</span></div>'; return; }
    if (!u) { $('ac-me').innerHTML = '<div><b>ยังไม่ได้เข้าสู่ระบบ</b></div>'; return; }
    $('ac-me').innerHTML = (p && p.pictureUrl ? '<img src="' + esc(p.pictureUrl) + '" alt="">' : '') +
      '<div><b>' + esc(u.displayName) + '<span class="role ' + (u.role === 'admin' ? 'admin">ผู้ดูแล' : 'staff">พนักงาน') + '</span></b>' +
      '<span>บัญชี LINE: ' + esc(p ? p.displayName : '') + '</span></div>';
  }

  // ---------- โหมดผู้ดูแล ----------
  function canAdmin() {
    var u = DM.line && DM.line.user;
    return !!(CFG.API_URL && u && u.status === 'active' && (u.role === 'admin' || u.hasAdmin === false));
  }
  function renderAdmin() {
    var show = canAdmin();
    $('ac-admin').hidden = !show;
    if (!show) return;
    var unlocked = !!token();
    $('ac-login').hidden = unlocked;
    $('ac-panel').hidden = !unlocked;
    $('ac-lock').hidden = !unlocked;
    var u = DM.line.user;
    $('ac-login-note').textContent = u.role === 'admin'
      ? 'ใส่รหัสผู้ดูแลเพื่ออนุมัติผู้ใช้และจัดการสิทธิ์'
      : 'ระบบยังไม่มีผู้ดูแล คนแรกที่ใส่รหัสผู้ดูแลถูกต้องจะได้สิทธิ์ผู้ดูแล';
    if (unlocked) loadUsers();
  }

  $('ac-login').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var pw = $('ac-pw').value, err = $('ac-login-err'), btn = $('ac-login-btn');
    if (!pw) { err.hidden = false; err.textContent = 'ใส่รหัสผู้ดูแล'; return; }
    busy = true; btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ…'; err.hidden = true;
    DM.apiPost({ action: 'adminLogin', password: pw }).then(function (r) {
      memToken = r.adminToken; setSession(r.adminToken, r.expiresIn);
      $('ac-pw').value = '';
      if (r.promoted) { DM.line.user.role = 'admin'; DM.line.user.hasAdmin = true; renderMe(); DM.say('คุณเป็นผู้ดูแลระบบแล้ว'); }
      renderAdmin();
    }).catch(function (x) {
      err.hidden = false; err.textContent = x.message;
    }).then(function () { busy = false; btn.disabled = false; btn.textContent = 'เข้าโหมดผู้ดูแล'; });
  });
  $('ac-lock').onclick = function () { memToken = null; clearSession(); renderAdmin(); DM.say('ออกจากโหมดผู้ดูแลแล้ว'); };

  function loadUsers() {
    $('ac-users').innerHTML = '<div class="skel"></div>';
    adminCall({ action: 'adminUsers' }).then(function (list) { users = list; renderUsers(); })
      .catch(function (err) { $('ac-users').innerHTML = '<div class="state err">โหลดรายชื่อไม่สำเร็จ: ' + esc(err.message) + '</div>'; });
  }

  function when(iso) {
    var d = new Date(iso); if (!iso || isNaN(d)) return '';
    return 'ขอเมื่อ ' + d.getDate() + '/' + (d.getMonth() + 1) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function userCard(u) {
    var me = DM.line.user && u.userId === DM.line.user.userId, ops = '';
    if (u.status === 'pending') ops = '<button class="go" data-op="approve">อนุมัติ</button><button class="bad" data-op="disable" data-confirm="1">ไม่อนุมัติ</button>';
    else if (u.status === 'active' && !me) ops = (u.role === 'admin' ? '<button data-op="staff">ลดเป็นพนักงาน</button>' : '<button data-op="admin" data-confirm="1">ตั้งเป็นผู้ดูแล</button>') +
      '<button data-op="rename">เปลี่ยนชื่อที่แสดง</button><button class="bad" data-op="disable" data-confirm="1">ปิดใช้งาน</button>';
    else if (u.status === 'active') ops = '<button data-op="rename">เปลี่ยนชื่อที่แสดง</button>';
    else ops = '<button class="go" data-op="approve">เปิดใช้งานอีกครั้ง</button>';
    var rn = renaming === u.userId ? '<form class="rn"><input maxlength="40" value="' + esc(u.displayName) + '" aria-label="ชื่อที่แสดง"><button class="go" type="submit">บันทึก</button></form>' : '';
    return '<div class="ac-user ' + u.status + (me ? ' me' : '') + '" data-id="' + esc(u.userId) + '"><div class="top"><b>' + esc(u.displayName || '(ไม่มีชื่อ)') +
      (u.status === 'active' ? '<span class="role ' + (u.role === 'admin' ? 'admin">ผู้ดูแล' : 'staff">พนักงาน') + '</span>' : '') + (me ? ' <span class="when">(คุณ)</span>' : '') +
      '</b><span class="when">' + esc(u.status === 'pending' ? when(u.requestedAt) : '') + '</span></div><div class="ops">' + ops + '</div>' + rn + '</div>';
  }
  function renderUsers() {
    var g = { pending: [], active: [], disabled: [] };
    users.forEach(function (u) { (g[u.status] || g.disabled).push(u); });
    var html = '';
    if (g.pending.length) html += '<div class="ac-group"><h4>รออนุมัติ ' + g.pending.length + ' คน</h4>' + g.pending.map(userCard).join('') + '</div>';
    html += '<div class="ac-group"><h4>ใช้งานอยู่ ' + g.active.length + ' คน</h4>' + g.active.map(userCard).join('') + '</div>';
    if (g.disabled.length) html += '<div class="ac-group"><h4>ปิดใช้งาน / ไม่อนุมัติ</h4>' + g.disabled.map(userCard).join('') + '</div>';
    $('ac-users').innerHTML = html;
    var u = DM.line.user; if (u) u.pendingCount = g.pending.length;
    $('admin-alert').hidden = !g.pending.length; $('admin-alert-n').textContent = g.pending.length;
    $('who').classList.toggle('dot', g.pending.length > 0);
  }

  var LABEL = { approve: 'อนุมัติแล้ว', disable: 'ปิดใช้งานแล้ว', admin: 'ตั้งเป็นผู้ดูแลแล้ว', staff: 'ลดเป็นพนักงานแล้ว', rename: 'เปลี่ยนชื่อแล้ว' };
  function setUser(id, op, extra) {
    if (busy) return; busy = true;
    adminCall(Object.assign({ action: 'adminSetUser', userId: id, op: op }, extra || {}))
      .then(function (list) { users = list; renaming = null; renderUsers(); DM.say(LABEL[op]); })
      .catch(function (err) { DM.say('ทำรายการไม่สำเร็จ: ' + err.message); renderUsers(); })
      .then(function () { busy = false; });
  }
  $('ac-users').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-op]'); if (!b) return;
    var id = b.closest('.ac-user').dataset.id, op = b.dataset.op;
    if (op === 'rename') { renaming = renaming === id ? null : id; renderUsers(); var i = document.querySelector('.ac-user[data-id="' + CSS.escape(id) + '"] .rn input'); if (i) i.focus(); return; }
    if (b.dataset.confirm && !b.classList.contains('armed')) {
      b.classList.add('armed'); b.dataset.orig = b.textContent; b.textContent = 'แตะอีกครั้งเพื่อยืนยัน';
      setTimeout(function () { if (b.isConnected && b.classList.contains('armed')) { b.classList.remove('armed'); b.textContent = b.dataset.orig; } }, 4000);
      return;
    }
    b.disabled = true; b.textContent = 'กำลังบันทึก…';
    setUser(id, op);
  });
  $('ac-users').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target.closest('.rn'); if (!f) return;
    setUser(f.closest('.ac-user').dataset.id, 'rename', { displayName: f.querySelector('input').value });
  });

  $('ac-pwform').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('ac-pw-err'), cur = $('ac-pw-cur').value, nx = $('ac-pw-new').value, nx2 = $('ac-pw-new2').value;
    function fail(m) { err.hidden = false; err.textContent = m; }
    if (nx.length < 6) return fail('รหัสใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
    if (nx !== nx2) return fail('รหัสใหม่ทั้งสองช่องไม่ตรงกัน');
    err.hidden = true;
    adminCall({ action: 'adminChangePassword', current: cur, next: nx }).then(function () {
      ['ac-pw-cur', 'ac-pw-new', 'ac-pw-new2'].forEach(function (i) { $(i).value = ''; });
      e.target.closest('details').open = false;
      DM.say('เปลี่ยนรหัสผู้ดูแลแล้ว');
    }).catch(function (x) { fail(x.message); });
  });

  document.addEventListener('dm:auth', function () { renderMe(); });
  document.addEventListener('dm:view', function (e) { if (e.detail === 'account') { renderMe(); renderAdmin(); } });
})();
