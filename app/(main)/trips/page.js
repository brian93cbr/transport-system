'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import Modal from '@/components/Modal';
import { DEFAULT_LEAD_MINUTES, TRIP_STATUS } from '@/lib/constants';
import { dbError, emptyToNull, fmtDate, fmtDateFull, groupBy, hm, mapsUrl, minusMinutes, toIntOrNull } from '@/lib/utils';
import { groupCountMap, headcountLabel, tripCapacity, tripHeadcount, vehicleCount } from '@/lib/calc';
import { loadPrivateNotes, savePrivateNote } from '@/lib/privateNotes';

const EMPTY = {
  date: '', depart_time: '', arrive_time: '', schedule_item_id: '',
  origin_id: '', destination_id: '',
  headcount_mode: 'manual', manual_count: '', roster_scope: 'all', roster_groups: [], extra_count: '',
  vehicle_type_id: '', capacity_override: '', status: 'planning', note: '', internal_note: '',
};

export default function TripsPage() {
  const supabase = getSupabase();
  const { isOwner } = useAuth();
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState({});
  const [dateFilter, setDateFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [trips, locs, sched, types, vendors, counts, setting] = await Promise.all([
      supabase.from('trips').select('*').order('date').order('depart_time'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('schedule_items').select('*').order('date').order('start_time'),
      supabase.from('vehicle_types').select('*').order('capacity', { ascending: false }),
      supabase.from('vendors').select('*').order('name'),
      supabase.rpc('roster_group_counts'),
      supabase.from('settings').select('value').eq('key', 'trip_lead_minutes').maybeSingle(),
    ]);
    const firstErr = [trips, locs, sched, types, vendors, counts].find((r) => r.error);
    if (firstErr) setError(dbError(firstErr.error));
    setData({
      trips: trips.data || [],
      locations: locs.data || [],
      schedule: sched.data || [],
      types: types.data || [],
      vendors: vendors.data || [],
      counts: groupCountMap(counts.data),
      lead: setting.data ? Number(setting.data.value) : DEFAULT_LEAD_MINUTES,
    });
    if (isOwner) setNotes(await loadPrivateNotes(supabase, 'trips'));
  }, [supabase, isOwner]);

  useEffect(() => { load(); }, [load]);

  const lookups = useMemo(() => {
    if (!data) return null;
    const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
    return { loc: by(data.locations), sched: by(data.schedule), type: by(data.types), vendor: by(data.vendors) };
  }, [data]);

  if (!data) return <div className="loading">載入中…</div>;

  const computed = data.trips.map((t) => {
    const hc = tripHeadcount(t, data.counts);
    const cap = tripCapacity(t, lookups.type);
    return { ...t, hc, cap, vehicles: vehicleCount(hc.total, cap) };
  });
  const dates = [...new Set(computed.map((t) => t.date))];
  const shown = computed.filter((t) => !dateFilter || t.date === dateFilter);
  const byDate = groupBy(shown, (t) => t.date);

  async function remove(t) {
    if (!confirm('確定刪除這筆用車需求？')) return;
    const { error: err } = await supabase.from('trips').delete().eq('id', t.id);
    if (err) return setError(dbError(err));
    load();
  }

  const openNew = () => setEditing({ ...EMPTY, date: dateFilter || '' });
  const toForm = (t, extra = {}) => ({
    ...EMPTY, ...t,
    schedule_item_id: t.schedule_item_id || '',
    vehicle_type_id: t.vehicle_type_id || '',
    manual_count: t.manual_count ?? '', extra_count: t.extra_count || '',
    capacity_override: t.capacity_override ?? '',
    internal_note: notes[t.id] || '',
    ...extra,
  });

  const missingSetup = data.locations.length === 0 || data.types.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>用車需求</h1>
          <p>車數 = 人數 ÷ 每車可搭乘人數，無條件進位。</p>
        </div>
        <div className="actions">
          {dates.length > 1 && (
            <select className="select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="">全部日期</option>
              {dates.map((d) => <option key={d} value={d}>{fmtDateFull(d)}</option>)}
            </select>
          )}
          {isOwner && <button className="btn primary" onClick={openNew}>新增用車需求</button>}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {isOwner && missingSetup && (
        <div className="alert info">
          開始之前，請先建立{data.locations.length === 0 && <> <a href="/locations">地點</a></>}
          {data.locations.length === 0 && data.types.length === 0 && '和'}
          {data.types.length === 0 && <> <a href="/vendors">廠商與車型</a></>}。
        </div>
      )}

      {shown.length === 0 ? (
        <div className="panel"><div className="empty">
          還沒有任何用車需求。
          {isOwner && !missingSetup && <div><button className="btn primary" onClick={openNew}>新增第一筆用車需求</button></div>}
        </div></div>
      ) : Object.entries(byDate).map(([date, list]) => {
        const sumVehicles = list.reduce((a, t) => a + (t.vehicles || 0), 0);
        const sumPeople = list.reduce((a, t) => a + t.hc.total, 0);
        return (
          <section className="day-block" key={date}>
            <div className="day-title">
              <h2>{fmtDateFull(date)}</h2>
              <span className="sum">{list.length} 趟・{sumPeople} 人次・合計 {sumVehicles} 車次</span>
            </div>
            {list.map((t) => (
              <TripRow key={t.id} t={t} lk={lookups} isOwner={isOwner} internal={notes[t.id]}
                onEdit={() => setEditing(toForm(t))}
                onCopy={() => setEditing(toForm(t, { id: undefined }))}
                onReturn={() => setEditing(toForm(t, {
                  id: undefined, origin_id: t.destination_id, destination_id: t.origin_id,
                  depart_time: '', arrive_time: '', schedule_item_id: '',
                }))}
                onDelete={() => remove(t)} />
            ))}
          </section>
        );
      })}

      {editing && (
        <TripForm initial={editing} data={data} lk={lookups}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function TripRow({ t, lk, isOwner, internal, onEdit, onCopy, onReturn, onDelete }) {
  const o = lk.loc[t.origin_id], d = lk.loc[t.destination_id];
  const s = lk.sched[t.schedule_item_id];
  const type = lk.type[t.vehicle_type_id];
  const vendor = type && lk.vendor[type.vendor_id];
  return (
    <div className="trip-row">
      <div className="trip-time">
        <strong>{hm(t.depart_time)}</strong>
        <span>{t.arrive_time ? `抵達 ${hm(t.arrive_time)}` : '發車'}</span>
      </div>
      <div>
        <div className="trip-route">
          {o ? <a href={mapsUrl(o)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{o.name}</a> : '—'}
          <span className="arrow">→</span>
          {d ? <a href={mapsUrl(d)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{d.name}</a> : '—'}
        </div>
        <div className="trip-meta">
          {s && <span className="tag route">{s.name}</span>}
          <span className="num"><strong>{t.hc.total}</strong> 人（{headcountLabel(t)}{t.hc.extra ? `＋額外 ${t.hc.extra}` : ''}）</span>
          <span>{type ? `${vendor?.name || ''} ${type.name}` : '未選車型'}{t.cap ? `・每車 ${t.cap} 人` : ''}{t.capacity_override ? '（已調整）' : ''}</span>
          <span className={`tag ${t.status === 'confirmed' ? 'ok' : 'warn'}`}>{TRIP_STATUS[t.status]}</span>
        </div>
        {t.hc.missing.length > 0 && (
          <div className="warn-text">名單中找不到組別：{t.hc.missing.join('、')}，這些組未計入人數。</div>
        )}
        {t.note && <div className="trip-note">{t.note}</div>}
        {isOwner && internal && <div className="trip-note internal">內部：{internal}</div>}
      </div>
      <div className="trip-side">
        {t.vehicles === null
          ? <span className="plate none">未選車型</span>
          : <span className="plate">{t.vehicles}<small>車</small></span>}
        {isOwner && (
          <div className="row-actions small">
            <button className="link-btn" onClick={onEdit}>編輯</button>
            <button className="link-btn" onClick={onCopy}>複製</button>
            <button className="link-btn" onClick={onReturn}>建立回程</button>
            <button className="link-btn danger" onClick={onDelete}>刪除</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TripForm({ initial, data, lk, onClose, onSaved }) {
  const supabase = getSupabase();
  const [f, setF] = useState({
    ...initial,
    depart_time: hm(initial.depart_time), arrive_time: hm(initial.arrive_time),
  });
  const [autoMsg, setAutoMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const groups = Object.keys(data.counts);
  const hc = tripHeadcount({
    ...f,
    manual_count: toIntOrNull(f.manual_count) || 0,
    extra_count: toIntOrNull(f.extra_count) || 0,
  }, data.counts);
  const cap = tripCapacity({ ...f, capacity_override: toIntOrNull(f.capacity_override) }, lk.type);
  const vehicles = vehicleCount(hc.total, cap);
  const selectedType = lk.type[f.vehicle_type_id];

  function pickActivity(e) {
    const id = e.target.value;
    const s = lk.sched[id];
    if (!s) { setF({ ...f, schedule_item_id: id }); setAutoMsg(''); return; }
    const sug = minusMinutes(s.date, s.start_time, data.lead);
    setF({
      ...f, schedule_item_id: id,
      date: sug.date, depart_time: sug.time,
      destination_id: s.location_id || f.destination_id,
    });
    setAutoMsg(`已依活動帶入：日期、發車時間（活動開始前 ${data.lead} 分鐘）${s.location_id ? '、目的地' : ''}，都可以再修改。`);
  }

  function toggleGroup(g) {
    const cur = new Set(f.roster_groups || []);
    cur.has(g) ? cur.delete(g) : cur.add(g);
    setF({ ...f, roster_groups: [...cur] });
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (f.origin_id && f.origin_id === f.destination_id) return setError('起點和目的地不能相同。');
    if (f.headcount_mode === 'roster' && f.roster_scope === 'groups' && (f.roster_groups || []).length === 0) {
      return setError('請至少勾選一個組別，或改選「全體」。');
    }
    setBusy(true);
    const payload = {
      date: f.date,
      depart_time: f.depart_time,
      arrive_time: emptyToNull(f.arrive_time),
      schedule_item_id: emptyToNull(f.schedule_item_id),
      origin_id: f.origin_id,
      destination_id: f.destination_id,
      headcount_mode: f.headcount_mode,
      manual_count: f.headcount_mode === 'manual' ? toIntOrNull(f.manual_count) || 0 : 0,
      roster_scope: f.roster_scope,
      roster_groups: f.headcount_mode === 'roster' && f.roster_scope === 'groups' ? f.roster_groups : [],
      extra_count: f.headcount_mode === 'roster' ? toIntOrNull(f.extra_count) || 0 : 0,
      vehicle_type_id: emptyToNull(f.vehicle_type_id),
      capacity_override: toIntOrNull(f.capacity_override),
      status: f.status,
      note: emptyToNull(f.note),
    };
    const res = initial.id
      ? await supabase.from('trips').update(payload).eq('id', initial.id).select('id').single()
      : await supabase.from('trips').insert(payload).select('id').single();
    if (res.error) { setBusy(false); return setError(dbError(res.error)); }
    const nr = await savePrivateNote(supabase, 'trips', res.data.id, f.internal_note);
    setBusy(false);
    if (nr.error) return setError(dbError(nr.error));
    onSaved();
  }

  const schedByDate = groupBy(data.schedule, (s) => s.date);

  return (
    <Modal wide title={initial.id ? '編輯用車需求' : '新增用車需求'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" form="trip-form" disabled={busy}>儲存用車需求</button></>}>
      <form id="trip-form" onSubmit={save} className="form-grid">
        {error && <div className="alert error full">{error}</div>}

        <div className="field full"><label>用車活動</label>
          <select className="select" value={f.schedule_item_id || ''} onChange={pickActivity}>
            <option value="">（不指定，單純移動）</option>
            {Object.entries(schedByDate).map(([d, list]) => (
              <optgroup key={d} label={fmtDate(d)}>
                {list.map((s) => <option key={s.id} value={s.id}>{hm(s.start_time)} {s.name}</option>)}
              </optgroup>
            ))}
          </select>
          {autoMsg && <div className="hint" style={{ color: 'var(--route)' }}>{autoMsg}</div>}
        </div>

        <div className="field full"><label className="required">日期</label>
          <input className="input" type="date" value={f.date} onChange={set('date')} required /></div>
        <div className="field"><label className="required">發車時間</label>
          <input className="input" type="time" value={f.depart_time} onChange={set('depart_time')} required /></div>
        <div className="field"><label>預計抵達時間</label>
          <input className="input" type="time" value={f.arrive_time || ''} onChange={set('arrive_time')} />
          <div className="hint">之後計算「尖峰同時用車數」會用到，建議填寫。</div></div>

        <div className="field"><label className="required">起點</label>
          <select className="select" value={f.origin_id} onChange={set('origin_id')} required>
            <option value="">請選擇</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></div>
        <div className="field"><label className="required">目的地</label>
          <select className="select" value={f.destination_id} onChange={set('destination_id')} required>
            <option value="">請選擇</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></div>

        <div className="field full">
          <label>人數來源</label>
          <div className="seg" role="group">
            <button type="button" className={f.headcount_mode === 'manual' ? 'on' : ''} onClick={() => setF({ ...f, headcount_mode: 'manual' })}>手動輸入</button>
            <button type="button" className={f.headcount_mode === 'roster' ? 'on' : ''} onClick={() => setF({ ...f, headcount_mode: 'roster' })}>從搭車名單計算</button>
          </div>
        </div>

        <div className="full subbox">
          {f.headcount_mode === 'manual' ? (
            <div className="field"><label className="required">人數</label>
              <input className="input" type="number" min="0" value={f.manual_count} onChange={set('manual_count')} required style={{ maxWidth: 200 }} /></div>
          ) : groups.length === 0 ? (
            <div className="muted small">搭車名單還是空的，請先到「搭車名單」匯入，或改用手動輸入。</div>
          ) : (
            <div className="form-grid">
              <div className="field full"><label>範圍</label>
                <div className="seg" role="group">
                  <button type="button" className={f.roster_scope === 'all' ? 'on' : ''} onClick={() => setF({ ...f, roster_scope: 'all' })}>全體</button>
                  <button type="button" className={f.roster_scope === 'groups' ? 'on' : ''} onClick={() => setF({ ...f, roster_scope: 'groups' })}>指定組別</button>
                </div>
              </div>
              {f.roster_scope === 'groups' && (
                <div className="field full"><label>組別</label>
                  <div className="checks">
                    {groups.map((g) => (
                      <label key={g}>
                        <input type="checkbox" checked={(f.roster_groups || []).includes(g)} onChange={() => toggleGroup(g)} />
                        {g}<span className="muted small">（{data.counts[g]}）</span>
                      </label>
                    ))}
                  </div>
                  {hc.missing.length > 0 && <div className="warn-text">名單中已沒有：{hc.missing.join('、')}</div>}
                </div>
              )}
              <div className="field"><label>額外人數</label>
                <input className="input" type="number" min="0" value={f.extra_count} onChange={set('extra_count')} placeholder="0" />
                <div className="hint">不在名單中的人，例如工作人員、隨行老師。</div></div>
            </div>
          )}
        </div>

        <div className="field"><label>廠商／車型</label>
          <select className="select" value={f.vehicle_type_id} onChange={set('vehicle_type_id')}>
            <option value="">（尚未決定）</option>
            {data.vendors.map((v) => {
              const vt = data.types.filter((t) => t.vendor_id === v.id);
              return vt.length ? (
                <optgroup key={v.id} label={v.name}>
                  {vt.map((t) => <option key={t.id} value={t.id}>{t.name}（每車 {t.capacity} 人）</option>)}
                </optgroup>
              ) : null;
            })}
          </select></div>
        <div className="field"><label>本趟每車可搭乘人數</label>
          <input className="input" type="number" min="1" value={f.capacity_override} onChange={set('capacity_override')}
            placeholder={selectedType ? `預設 ${selectedType.capacity}` : '先選車型'} />
          <div className="hint">留空則使用車型的預設值。</div></div>

        <div className="full calc-bar">
          <div><div className="k">總人數</div><div className="v">{hc.total}</div></div>
          <div className="op">÷</div>
          <div><div className="k">每車可搭乘</div><div className="v">{cap ?? '—'}</div></div>
          <div className="op">＝</div>
          {vehicles === null
            ? <span className="plate none">選擇車型後計算</span>
            : <span className="plate lg">{vehicles}<small>車</small></span>}
        </div>

        <div className="field"><label>狀態</label>
          <select className="select" value={f.status} onChange={set('status')}>
            {Object.entries(TRIP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="field" />
        <div className="field"><label>公開備註</label>
          <textarea className="textarea" value={f.note || ''} onChange={set('note')} />
          <div className="hint">檢視者看得到。</div></div>
        <div className="field"><label>內部備註</label>
          <textarea className="textarea" value={f.internal_note || ''} onChange={set('internal_note')} />
          <div className="hint">只有你看得到，適合記價格、議價情況。</div></div>
      </form>
    </Modal>
  );
}
