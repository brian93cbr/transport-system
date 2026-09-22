// 用車需求的人數與車數計算（前端即時計算，與資料庫無關）

export const ALL_GROUPS_LABEL = '全體';

export function groupCountMap(rows) {
  const m = {};
  for (const r of rows || []) m[r.group_name] = Number(r.cnt);
  return m;
}

export function tripHeadcount(trip, counts) {
  if (trip.headcount_mode === 'manual') {
    return { roster: null, extra: 0, total: Number(trip.manual_count || 0), missing: [] };
  }
  let roster = 0;
  const missing = [];
  if (trip.roster_scope === 'all') {
    roster = Object.values(counts).reduce((a, b) => a + b, 0);
  } else {
    for (const g of trip.roster_groups || []) {
      if (counts[g] === undefined) missing.push(g);
      else roster += counts[g];
    }
  }
  const extra = Number(trip.extra_count || 0);
  return { roster, extra, total: roster + extra, missing };
}

export function tripCapacity(trip, typesById) {
  if (trip.capacity_override) return Number(trip.capacity_override);
  const t = typesById[trip.vehicle_type_id];
  return t ? Number(t.capacity) : null;
}

export function vehicleCount(total, capacity) {
  if (!capacity) return null;
  return Math.ceil(Number(total || 0) / capacity);
}

export function headcountLabel(trip) {
  if (trip.headcount_mode === 'manual') return '手動輸入';
  if (trip.roster_scope === 'all') return `名單：${ALL_GROUPS_LABEL}`;
  const g = trip.roster_groups || [];
  return `名單：${g.length ? g.join('、') : '未選組別'}`;
}
