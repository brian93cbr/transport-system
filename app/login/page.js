'use client';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { APP_NAME, APP_VERSION, usernameToEmail } from '@/lib/constants';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const supabase = getSupabase();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (err) {
      setBusy(false);
      setError(err.message.includes('banned') ? '此帳號已停用，請洽交通組長。' : '使用者名稱或密碼錯誤。');
      return;
    }
    window.location.href = '/overview';
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-stripe" />
        <h1>{APP_NAME}</h1>
        <p className="sub">請以交通組長提供的帳號登入</p>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label htmlFor="u">使用者名稱</label>
          <input id="u" className="input" autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="p">密碼</label>
          <input id="p" type="password" className="input" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn primary" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
        <p className="muted small" style={{ margin: '16px 0 0', textAlign: 'center' }}>{APP_VERSION}</p>
      </form>
    </div>
  );
}
