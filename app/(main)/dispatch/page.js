'use client';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { TRIP_STATUS } from '@/lib/constants';
import { fmtDateFull, hm, minToHm } from '@/lib/utils';
import { peakByDateType } from '@/lib/peak';
import { exportDispatch } from '@/lib/exportXlsx';
import { useTransportData } from '@/lib/useTransportData';

export default function DispatchPage() {
  const { isOwner } = useAuth();
  const { data, lk, computed, notes, error } = useTransportData();
  const [dateFilter, setDateFilter] = useState('');

  const trips = useMemo(() => computed.filter((t) => !dateFilter || t.date === dateFilter), [computed, dateFilter]);
  const peaks = useMemo(() => {
    if (!data) return [];
    const rows = peakByDateType(trips, data.tripMinutes);
    const vName = (p) => lk.vendor[lk.type[p.vehicle_type_id]?.vendor_id]?.name || '';
    return rows.sort((a, b) => vName(a).localeCompare(vName(b), 'zh-Hant') || a.date.localeCompare(b.date)
      || (lk.type[b.vehicle_type_id]?.capacity || 0) - (lk.type[a.vehicle_type_id]?.capacity || 0));
  }, [trips, data, lk]);

  if (!data) return <div className="loading">載入中…</div>;

  const dates = [...new Set(computed.map((t) => t.date))];
  const noType = trips.filter((t) => !t.vehicle_type_id);
  const noArrive = trips.filter((t) => t.vehicle_type_id && !t.arrive_time);
  const unconfirmed = trips.filter((t) => t.vehicle_type_id && t.status !== 'confirmed');

  const byVendor = {};
  for (const p of peaks) {
    const vid = lk.type[p.vehicle_type_id]?.vendor_id;
    (byVendor[vid] ||= []).push(p);
  }

  function doExport() {
    exportDispatch({
      trips,
      peaks,
      schedule: data.schedule.filter((s) => !dateFilter || s.date === dateFilter),
      lk, isOwner, notes,
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>派車需求</h1>
          <p>依廠商、日期和車型彙總，尖峰同時用車數就是當天至少要向廠商訂的車數。</p>
        </div>
        <div className="actions">
          {dates.length > 1 && (
            <select className="select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="">全部日期</option>
              {dates.map((d) => <option key={d} value={d}>{fmtDateFull(d)}</option>)}
            </select>
          )}
          <button className="btn primary" onClick={doExport} disabled={trips.length === 0}>匯出 Excel</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {(noType.length > 0 || noArrive.length > 0 || unconfirmed.length > 0) && (
        <div className="panel">
          <div className="panel-body check-list">
            {noType.length > 0 && <div><span className="tag danger">{noType.length} 趟</span> 尚未選車型，不列入以下統計。</div>}
            {noArrive.length > 0 && <div><span className="tag warn">{noArrive.length} 趟</span> 沒填預計抵達時間，尖峰計算暫以行車 {data.tripMinutes} 分鐘估算。</div>}
            {unconfirmed.length > 0 && <div><span className="tag warn">{unconfirmed.length} 趟</span> 尚未向廠商確認。</div>}
          </div>
        </div>
      )}

      {peaks.length === 0 ? (
        <div className="panel"><div className="empty">還沒有已選車型的用車需求，這裡會在你選好車型後出現統計。</div></div>
      ) : Object.entries(byVendor).map(([vid, rows]) => {
        const vendor = lk.vendor[vid];
        const vTrips = trips.filter((t) => lk.type[t.vehicle_type_id]?.vendor_id === vid);
        return (
          <div className="panel vendor-block" key={vid}>
            <div className="panel-head">
              <div>
                <h2>{vendor?.name}</h2>
                <div className="small muted">
                  {[vendor?.contact_name, vendor?.phone].filter(Boolean).join('　')}
                  {vendor?.phone && <>　<a href={`tel:${vendor.phone}`}>撥打</a></>}
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>日期</th><th>車型</th><th>趟數</th><th>車次合計</th><th>尖峰同時用車數</th><th>尖峰時間</th></tr></thead>
                <tbody>
                  {rows.map((p) => {
                    const type = lk.type[p.vehicle_type_id];
                    return (
                      <tr key={p.date + p.vehicle_type_id}>
                        <td className="nowrap">{fmtDateFull(p.date)}</td>
                        <td className="nowrap">{type?.name}<span className="muted small">（每車 {type?.capacity} 人）</span></td>
                        <td className="num">{p.tripCount}</td>
                        <td className="num">{p.sumVehicles}</td>
                        <td><span className="plate">{p.peak}<small>車</small></span></td>
                        <td className="num">{p.peakAt === null ? '' : minToHm(p.peakAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details className="panel-body detail-toggle">
              <summary>查看 {vTrips.length} 趟用車明細</summary>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="data">
                  <thead><tr><th>日期</th><th>時間</th><th>路線</th><th>用車活動</th><th>車型</th><th>人數</th><th>車數</th><th>狀態</th></tr></thead>
                  <tbody>
                    {vTrips.map((t) => (
                      <tr key={t.id}>
                        <td className="nowrap">{t.date.slice(5).replace('-', '/')}</td>
                        <td className="nowrap num">{hm(t.depart_time)}{t.arrive_time ? `–${hm(t.arrive_time)}` : ''}</td>
                        <td className="nowrap">{lk.loc[t.origin_id]?.name} → {lk.loc[t.destination_id]?.name}</td>
                        <td>{lk.sched[t.schedule_item_id]?.name}</td>
                        <td className="nowrap">{lk.type[t.vehicle_type_id]?.name}</td>
                        <td className="num">{t.hc.total}</td>
                        <td className="num"><strong>{t.vehicles}</strong></td>
                        <td><span className={`tag ${t.status === 'confirmed' ? 'ok' : 'warn'}`}>{TRIP_STATUS[t.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        );
      })}

      {peaks.length > 0 && (
        <p className="muted small" style={{ marginTop: 16 }}>
          尖峰同時用車數：同一天、同一車型中，時間重疊的用車車數加總的最大值；前一趟抵達與下一趟發車時間相同也視為重疊。
          這個數字沒有計入車輛空車移動到下一個起點的時間，實際需要的車可能更多。
        </p>
      )}
    </>
  );
}
