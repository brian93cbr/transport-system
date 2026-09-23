import { toMin } from '@/lib/utils';

// 一趟用車佔用車輛的時間區間（分鐘）；抵達早於發車視為跨日
export function tripInterval(t, defaultMinutes) {
  const s = toMin(t.depart_time);
  if (!t.arrive_time) return { s, e: s + defaultMinutes, estimated: true };
  let e = toMin(t.arrive_time);
  if (e <= s) e += 1440;
  return { s, e, estimated: false };
}

// 依「日期 × 車型」計算尖峰同時用車數
// 時間相接（一趟抵達時間 = 另一趟發車時間）也視為重疊，採保守估計
export function peakByDateType(trips, defaultMinutes) {
  const buckets = {};
  for (const t of trips) {
    if (!t.vehicle_type_id || !t.vehicles) continue;
    const k = `${t.date}|${t.vehicle_type_id}`;
    (buckets[k] ||= []).push(t);
  }
  return Object.entries(buckets).map(([k, list]) => {
    const [date, typeId] = k.split('|');
    const events = [];
    for (const t of list) {
      const { s, e } = tripInterval(t, defaultMinutes);
      events.push([s, 0, t.vehicles], [e, 1, -t.vehicles]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, peak = 0, peakAt = null;
    for (const [time, , delta] of events) {
      cur += delta;
      if (cur > peak) { peak = cur; peakAt = time; }
    }
    return {
      date,
      vehicle_type_id: typeId,
      tripCount: list.length,
      sumVehicles: list.reduce((a, t) => a + t.vehicles, 0),
      peak,
      peakAt,
    };
  });
}

// 時間軸排版：把重疊的項目分到不同欄
export function assignLanes(items, getInterval) {
  const sorted = [...items].sort((a, b) => getInterval(a).s - getInterval(b).s);
  const laneEnds = [];
  const out = [];
  for (const it of sorted) {
    const { s, e } = getInterval(it);
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    out.push({ item: it, lane, s, e });
  }
  return { placed: out, lanes: Math.max(1, laneEnds.length) };
}
