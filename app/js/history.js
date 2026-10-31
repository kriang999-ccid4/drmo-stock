(function () {
  'use strict';
  var DM = window.DM, CFG = DM.CFG;
  var $ = function (id) { return document.getElementById(id); };
  var esc = DM.esc, fmtNum = DM.fmtNum;
  var TH_DAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var cameFrom = null;

  function demo() { return !CFG.API_URL; }
  function fetchHistory() {
    if (demo()) return Promise.resolve(((window.DEMO_DATA && window.DEMO_DATA.history) || []).slice(0, 30));
    return fetch(CFG.API_URL + '?action=history&limit=30', { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('เซิร์ฟเวอร์ตอบกลับ ' + r.status); return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'โหลดประวัติไม่สำเร็จ'); return j.data; });
  }

  function dayLabel(iso) {
    var p = iso.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return 'ใบ OPD วัน' + TH_DAY[d.getDay()] + 'ที่ ' + DM.fmtShort(iso);
  }
  function savedAt(s) {
    var d = new Date(s);
    if (isNaN(d)) return '';
    return 'บันทึก ' + d.getDate() + '/' + (d.getMonth() + 1) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' น.';
  }

  function render(list) {
    if (!list.length) {
      $('hist-list').innerHTML = '<div class="state">ยังไม่มีการตัดยอดที่บันทึกผ่านแอป<br><span class="eyebrow">ข้อมูลเก่าที่นำเข้าจากชีตเดิมจะไม่แสดงในหน้านี้</span></div>';
      return;
    }
    var html = '', lastDay = '';
    list.forEach(function (b) {
      if (b.date !== lastDay) { html += '<div class="hday">' + esc(dayLabel(b.date)) + '</div>'; lastDay = b.date; }
      html += '<article class="hcard" data-batch="' + esc(b.batchId) + '">' +
        '<div class="hh"><div><b>' + b.lines.length + ' รายการ · โดย ' + esc(b.by) + '</b><span>' + esc(savedAt(b.createdAt)) + '</span></div></div>' +
        b.lines.map(function (ln) {
          return '<div class="ln"><span class="n">' + esc(ln.name) + '</span><span class="q">−' + fmtNum(ln.qty) + ' ' + esc(ln.unit || '') + '</span></div>';
        }).join('') +
        '<div class="hf"><button class="ghost hundo" type="button">ยกเลิกชุดนี้</button></div></article>';
    });
    $('hist-list').innerHTML = html;
  }

  function load() {
    $('hist-list').innerHTML = '<div class="skel"></div>';
    fetchHistory().then(render).catch(function (err) {
      $('hist-list').innerHTML = '<div class="state err">โหลดประวัติไม่สำเร็จ: ' + esc(err.message) + '</div>';
    });
  }

  $('hist-list').addEventListener('click', function (e) {
    var btn = e.target.closest('.hundo'); if (!btn) return;
    var card = btn.closest('.hcard'), id = card.dataset.batch;
    if (!btn.classList.contains('armed')) {
      document.querySelectorAll('.hundo.armed').forEach(function (b) { b.classList.remove('armed'); b.textContent = 'ยกเลิกชุดนี้'; });
      btn.classList.add('armed'); btn.textContent = 'กดอีกครั้งเพื่อยืนยัน';
      setTimeout(function () { if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = 'ยกเลิกชุดนี้'; } }, 4000);
      return;
    }
    btn.classList.remove('armed'); btn.disabled = true; btn.textContent = 'กำลังยกเลิก…';
    var p = demo() ? Promise.resolve().then(function () { DM.demoUndo(id); }) : DM.post({ action: 'undoCut', batchId: id });
    p.then(function () {
      card.classList.add('gone'); btn.textContent = 'ยกเลิกแล้ว';
      DM.say('ยกเลิกแล้ว ยอดคงเหลือถูกคืนกลับ');
      document.dispatchEvent(new CustomEvent('dm:stock-changed'));
      DM.reloadHome();
      setTimeout(load, 900);
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'ยกเลิกชุดนี้';
      DM.say('ยกเลิกไม่สำเร็จ: ' + err.message);
    });
  });

  $('hist-reload').onclick = load;
  $('hist-back').onclick = function () { DM.go(cameFrom === 'cut' ? 'cut' : 'home'); };

  var current = 'home';
  document.addEventListener('dm:view', function (e) {
    if (e.detail === 'history') { cameFrom = current; load(); }
    current = e.detail;
  });
})();
