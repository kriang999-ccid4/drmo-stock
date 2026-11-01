(function () {
  'use strict';
  // เชื่อม LINE (LIFF): ต้องเข้าสู่ระบบ LINE และได้รับอนุมัติจากผู้ดูแลก่อนจึงใช้งานได้
  var DM = window.DM, CFG = DM.CFG;
  var state = { ready: false, inClient: false, loggedIn: false, profile: null, user: null, error: '', friend: null };
  DM.line = state;
  DM.idToken = function () {
    try { return state.loggedIn && window.liff ? liff.getIDToken() : null; } catch (e) { return null; }
  };
  DM.lineLogin = function () { if (window.liff && state.ready) liff.login({ redirectUri: location.href }); };

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
    state.loggedIn = liff.isLoggedIn();
    if (!state.loggedIn) { state.ready = true; auth(false, 'login'); return; }
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
