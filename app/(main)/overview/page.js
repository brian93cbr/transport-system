'use client';
import { useEffect, useMemo, useState } from 'react';
import { fmtDateFull, hm, minToHm, toMin } from '@/lib/utils';
import { assignLanes, tripInterval } from '@/lib/peak';
import { useTransportData } from '@/lib/useTransportData';

const PX_PER_MIN = 1.3;
const LANE_W = 168;
const DEFAULT_ACTIVITY_MIN = 30;

function scheduleInterval(s) {
  const st = toMin(s.start_time);
  if (!s.end_time) return { s: st, e: st + DEFAULT_ACTIVITY_MIN, estimated: true };
  let e = toMin(s.end_time);
  if (e <= st) e = st + DEFAULT_ACTIVITY_MIN;
  return { s: st, e, estimated: false };
}

export default function OverviewPage() {
  const { data, lk, computed, error } = useTransportData();
  const [date, setDate] = useState('');

  const dates = useMemo(() => {
    if (!data) return [];
    return [...new Set([...data.schedule.map((s) => s.date), ...computed.map((t) => t.date)])].sort();
  }, [data, computed]);

  useEffect(() => {
    if (!dates.length || dates.includes(date)) return;
    const today = new Date().toISOString().slice(0, 10);
    setDate(dates.includes(today) ? today : dates[0]);
  }, [dates, date]);

  if (!data) return <div className="loading">載入中…</div>;

  const acts = data.schedule.filter((s) => s.date === date);
  const trips = computed.filter((t) => t.date === date);
  const A = assignLanes(acts, scheduleInterval);
  const T = assignLanes(trips, (t) => tripInterval(t, data.tripMinutes));

  const all = [...A.placed, ...T.placed];
  const startMin = all.length ? Math.floor(Math.min(...all.map((p) => p.s)) / 60) * 60 : 480;
  let endMin = all.length ? Math.ceil(Math.max(...all.map((p) => p.e)) / 60) * 60 : 1080;
  if (endMin - startMin < 240) endMin = startMin + 240;
  const height = (endMin - startMin) * PX_PER_MIN;
  const hours = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const top = (m) => (m - startMin) * PX_PER_MIN;

  const sumVehicles = trips.reduce((a, t) => a + (t.vehicles || 0), 0);
  const sumPeople = trips.reduce((a, t) => a + t.hc.total, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>日程總覽</h1>
          <p>大會活動與用車並排對照，同時段的項目會分欄顯示。</p>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {dates.length === 0 ? (
        <div className="panel"><div className="empty">時程表和用車需求都還是空的，新增後會在這裡出現時間軸。</div></div>
      ) : (
        <>
          <div className="date-tabs" role="tablist">
            {dates.map((d) => (
              <button key={d} role="tab" aria-selected={d === date} className={d === date ? 'on' : ''} onClick={() => setDate(d)}>
                {fmtDateFull(d).replace(/^\d{4} 年 /, '')}
              </button>
            ))}
          </div>

          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="k">大會活動</div><div className="v">{acts.length}</div></div>
            <div className="stat"><div className="k">用車趟數</div><div className="v">{trips.length}</div></div>
            <div className="stat"><div className="k">載運人次</div><div className="v">{sumPeople}</div></div>
            <div className="stat"><div className="k">車次合計</div><div className="v">{sumVehicles}</div></div>
          </div>

          <div className="panel timeline-wrap">
            <div className="timeline" style={{ minWidth: 60 + (A.lanes + T.lanes) * LANE_W + 24 }}>
              <div className="tl-head">
                <div className="tl-axis-head" />
                <div className="tl-zone-head" style={{ width: A.lanes * LANE_W }}>大會活動</div>
                <div className="tl-zone-head trips" style={{ width: T.lanes * LANE_W }}>用車</div>
              </div>
              <div className="tl-body" style={{ height }}>
                <div className="tl-axis">
                  {hours.map((m) => <div key={m} className="tl-hour" style={{ top: top(m) }}>{minToHm(m)}</div>)}
                </div>
                <div className="tl-grid">
                  {hours.map((m) => <div key={m} className="tl-line" style={{ top: top(m) }} />)}
                </div>

                <div className="tl-zone" style={{ width: A.lanes * LANE_W }}>
                  {A.placed.map(({ item: s, lane, s: st, e }) => {
                    const loc = lk.loc[s.location_id];
                    return (
                      <div key={s.id} className="tl-block act" title={`${hm(s.start_time)}${s.end_time ? `–${hm(s.end_time)}` : ''} ${s.name}${loc ? `＠${loc.name}` : ''}`}
                        style={{ top: top(st), height: Math.max((e - st) * PX_PER_MIN - 3, 26), left: lane * LANE_W + 4, width: LANE_W - 8 }}>
                        <div className="tl-time">{hm(s.start_time)}{s.end_time ? `–${hm(s.end_time)}` : ''}</div>
                        <div className="tl-title">{s.name}</div>
                        {loc && <div className="tl-sub">{loc.name}</div>}
                      </div>
                    );
                  })}
                </div>

                <div className="tl-zone trips" style={{ width: T.lanes * LANE_W }}>
                  {T.placed.map(({ item: t, lane, s: st, e }) => {
                    const est = !t.arrive_time;
                    const type = lk.type[t.vehicle_type_id];
                    return (
                      <div key={t.id} className={`tl-block trip${est ? ' est' : ''}`}
                        title={`${hm(t.depart_time)} ${lk.loc[t.origin_id]?.name} → ${lk.loc[t.destination_id]?.name}，${t.hc.total} 人${est ? `（未填抵達時間，以 ${data.tripMinutes} 分鐘顯示）` : ''}`}
                        style={{ top: top(st), height: Math.max((e - st) * PX_PER_MIN - 3, 26), left: lane * LANE_W + 4, width: LANE_W - 8 }}>
                        <div className="tl-trip-top">
                          <span className="tl-time">{hm(t.depart_time)}{t.arrive_time ? `–${hm(t.arrive_time)}` : ''}</span>
                          {t.vehicles !== null && <span className="plate sm">{t.vehicles}<small>車</small></span>}
                        </div>
                        <div className="tl-title">{lk.loc[t.origin_id]?.name} → {lk.loc[t.destination_id]?.name}</div>
                        <div className="tl-sub">{t.hc.total} 人{type ? `・${type.name}` : '・未選車型'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            虛線框的用車沒填預計抵達時間，暫以 {data.tripMinutes} 分鐘顯示；沒有結束時間的活動以 {DEFAULT_ACTIVITY_MIN} 分鐘顯示。
          </p>
        </>
      )}
    </>
  );
}
