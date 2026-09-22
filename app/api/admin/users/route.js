import { NextResponse } from 'next/server';
import { getServerSupabase, getAdminSupabase } from '@/lib/supabase/server';
import { usernameToEmail } from '@/lib/constants';

const BAN_FOREVER = '876000h';

async function requireOwner() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '請先登入' }, { status: 401 }) };
  const admin = getAdminSupabase();
  const { data: me } = await admin.from('profiles').select('*').eq('id', user.id).single();
  if (!me || me.role !== 'owner' || !me.active) {
    return { error: NextResponse.json({ error: '沒有權限執行此操作' }, { status: 403 }) };
  }
  return { admin, me };
}

const bad = (msg) => NextResponse.json({ error: msg }, { status: 400 });

export async function POST(req) {
  const { admin, error } = await requireOwner();
  if (error) return error;
  const body = await req.json();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const displayName = String(body.display_name || '').trim() || username;

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return bad('使用者名稱需為 3–32 個英數字（可含 . _ -）');
  if (password.length < 6) return bad('密碼至少 6 個字元');

  const { data: exists } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
  if (exists) return bad('這個使用者名稱已經有人使用');

  const { data, error: cErr } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });
  if (cErr) return bad(`建立帳號失敗：${cErr.message}`);

  const { error: pErr } = await admin.from('profiles').insert({
    id: data.user.id, username, display_name: displayName, role: 'viewer',
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return bad(`建立帳號失敗：${pErr.message}`);
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req) {
  const { admin, me, error } = await requireOwner();
  if (error) return error;
  const { id, active, password, display_name } = await req.json();
  if (!id) return bad('缺少帳號 ID');

  if (id === me.id && active === false) return bad('不能停用自己的帳號');

  const authUpdate = {};
  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 6) return bad('密碼至少 6 個字元');
    authUpdate.password = password;
  }
  if (typeof active === 'boolean') authUpdate.ban_duration = active ? 'none' : BAN_FOREVER;
  if (Object.keys(authUpdate).length) {
    const { error: uErr } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (uErr) return bad(`更新失敗：${uErr.message}`);
  }

  const profileUpdate = {};
  if (typeof active === 'boolean') profileUpdate.active = active;
  if (typeof display_name === 'string') profileUpdate.display_name = display_name.trim();
  if (Object.keys(profileUpdate).length) {
    const { error: pErr } = await admin.from('profiles').update(profileUpdate).eq('id', id);
    if (pErr) return bad(`更新失敗：${pErr.message}`);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const { admin, me, error } = await requireOwner();
  if (error) return error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return bad('缺少帳號 ID');
  if (id === me.id) return bad('不能刪除自己的帳號');
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
  if (target?.role === 'owner') return bad('不能刪除擁有者帳號');
  const { error: dErr } = await admin.auth.admin.deleteUser(id);
  if (dErr) return bad(`刪除失敗：${dErr.message}`);
  return NextResponse.json({ ok: true });
}
