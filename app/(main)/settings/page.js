'use client';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import Modal from '@/components/Modal';
import OwnerOnly from '@/components/OwnerOnly';
import { DEFAULT_LEAD_MINUTES } from '@/lib/constants';
import { dbError } from '@/lib/utils';

export default function SettingsPage() {
  return <OwnerOnly><Settings /></OwnerOnly>;
}

async function api(method, body, query = '') {
  const res = await fetch(`/api/admin/users${query}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || '操作失敗');
  return json;
}

function Settings() {
  const supabase = getSupabase();
  const { profile } = useAuth();
  const [users, setUsers] = useState(null);
  const [lead, setLead] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [u, s] = await Promise.all([
      supabase.from('profiles').select('*').order('role').order('created_at'),
      supabase.from('settings').select('value').eq('key', 'trip_lead_minutes').maybeSingle(),
    ]);
    if (u.error) setError(dbError(u.error));
    setUsers(u.data || []);
    setLead(String(s.data ? s.data.value : DEFAULT_LEAD_MINUTES));
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setNotice(msg); setError(''); };

  async function toggle(u) {
    try {
      await api('PATCH', { id: u.id, active: !u.active });
      flash(u.active ? `已停用「${u.username}」。` : `已啟用「${u.username}」。`);
      load();
    } catch (e) { setError(e.message); }
  }

  async function remove(u) {
    if (!confirm(`確定刪除帳號「${u.username}」？此操作無法復原。`)) return;
    try { await api('DELETE', null, `?id=${u.id}`); flash(`已刪除「${u.username}」。`); load(); }
    catch (e) { setError(e.message); }
  }

  async function saveLead(e) {
    e.preventDefault();
    const n = parseInt(lead, 10);
    if (Number.isNaN(n) || n < 0 || n > 600) return setError('請輸入 0–600 之間的分鐘數。');
    const { error: err } = await supabase.from('settings').upsert({ key: 'trip_lead_minutes', value: n });
    if (err) return setError(dbError(err));
    flash('已儲存參數。');
  }

  return (
    <>
      <div className="page-head">
        <div><h1>帳號與設定</h1><p>檢視者可以看時程表、用車需求和地點，看不到名單個資與內部備註。</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}>新增檢視者</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="panel">
        <div className="panel-head"><h2>帳號</h2></div>
        {users === null ? <div className="loading">載入中…</div> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>使用者名稱</th><th>顯示名稱</th><th>身分</th><th>狀態</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="nowrap"><strong>{u.username}</strong></td>
                    <td>{u.display_name}</td>
                    <td><span className={`tag ${u.role === 'owner' ? 'route' : ''}`}>{u.role === 'owner' ? '交通組長' : '檢視者'}</span></td>
                    <td><span className={`tag ${u.active ? 'ok' : 'danger'}`}>{u.active ? '使用中' : '已停用'}</span></td>
                    <td>
                      {u.id !== profile.id && u.role !== 'owner' && (
                        <div className="row-actions">
                          <button className="link-btn" onClick={() => setResetting(u)}>重設密碼</button>
                          <button className="link-btn" onClick={() => toggle(u)}>{u.active ? '停用' : '啟用'}</button>
                          <button className="link-btn danger" onClick={() => remove(u)}>刪除</button>
                        </div>
                      )}
                      {u.id === profile.id && (
                        <button className="link-btn" onClick={() => setResetting(u)}>變更我的密碼</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><h2>用車需求參數</h2></div>
        <form className="panel-body" onSubmit={saveLead}>
          <div className="field" style={{ maxWidth: 360 }}>
            <label>選擇用車活動時，發車時間預設為活動開始前幾分鐘</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type="number" min="0" max="600" value={lead} onChange={(e) => setLead(e.target.value)} />
              <button className="btn primary">儲存</button>
            </div>
          </div>
        </form>
      </div>

      {creating && (
        <CreateUser onClose={() => setCreating(false)}
          onDone={(name) => { setCreating(false); flash(`已建立檢視者「${name}」。`); load(); }} />
      )}
      {resetting && (
        <ResetPassword user={resetting} onClose={() => setResetting(null)}
          onDone={() => { setResetting(null); flash(`已重設「${resetting.username}」的密碼。`); }} />
      )}
    </>
  );
}

function CreateUser({ onClose, onDone }) {
  const [f, setF] = useState({ username: '', display_name: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try { await api('POST', f); onDone(f.username.trim().toLowerCase()); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title="新增檢視者" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" form="user-form" disabled={busy}>建立帳號</button></>}>
      <form id="user-form" onSubmit={save} className="form-grid">
        {error && <div className="alert error full">{error}</div>}
        <div className="field"><label className="required">使用者名稱</label>
          <input className="input" value={f.username} onChange={set('username')} required autoComplete="off" />
          <div className="hint">3–32 個英數字，可含 . _ -</div></div>
        <div className="field"><label>顯示名稱</label>
          <input className="input" value={f.display_name} onChange={set('display_name')} placeholder="例如：總召 王小明" /></div>
        <div className="field full"><label className="required">密碼</label>
          <input className="input" value={f.password} onChange={set('password')} required minLength={6} autoComplete="new-password" />
          <div className="hint">至少 6 個字元。建立後請自行轉交給對方。</div></div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    try { await api('PATCH', { id: user.id, password: pw }); onDone(); }
    catch (err) { setError(err.message); }
  }

  return (
    <Modal title={`重設密碼：${user.username}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" form="pw-form">重設密碼</button></>}>
      <form id="pw-form" onSubmit={save}>
        {error && <div className="alert error">{error}</div>}
        <div className="field"><label className="required">新密碼</label>
          <input className="input" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
      </form>
    </Modal>
  );
}
