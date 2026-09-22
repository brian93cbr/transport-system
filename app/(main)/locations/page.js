'use client';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import Modal from '@/components/Modal';
import { dbError, emptyToNull, mapsUrl } from '@/lib/utils';

const EMPTY = { name: '', address: '', map_url: '', note: '' };

export default function LocationsPage() {
  const supabase = getSupabase();
  const { isOwner } = useAuth();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('locations').select('*').order('name');
    if (err) setError(dbError(err));
    setRows(data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function remove(row) {
    if (!confirm(`確定刪除地點「${row.name}」？`)) return;
    const { error: err } = await supabase.from('locations').delete().eq('id', row.id);
    if (err) return setError(dbError(err));
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>地點庫</h1>
          <p>時程表和用車需求共用的地點清單，名稱統一才能正確統計。</p>
        </div>
        {isOwner && <button className="btn primary" onClick={() => setEditing(EMPTY)}>新增地點</button>}
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        {rows === null ? <div className="loading">載入中…</div> : rows.length === 0 ? (
          <div className="empty">
            還沒有任何地點。
            {isOwner && <div><button className="btn primary" onClick={() => setEditing(EMPTY)}>新增第一個地點</button></div>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>名稱</th><th>地址</th><th>地圖</th><th>備註</th>{isOwner && <th />}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap"><strong>{r.name}</strong></td>
                    <td>{r.address || <span className="muted">—</span>}</td>
                    <td className="nowrap">
                      {mapsUrl(r) && <a href={mapsUrl(r)} target="_blank" rel="noreferrer">開啟地圖</a>}
                    </td>
                    <td className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.note}</td>
                    {isOwner && (
                      <td><div className="row-actions">
                        <button className="link-btn" onClick={() => setEditing(r)}>編輯</button>
                        <button className="link-btn danger" onClick={() => remove(r)}>刪除</button>
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <LocationForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function LocationForm({ initial, onClose, onSaved }) {
  const supabase = getSupabase();
  const [f, setF] = useState({ ...EMPTY, ...initial });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: f.name.trim(),
      address: emptyToNull(f.address),
      map_url: emptyToNull(f.map_url),
      note: emptyToNull(f.note),
    };
    const q = initial.id
      ? supabase.from('locations').update(payload).eq('id', initial.id)
      : supabase.from('locations').insert(payload);
    const { error: err } = await q;
    setBusy(false);
    if (err) return setError(dbError(err));
    onSaved();
  }

  return (
    <Modal title={initial.id ? '編輯地點' : '新增地點'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" form="loc-form" disabled={busy}>儲存地點</button>
      </>}>
      <form id="loc-form" onSubmit={save} className="form-grid">
        {error && <div className="alert error full">{error}</div>}
        <div className="field full">
          <label className="required">地點名稱</label>
          <input className="input" value={f.name} onChange={set('name')} required placeholder="例如：北醫大門口" />
        </div>
        <div className="field full">
          <label>地址</label>
          <input className="input" value={f.address || ''} onChange={set('address')} />
        </div>
        <div className="field full">
          <label>Google Maps 連結</label>
          <input className="input" value={f.map_url || ''} onChange={set('map_url')} placeholder="留空則依地址自動產生搜尋連結" />
        </div>
        <div className="field full">
          <label>備註</label>
          <textarea className="textarea" value={f.note || ''} onChange={set('note')} placeholder="例如：遊覽車停靠於側門" />
        </div>
      </form>
    </Modal>
  );
}
