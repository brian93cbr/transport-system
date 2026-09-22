# 交通組整合資訊系統

Next.js 15 + Supabase。統整大會時程表、地點、廠商車型、搭車名單與用車需求，自動計算車數。

## 權限
- 交通組長（owner）：全部功能
- 檢視者（viewer）：可看時程表、用車需求、地點、各組人數；看不到名單個資、內部備註、廠商設定頁與帳號管理

## 首次設定
1. Supabase SQL Editor 執行 `supabase/schema.sql`
2. Supabase → Authentication → Sign In / Providers → 關閉「Allow new users to sign up」
3. 複製 `.env.local.example` 為 `.env.local` 並填入金鑰
4. `npm install`
5. `npm run create-owner -- <使用者名稱> <密碼> <顯示名稱>`
6. `npm run dev`

## 部署
Vercel 匯入 GitHub repo，設定三個環境變數（同 `.env.local`）。
