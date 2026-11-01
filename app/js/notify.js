(function () {
  'use strict';
  var DM = window.DM, CFG = DM.CFG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = DM.esc;

  // ---------- ข้อความสรุป (ตรงกับ buildSummaryText_ ใน Code.gs) ----------
  var TH_DAY_S = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  function fmtQty(e) { return DM.fmtNum(e.qty) + (e.unit ? ' ' + e.unit : ''); }
  function buildText(d) {
    var a1 = d.alertDays ? d.alertDays[0] : 90, a2 = d.alertDays ? d.alertDays[1] : 180;
    var exp = d.expiry.filter(function (e) { return e.days <= 0; });
    var m3 = d.expiry.filter(function (e) { return e.days > 0 && e.days <= a1; });
    var m6 = d.expiry.filter(function (e) { return e.days > a1 && e.days <= a2; });
    var p = d.asOf.split('-').map(Number), t = new Date(p[0], p[1] - 1, p[2]);
    var y = new Date(t); y.setDate(y.getDate() - 1);
    var yISO = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    var cut = d.lastCut && d.lastCut.date >= yISO;
    var L = [];
    L.push('สรุปสต๊อก DR.MO · ' + TH_DAY_S[t.getDay()] + ' ' + DM.fmtShort(d.asOf));
    L.push('');
    L.push(cut ? '✅ ตัดยอดเมื่อวานแล้ว' + (d.lastCut.by ? ' (' + d.lastCut.by + ')' : '') : '⏰ ยังไม่ได้ตัดยอดของเมื่อวาน');
    L.push('');
    L.push('⚠️ หมดอายุภายใน 3 เดือน: ' + m3.length + ' รายการ');
    m3.slice(0, 5).forEach(function (e) { L.push('• ' + e.name + ' เหลือ ' + fmtQty(e) + ' · EXP ' + DM.fmtShort(e.exp)); });
    if (m3.length > 5) L.push('  และอีก ' + (m3.length - 5) + ' รายการ');
    L.push('🕒 หมดอายุภายใน 6 เดือน: ' + m6.length + ' รายการ');
    if (exp.length) L.push('⛔ เลยวันหมดอายุแต่ยังมีของ: ' + exp.length + ' รายการ');
    L.push('📦 ของหมด: ' + d.outCount + ' รายการ');
    if (CFG.LIFF_URL) { L.push(''); L.push('เปิดแอป: ' + CFG.LIFF_URL); }
    return L.join('\n');
  }
  DM.buildSummaryText = buildText;

  // ---------- หน้าแจ้งเตือน ----------
  var busy = false;
  function renderStatus() {
    var s = DM.line || {}, el = $('nt-status'), act = $('nt-actions');
    var canUse = !!(CFG.API_URL && s.loggedIn && s.user);
    if (!CFG.API_URL) {
      el.innerHTML = '<b>โหมดตัวอย่าง</b><span>ต่อหลังบ้านและเปิดผ่าน LINE ก่อน จึงจะรับแจ้งเตือนได้</span>';
    } else if (!CFG.LIFF_ID) {
      el.innerHTML = '<b>ยังไม่ได้ตั้งค่า LINE</b><span>ใส่ LIFF_ID ใน js/config.js</span>';
    } else if (!s.ready) {
      el.innerHTML = '<b>กำลังเชื่อม LINE…</b>';
    } else if (!s.loggedIn && s.error) {
      el.innerHTML = '<b>เชื่อม LINE ไม่ได้</b><span class="neg">' + esc(s.error) + ' · ลองเปิดแอปใหม่</span>';
    } else if (!s.loggedIn) {
      el.innerHTML = '<b>ยังไม่ได้เข้าสู่ระบบ LINE</b><span>เปิดแอปจาก LINE หรือกดเข้าสู่ระบบ</span>' +
        '<div class="nt-btns"><button class="cta" type="button" id="nt-login">เข้าสู่ระบบด้วย LINE</button>' +
        (CFG.LIFF_URL ? '<a class="ghost" href="' + esc(CFG.LIFF_URL) + '">เปิดในแอป LINE</a>' : '') + '</div>';
      $('nt-login').onclick = DM.lineLogin;
    } else if (!s.user) {
      el.innerHTML = '<b>' + esc(s.profile ? s.profile.displayName : '') + '</b><span class="neg">ลงทะเบียนกับหลังบ้านไม่สำเร็จ: ' + esc(s.error || 'ไม่ทราบสาเหตุ') + '</span>';
    } else {
      el.innerHTML = (s.profile && s.profile.pictureUrl ? '<img src="' + esc(s.profile.pictureUrl) + '" alt="">' : '') +
        '<div><b>' + esc(s.user.displayName) + '</b><span>เชื่อมต่อ LINE แล้ว · ' + ({ admin: 'ผู้ดูแล', viewer: 'ดูอย่างเดียว' }[s.user.role] || 'พนักงาน') + '</span></div>';
    }
    var noFriend = canUse && s.friend === false;
    $('nt-friend').hidden = !noFriend;
    act.hidden = !canUse;
    act.classList.toggle('locked', noFriend);
    $('nt-sub').disabled = noFriend; $('nt-test').disabled = noFriend;
    if (CFG.OA_ID) $('nt-oa').textContent = CFG.OA_ID;
    if (canUse) {
      $('nt-sub').checked = !!s.user.subscribed;
      $('nt-time').textContent = s.user.notifyTime || '08:30';
    }
  }
  function renderPreview() {
    $('nt-preview').textContent = DM.summary ? buildText(DM.summary) : 'กำลังโหลดข้อมูล…';
  }

  $('nt-sub').addEventListener('change', function (e) {
    if (busy) return; busy = true;
    var on = e.target.checked;
    DM.apiPost({ action: 'subscribe', on: on }).then(function (r) {
      DM.line.user.subscribed = r.subscribed;
      DM.say(r.subscribed ? 'เปิดรับสรุปทุกเช้าแล้ว' : 'ปิดการรับสรุปแล้ว');
    }).catch(function (err) {
      e.target.checked = !on; DM.say('ตั้งค่าไม่สำเร็จ: ' + err.message);
    }).then(function () { busy = false; });
  });
  $('nt-test').addEventListener('click', function () {
    var b = $('nt-test'); if (busy) return; busy = true;
    b.disabled = true; b.textContent = 'กำลังส่ง…';
    DM.apiPost({ action: 'testNotify' }).then(function () {
      DM.say('ส่งแล้ว ลองเปิดแชท DR.MO Stock ใน LINE');
    }).catch(function (err) {
      DM.say('ส่งไม่สำเร็จ: ' + err.message);
    }).then(function () { busy = false; b.disabled = false; b.textContent = 'ส่งข้อความทดสอบตอนนี้'; });
  });

  $('nt-add').addEventListener('click', function () { DM.addFriend(); });
  document.addEventListener('dm:line', renderStatus);
  document.addEventListener('dm:friend', renderStatus);
  document.addEventListener('dm:summary', renderPreview);
  document.addEventListener('dm:view', function (e) { if (e.detail === 'notify') { renderStatus(); renderPreview(); } });
})();
