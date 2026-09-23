export const APP_NAME = '交通組整合資訊系統';
export const APP_VERSION = 'v0.2.0';
export const APP_DATE = '2026-09-22';

// 帳號以「使用者名稱」登入，系統內部轉換為此網域的 email
export const USERNAME_EMAIL_DOMAIN = 'transport.local';
export const usernameToEmail = (u) =>
  `${String(u).trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;

export const TRIP_STATUS = {
  planning: '規劃中',
  confirmed: '已向廠商確認',
};

export const DEFAULT_LEAD_MINUTES = 30;

// 未填預計抵達時間時，計算尖峰用車數所假設的行車時間（分鐘）
export const DEFAULT_TRIP_MINUTES = 60;
