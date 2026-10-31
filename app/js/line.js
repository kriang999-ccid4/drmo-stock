(function () {
  'use strict';
  // เชื่อม LINE (LIFF): เปิดในแอป LINE จะรู้ชื่อและรูปผู้ใช้เอง แล้วลงทะเบียนกับหลังบ้าน
  var DM = window.DM, CFG = DM.CFG;
  var state = { ready: false, inClient: false, loggedIn: false, profile: null, user: null, error: '' };
  DM.line = state;
  DM.idToken = function () {
    try { return state.loggedIn && window.liff ? liff.getIDToken() : null; } catch (e) { return null; }
  };
  DM.lineLogin = function () { if (window.liff && state.ready) liff.login({ redirectUri: location.href }); };

  function done() { state.ready = true; document.dispatchEvent(new CustomEvent('dm:line', { detail: state })); }

  if (!CFG.LIFF_ID || !window.liff) { state.error = CFG.LIFF_ID ? 'โหลด LINE SDK ไม่สำเร็จ' : ''; done(); return; }

  liff.init({ liffId: CFG.LIFF_ID }).then(function () {
    state.inClient = liff.isInClient();
    state.loggedIn = liff.isLoggedIn();
    if (!state.loggedIn) { done(); return; }   // เปิดในเบราว์เซอร์ทั่วไป: ใช้ชื่อที่ตั้งเองไปก่อน
    return liff.getProfile().then(function (p) {
      state.profile = p;
      DM.setLineUser(p.displayName, p.pictureUrl);
      if (!CFG.API_URL) return;
      return DM.apiPost({ action: 'register' }).then(function (u) {
        state.user = u;
        if (u.displayName && u.displayName !== p.displayName) DM.setLineUser(u.displayName, p.pictureUrl);
      }).catch(function (err) { state.error = err.message; });
    }).then(done);
  }).catch(function (err) {
    state.error = 'เชื่อม LINE ไม่สำเร็จ: ' + (err && err.message || err);
    done();
  });
})();
