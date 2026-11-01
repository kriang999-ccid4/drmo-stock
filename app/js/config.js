// ตั้งค่าแอป
// API_URL: ใส่ลิงก์ Web app ของ Apps Script (ลงท้ายด้วย /exec) หลัง Deploy
//          ถ้าเว้นว่าง แอปจะแสดงข้อมูลตัวอย่างจาก js/demo-data.js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbz28tNZBMOGo7M4eqdt3l7T8jFFDmsb8c6iYcgB6pRzEhlodYKCZmQYjvHW2UFE_RaoBA/exec',
  CLINIC_NAME: 'DR.MO CLINIC',
  DEFAULT_USER: 'Nee',
  // LINE: LIFF ID ของช่อง DR.MO Stock App (Provider DR.MO Stock)
  LIFF_ID: '2012310640-yydk7EyT',
  LIFF_URL: 'https://liff.line.me/2012310640-yydk7EyT',
  // LINE OA ที่ส่งแจ้งเตือน (DR.MO Stock) · ต้องแอดเพื่อนก่อนจึงรับข้อความได้
  OA_ID: '@133edzka',
  OA_ADD_URL: 'https://line.me/R/ti/p/@133edzka'
};
