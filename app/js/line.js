(function () {
  'use strict';
  // เชื่อม LINE (LIFF): ต้องเข้าสู่ระบบ LINE และได้รับอนุมัติจากผู้ดูแลก่อนจึงใช้งานได้
  var DM = window.DM, CFG = DM.CFG;
  var state = { ready: false, inClient: false, loggedIn: false, profile: null, user: null, error: '', friend: null };
  DM.line = state;
  DM.idToken = function () {
    try { return state.loggedIn && window.liff ? liff.getIDToken() : null; } catch (e) { return null; }
  };
  // เข้าสู่ระบบใหม่ · ถ้าค้างบัตรผ่านเก่า (หมดอายุ) อยู่ ต้องออกจากระบบก่อน ไม่งั้น LINE จะไม่ออกบัตรใหม่ให้
  DM.lineLogin = function () {
    if (!window.liff || !state.ready) return;
    try { if (!state.inClient && liff.isLoggedIn()) liff.logout(); } catch (e) {}
    liff.login({ redirectUri: location.href });
  };
  // บัตรผ่าน LINE (ID token) อายุ ~1 ชม. ในแอป LINE ระบบต่ออายุให้เอง แต่ในเบราว์เซอร์คอมไม่ต่อให้
  function tokenExpired() {
    try { var d = liff.getDecodedIDToken(); return !d || !d.exp || d.exp * 1000 < Date.now() + 60000; } catch (e) { return false; }
  }

  // หลังเข้าสู่ระบบในเบราว์เซอร์ LINE จะต่อท้ายลิงก์ด้วยรหัสใช้ครั้งเดียว (?code=…&state=…) → ลบออกให้เหลือลิงก์สั้น
  function cleanUrl() {
    if (state.inClient || !location.search || !window.history || !history.replaceState) return;
    try {
      var u = new URL(location.href), drop = ['code', 'state', 'liffClientId', 'liffRedirectUri', 'error', 'error_description'], changed = false;
      Array.from(u.searchParams.keys()).forEach(function (k) {
        if (drop.indexOf(k) >= 0 || k.indexOf('liff.') === 0) { u.searchParams.delete(k); changed = true; }
      });
      if (changed) history.replaceState(history.state, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    } catch (e) {}
  }

  // เป็นเพื่อนกับ OA แล้วหรือยัง (true/false · null = ตรวจไม่ได้ เช่น ยังไม่ได้ผูก OA กับ LINE Login)
  function checkFriend() {
    if (!window.liff || !state.loggedIn || !liff.getFriendship) return Promise.resolve();
    return liff.getFriendship().then(function (r) { state.friend = !!(r && r.friendFlag); })
      .catch(function () { state.friend = null; })
      .then(function () { document.dispatchEvent(new CustomEvent('dm:friend', { detail: state.friend })); });
  }
  DM.checkFriend = checkFriend;
  DM.addFriend = function () {
    var url = CFG.OA_ADD_URL; if (!url) return;
    if (window.liff && state.ready && state.inClient) liff.openWindow({ url: url, external: false });
    else location.href = url;
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.user && state.friend === false) checkFriend();
  });

  function auth(ok, code, message) {
    state.ready = true;
    document.dispatchEvent(new CustomEvent('dm:line', { detail: state }));
    document.dispatchEvent(new CustomEvent('dm:auth', { detail: { ok: ok, code: code, message: message } }));
  }

  if (!CFG.API_URL) { auth(true); return; }                       // โหมดตัวอย่าง
  if (!CFG.LIFF_ID) { auth(false, 'error', 'ยังไม่ได้ตั้งค่า LIFF_ID ใน js/config.js'); return; }
  if (!window.liff) { auth(false, 'error', 'โหลด LINE SDK ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); return; }

  liff.init({ liffId: CFG.LIFF_ID }).then(function () {
    state.inClient = liff.isInClient();
    cleanUrl();
    state.loggedIn = liff.isLoggedIn();
    if (!state.loggedIn) { state.ready = true; auth(false, 'login'); return; }
    if (!state.inClient && tokenExpired()) {
      var tries = 0; try { tries = +sessionStorage.getItem('drmo-relogin') || 0; sessionStorage.setItem('drmo-relogin', tries + 1); } catch (e) {}
      state.ready = true;
      if (tries < 2) { DM.lineLogin(); return; }                     // เข้าระบบใหม่อัตโนมัติ (กันวนซ้ำไม่เกิน 2 รอบ)
      auth(false, 'login', 'การเข้าสู่ระบบหมดอายุ กดปุ่มด้านล่างเพื่อเข้าสู่ระบบอีกครั้ง'); return;
    }
    try { sessionStorage.removeItem('drmo-relogin'); } catch (e) {}
    if (!liff.getIDToken()) { auth(false, 'error', 'LINE ไม่ส่งข้อมูลยืนยันตัวตน ตรวจว่า LIFF เปิดสิทธิ์ openid แล้ว'); return; }
    return liff.getProfile().then(function (p) {
      state.profile = p;
      DM.setLineUser(p.displayName, p.pictureUrl);
      return DM.apiPost({ action: 'register' });
    }).then(function (u) {
      state.user = u;
      if (u.status !== 'active') { auth(false, u.status); return; }
      if (u.displayName && state.profile && u.displayName !== state.profile.displayName) DM.setLineUser(u.displayName, state.profile.pictureUrl);
      auth(true);
      checkFriend();
    });
  }).catch(function (err) {
    state.error = (err && err.message) || String(err);
    auth(false, err && err.code ? err.code : 'error', state.error);
  });
})();
