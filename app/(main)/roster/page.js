'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import Modal from '@/components/Modal';
import { dbError, emptyToNull } from '@/lib/utils';

const FIELD_ALIASES = {
  code: ['編號', '學號', '序號', '報名編號', '代號', 'id', 'ID', 'code'],
  name: ['姓名', '名字', 'name', 'Name'],
  group_name: ['組別', '小隊', '隊別', '分組', '組', 'group', 'Group'],
  phone: ['電話', '手機', '聯絡電話', '行動電話', 'phone', 'Phone'],
};
const FIELD_LABEL = { code: '編號', name: '姓名', group_name: '組別', phone: '電話' };

async function fetchAllParticipants(supabase) {
  const size = 1000;
  let from = 0, all = [];
  for (;;) {
    const { data, error } = await supabase.from('participants').select('*')
      .order('group_name', { nullsFirst: false }).order('code', { nullsFirst: false }).order('name')
      .range(from, from + size - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < size) return all;
    from += size;
  }
}

export default function RosterPage() {
  const supabase = getSupabase();
  const { isOwner } = useAuth();
  const [counts, setCounts] = useState(null);
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('roster_group_counts');
    if (err) setError(dbError(err));
    setCounts(data || []);
    if (isOwner) {
      try { setPeople(await fetchAllParticipants(supabase)); } catch (e) { setError(dbError(e)); }
    }
  }, [supabase, isOwner]);

  useEffect(() => { load(); }, [load]);

  const total = (counts || []).reduce((a, r) => a + Number(r.cnt), 0);
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return people.filter((p) => {
      const g = (p.group_name || '').trim() || '（未分組）';
      if (groupFilter && g !== groupFilter) return false;
      if (!kw) return true;
      return [p.code, p.name, p.phone, p.group_name].some((v) => (v || '').toLowerCase().includes(kw));
    });
  }, [people, q, groupFilter]);

  async function remove(p) {
    if (!confirm(`確定刪除「${p.name}」？`)) return;
    const { error: err } = await supabase.from('participants').delete().eq('id', p.id);
    if (err) return setError(dbError(err));
    load();
  }

  if (counts === null) return <div className="loading">載入中…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>搭車名單</h1>
          <p>{isOwner ? '用車需求可依組別從這份名單自動計算人數。目前不分車。' : '各組人數統計。'}</p>
        </div>
        {isOwner && (
          <div className="actions">
            <button className="btn" onClick={() => setEditing({})}>新增一人</button>
            <button className="btn primary" onClick={() => setImporting(true)}>匯入 Excel</button>
          </div>
        )}
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="panel">
        <div className="panel-head"><h2>各組人數</h2><span className="muted small">共 {total} 人</span></div>
        <div className="panel-body">
          {counts.length === 0 ? <div className="muted">名單還是空的。</div> : (
            <div className="stat-grid">
              {counts.map((r) => (
                <div className="stat" key={r.group_name}><div className="k">{r.group_name}</div><div className="v">{r.cnt}</div></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isOwner && people.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2>名單</h2>
            <div className="toolbar" style={{ margin: 0 }}>
              <input className="input" placeholder="搜尋姓名、編號、電話" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="select" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">全部組別</option>
                {counts.map((r) => <option key={r.group_name} value={r.group_name}>{r.group_name}</option>)}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>編號</th><th>姓名</th><th>組別</th><th>電話</th><th>其他欄位</th><th /></tr></thead>
              <tbody>
                {filtered.slice(0, 500).map((p) => (
                  <tr key={p.id}>
                    <td className="num nowrap">{p.code}</td>
                    <td className="nowrap"><strong>{p.name}</strong></td>
                    <td className="nowrap">{p.group_name}</td>
                    <td className="nowrap">{p.phone && <a href={`tel:${p.phone}`}>{p.phone}</a>}</td>
                    <td className="small muted">{Object.entries(p.extra || {}).map(([k, v]) => `${k}：${v}`).join('　')}</td>
                    <td><div className="row-actions">
                      <button className="link-btn" onClick={() => setEditing(p)}>編輯</button>
                      <button className="link-btn danger" onClick={() => remove(p)}>刪除</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 500 && <div className="panel-body muted small">符合 {filtered.length} 筆，僅顯示前 500 筆，請用搜尋縮小範圍。</div>}
        </div>
      )}

      {importing && (
        <ImportDialog onClose={() => setImporting(false)}
          onDone={(msg) => { setImporting(false); setNotice(msg); setError(''); load(); }} />
      )}
      {editing && (
        <PersonForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function detect(headers) {
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    map[field] = headers.find((h) => aliases.some((a) => String(h).trim().toLowerCase() === a.toLowerCase())) || '';
  }
  return map;
}

function ImportDialog({ onClose, onDone }) {
  const supabase = getSupabase();
  const [rows, setRows] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({});
  const [mode, setMode] = useState('replace');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (json.length === 0) return setError('檔案中沒有資料列，請確認第一列是欄位名稱。');
      const hs = Object.keys(json[0]);
      setHeaders(hs);
      setMap(detect(hs));
      setRows(json);
    } catch {
      setError('無法讀取這個檔案，請使用 .xlsx、.xls 或 .csv 格式。');
    }
  }

  const records = useMemo(() => {
    if (!rows) return [];
    const used = new Set(Object.values(map).filter(Boolean));
    return rows.map((r) => {
      const extra = {};
      for (const h of headers) if (!used.has(h) && String(r[h]).trim() !== '') extra[h] = String(r[h]).trim();
      const val = (f) => (map[f] ? String(r[map[f]] ?? '').trim() : '');
      return { code: val('code') || null, name: val('name'), group_name: val('group_name') || null, phone: val('phone') || null, extra };
    }).filter((r) => r.name);
  }, [rows, map, headers]);

  async function run() {
    if (!map.name) return setError('請指定「姓名」對應的欄位。');
    setBusy(true);
    setError('');
    // 檔案內編號重複時，保留最後一筆
    const byCode = new Map();
    const noCode = [];
    for (const r of records) r.code ? byCode.set(r.code, r) : noCode.push(r);
    const dup = records.length - noCode.length - byCode.size;
    const withCode = [...byCode.values()];

    try {
      if (mode === 'replace') {
        const { error: dErr } = await supabase.from('participants').delete().not('id', 'is', null);
        if (dErr) throw dErr;
      }
      const chunks = (arr) => Array.from({ length: Math.ceil(arr.length / 500) }, (_, i) => arr.slice(i * 500, i * 500 + 500));
      for (const c of chunks(withCode)) {
        const { error: err } = await supabase.from('participants').upsert(c, { onConflict: 'code' });
        if (err) throw err;
      }
      for (const c of chunks(noCode)) {
        const { error: err } = await supabase.from('participants').insert(c);
        if (err) throw err;
      }
      onDone(`已匯入 ${withCode.length + noCode.length} 人${dup ? `（檔案中有 ${dup} 筆編號重複，已以最後一筆為準）` : ''}。`);
    } catch (e) {
      setBusy(false);
      setError(`匯入失敗：${dbError(e)}`);
    }
  }

  return (
    <Modal wide title="匯入搭車名單" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={run} disabled={!rows || busy || records.length === 0}>
          {busy ? '匯入中…' : `匯入 ${records.length} 人`}
        </button>
      </>}>
      {error && <div className="alert error">{error}</div>}
      <div className="field" style={{ marginBottom: 14 }}>
        <label>選擇檔案</label>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
        <div className="hint">第一列為欄位名稱。會自動辨識「編號、姓名、組別、電話」，其他欄位一併保留。</div>
      </div>

      {rows && (
        <>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            {Object.keys(FIELD_LABEL).map((f) => (
              <div className="field" key={f}>
                <label className={f === 'name' ? 'required' : ''}>{FIELD_LABEL[f]}對應欄位</label>
                <select className="select" value={map[f]} onChange={(e) => setMap({ ...map, [f]: e.target.value })}>
                  <option value="">（無）</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div className="field full">
              <label>匯入方式</label>
              <div className="seg" role="group">
                <button type="button" className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>全部取代</button>
                <button type="button" className={mode === 'append' ? 'on' : ''} onClick={() => setMode('append')}>附加／更新</button>
              </div>
              <div className="hint">
                {mode === 'replace'
                  ? '會先清空現有名單，再匯入這份檔案。'
                  : '保留現有名單；編號相同的人會以檔案內容更新，沒有編號的一律新增。'}
              </div>
            </div>
          </div>

          <div className="muted small" style={{ marginBottom: 6 }}>預覽前 5 筆（共 {records.length} 筆有姓名的資料）</div>
          <div className="table-wrap panel">
            <table className="data">
              <thead><tr><th>編號</th><th>姓名</th><th>組別</th><th>電話</th><th>其他欄位</th></tr></thead>
              <tbody>
                {records.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td>{r.code}</td><td>{r.name}</td><td>{r.group_name}</td><td>{r.phone}</td>
                    <td className="small muted">{Object.entries(r.extra).map(([k, v]) => `${k}：${v}`).join('　')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function PersonForm({ initial, onClose, onSaved }) {
  const supabase = getSupabase();
  const [f, setF] = useState({ code: '', name: '', group_name: '', phone: '', ...initial });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    const payload = {
      code: emptyToNull(f.code?.trim?.() ?? f.code),
      name: f.name.trim(),
      group_name: emptyToNull(f.group_name?.trim?.() ?? f.group_name),
      phone: emptyToNull(f.phone),
    };
    const { error: err } = initial.id
      ? await supabase.from('participants').update(payload).eq('id', initial.id)
      : await supabase.from('participants').insert(payload);
    if (err) return setError(dbError(err));
    onSaved();
  }

  return (
    <Modal title={initial.id ? '編輯人員' : '新增人員'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" form="person-form">儲存</button></>}>
      <form id="person-form" onSubmit={save} className="form-grid">
        {error && <div className="alert error full">{error}</div>}
        <div className="field"><label>編號</label><input className="input" value={f.code || ''} onChange={set('code')} /></div>
        <div className="field"><label className="required">姓名</label><input className="input" value={f.name} onChange={set('name')} required /></div>
        <div className="field"><label>組別</label><input className="input" value={f.group_name || ''} onChange={set('group_name')} /></div>
        <div className="field"><label>電話</label><input className="input" value={f.phone || ''} onChange={set('phone')} inputMode="tel" /></div>
      </form>
    </Modal>
  );
}
