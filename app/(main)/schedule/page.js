'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import Modal from '@/components/Modal';
import { dbError, emptyToNull, findOverlaps, fmtDateFull, groupBy, hm, mapsUrl } from '@/lib/utils';
import { loadPrivateNotes, savePrivateNote } from '@/lib/privateNotes';

export default function SchedulePage() {
  const supabase = getSupabase();
  const { isOwner } = useAuth();
  const [items, setItems] = useState(null);
  const [locations, setLocations] = useState([]);
  const [notes, setNotes] = useState({});
  const [dateFilter, setDateFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      supabase.from('schedule_items').select('*').order('date').order('start_time'),
      supabase.from('locations').select('*').order('name'),
    ]);
    if (s.error || l.error) setError(dbError(s.error || l.error));
    setItems(s.data || []);
    setLocations(l.data || []);
    if (isOwner) setNotes(await loadPrivateNotes(supabase, 'schedule_items'));
  }, [supabase, isOwner]);

  useEffect(() => { load(); }, [load]);

  const locById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const overlaps = useMemo(() => findOverlaps(items || []), [items]);
  const dates = useMemo(() => [...new Set((items || []).map((i) => i.date))], [items]);
  const shown = (items || []).filter((i) => !dateFilter || i.date === dateFilter);
  const byDate = groupBy(shown, (i) => i.date);

  async function remove(row) {
    if (!confirm(`確定刪除活動「${row.name}」？\n關聯到此活動的用車需求會保留，但不再顯示用車活動。`)) return;
    const { error: err } = await supabase.from('schedule_items').delete().eq('id', row.id);
    if (err) return setError(dbError(err));
    load();
  }

  const newItem = () => setEditing({ date: dateFilter || dates[dates.length - 1] || '' });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>大會時程表</h1>
          <p>同一時段可有多個活動並行，時間重疊的活動會標示「並行」。</p>
        </div>
        <div className="actions">
          {dates.length > 1 && (
            <select className="select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="">全部日期</option>
              {dates.map((d) => <option key={d} value={d}>{fmtDateFull(d)}</option>)}
            </select>
          )}
          {isOwner && <button className="btn primary" onClick={newItem}>新增活動</button>}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {items === null ? <div className="loading">載入中…</div> : shown.length === 0 ? (
        <div className="panel"><div className="empty">
          時程表還是空的。
          {isOwner && <div><button className="btn primary" onClick={newItem}>新增第一個活動</button></div>}
        </div></div>
      ) : Object.entries(byDate).map(([date, list]) => (
        <section className="day-block" key={date}>
          <div className="day-title"><h2>{fmtDateFull(date)}</h2><span className="sum">{list.length} 個活動</span></div>
          <div className="panel table-wrap">
            <table className="data">
              <thead><tr><th>時間</th><th>活動名稱</th><th>地點</th><th>備註</th>{isOwner && <th />}</tr></thead>
              <tbody>
                {list.map((r) => {
                  const loc = locById[r.location_id];
                  return (
                    <tr key={r.id}>
                      <td className="nowrap num"><strong>{hm(r.start_time)}</strong>{r.end_time && <> – {hm(r.end_time)}</>}</td>
                      <td>
                        <strong>{r.name}</strong>{' '}
                        {overlaps.has(r.id) && <span className="tag route">並行</span>}
                      </td>
                      <td className="nowrap">
                        {loc ? <>{loc.name}{mapsUrl(loc) && <> <a className="small" href={mapsUrl(loc)} target="_blank" rel="noreferrer">地圖</a></>}</> : <span className="muted">—</span>}
                      </td>
                      <td className="small">
                        {r.note && <div style={{ whiteSpace: 'pre-wrap' }}>{r.note}</div>}
                        {isOwner && notes[r.id] && <div className="trip-note internal">內部：{notes[r.id]}</div>}
                      </td>
                      {isOwner && (
                        <td><div className="row-actions">
                          <button className="link-btn" onClick={() => setEditing({ ...r, internal_note: notes[r.id] || '' })}>編輯</button>
                          <button className="link-btn danger" onClick={() => remove(r)}>刪除</button>
                        </div></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {editing && (
        <ScheduleForm initial={editing} locations={locations}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function ScheduleForm({ initial, locations, onClose, onSaved }) {
  const supabase = getSupabase();
  const [f, setF] = useState({
    date: '', start_time: '', end_time: '', name: '', location_id: '', note: '', internal_note: '',
    ...initial,
    start_time: hm(initial.start_time), end_time: hm(initial.end_time),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    if (f.end_time && f.end_time < f.start_time) return setError('結束時間不能早於開始時間。');
    setBusy(true);
    const payload = {
      date: f.date,
      start_time: f.start_time,
      end_time: emptyToNull(f.end_time),
      name: f.name.trim(),
      location_id: emptyToNull(f.location_id),
      note: emptyToNull(f.note),
    };
    const res = initial.id
      ? await supabase.from('schedule_items').update(payload).eq('id', initial.id).select('id').single()
      : await supabase.from('schedule_items').insert(payload).select('id').single();
    if (res.error) { setBusy(false); return setError(dbError(res.error)); }
    const nr = await savePrivateNote(supabase, 'schedule_items', res.data.id, f.internal_note);
    setBusy(false);
    if (nr.error) return setError(dbError(nr.error));
    onSaved();
  }

  return (
    <Modal title={initial.id ? '編輯活動' : '新增活動'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" form="sch-form" disabled={busy}>儲存活動</button></>}>
      <form id="sch-form" onSubmit={save} className="form-grid">
        {error && <div className="alert error full">{error}</div>}
        <div className="field full"><label className="required">活動名稱</label>
          <input className="input" value={f.name} onChange={set('name')} required /></div>
        <div className="field full"><label className="required">日期</label>
          <input className="input" type="date" value={f.date} onChange={set('date')} required /></div>
        <div className="field"><label className="required">開始時間</label>
          <input className="input" type="time" value={f.start_time} onChange={set('start_time')} required /></div>
        <div className="field"><label>結束時間</label>
          <input className="input" type="time" value={f.end_time || ''} onChange={set('end_time')} /></div>
        <div className="field full"><label>活動地點</label>
          <select className="select" value={f.location_id || ''} onChange={set('location_id')}>
            <option value="">（未指定）</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {locations.length === 0 && <div className="hint">地點庫還是空的，請先到「地點庫」新增地點。</div>}
        </div>
        <div className="field full"><label>公開備註</label>
          <textarea className="textarea" value={f.note || ''} onChange={set('note')} />
          <div className="hint">檢視者看得到。</div></div>
        <div className="field full"><label>內部備註</label>
          <textarea className="textarea" value={f.internal_note || ''} onChange={set('internal_note')} />
          <div className="hint">只有你看得到。</div></div>
      </form>
    </Modal>
  );
}
