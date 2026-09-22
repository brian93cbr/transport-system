// 建立擁有者帳號（只需執行一次）
// 用法：npm run create-owner -- <使用者名稱> <密碼> [顯示名稱]
import { createClient } from '@supabase/supabase-js';

const [username, password, displayName] = process.argv.slice(2);
if (!username || !password) {
  console.error('用法：npm run create-owner -- <使用者名稱> <密碼> [顯示名稱]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('找不到 Supabase 設定，請確認 .env.local 已填寫。');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const uname = username.trim().toLowerCase();
const email = `${uname}@transport.local`;

const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error('建立帳號失敗：', error.message);
  process.exit(1);
}
const { error: pErr } = await admin.from('profiles').insert({
  id: data.user.id,
  username: uname,
  display_name: displayName || uname,
  role: 'owner',
});
if (pErr) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error('建立個人資料失敗：', pErr.message);
  process.exit(1);
}
console.log(`已建立擁有者帳號：${uname}`);
