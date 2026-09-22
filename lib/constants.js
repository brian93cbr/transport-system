export const APP_NAME = '交通組整合資訊系統';
export const APP_VERSION = 'v0.1.0';
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
