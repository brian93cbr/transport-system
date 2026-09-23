import * as XLSX from 'xlsx';
import { TRIP_STATUS } from '@/lib/constants';
import { headcountLabel } from '@/lib/calc';
import { findOverlaps, hm, minToHm, todayStr } from '@/lib/utils';

function sheet(rows, widths) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (rows.length === 0) XLSX.utils.sheet_add_aoa(ws, [['（無資料）']]);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

const safeSheetName = (name, used) => {
  let base = name.replace(/[\\/?*[\]:]/g, '').slice(0, 28) || '工作表';
  let n = base, i = 2;
  while (used.has(n)) n = `${base.slice(0, 26)}_${i++}`;
  used.add(n);
  return n;
};

export function tripRow(t, lk, { withInternal, notes } = {}) {
  const type = lk.type[t.vehicle_type_id];
  const vendor = type && lk.vendor[type.vendor_id];
  const row = {
    日期: t.date,
    發車時間: hm(t.depart_time),
    預計抵達: hm(t.arrive_time),
    用車活動: lk.sched[t.schedule_item_id]?.name || '',
    起點: lk.loc[t.origin_id]?.name || '',
    目的地: lk.loc[t.destination_id]?.name || '',
    人數: t.hc.total,
    人數來源: headcountLabel(t) + (t.hc.extra ? `＋額外 ${t.hc.extra}` : ''),
    廠商: vendor?.name || '',
    車型: type?.name || '',
    每車可搭乘: t.cap ?? '',
    車數: t.vehicles ?? '',
    狀態: TRIP_STATUS[t.status],
    備註: t.note || '',
  };
  if (withInternal) row.內部備註 = notes?.[t.id] || '';
  return row;
}

export function exportDispatch({ trips, peaks, schedule, lk, isOwner, notes }) {
  const wb = XLSX.utils.book_new();
  const used = new Set();

  // 1. 廠商派車彙總
  const summary = peaks.map((p) => {
    const type = lk.type[p.vehicle_type_id];
    const vendor = type && lk.vendor[type.vendor_id];
    return {
      廠商: vendor?.name || '',
      日期: p.date,
      車型: type?.name || '',
      每車可搭乘: type?.capacity ?? '',
      趟數: p.tripCount,
      車次合計: p.sumVehicles,
      尖峰同時用車數: p.peak,
      尖峰時間: p.peakAt === null ? '' : minToHm(p.peakAt),
      聯絡人: vendor?.contact_name || '',
      電話: vendor?.phone || '',
    };
  });
  XLSX.utils.book_append_sheet(wb, sheet(summary, [16, 12, 16, 10, 6, 8, 14, 10, 10, 14]), safeSheetName('廠商派車彙總', used));

  // 2. 用車需求明細
  const detailWidths = [12, 8, 8, 18, 16, 16, 6, 20, 14, 16, 10, 6, 12, 24, 24];
  XLSX.utils.book_append_sheet(
    wb,
    sheet(trips.map((t) => tripRow(t, lk, { withInternal: isOwner, notes })), detailWidths),
    safeSheetName('用車需求明細', used)
  );

  // 3. 各廠商明細（不含內部備註，可直接轉給廠商）
  const byVendor = {};
  for (const t of trips) {
    const type = lk.type[t.vehicle_type_id];
    if (!type) continue;
    (byVendor[type.vendor_id] ||= []).push(t);
  }
  for (const [vid, list] of Object.entries(byVendor)) {
    const name = lk.vendor[vid]?.name || '廠商';
    XLSX.utils.book_append_sheet(wb, sheet(list.map((t) => tripRow(t, lk)), detailWidths), safeSheetName(`廠商-${name}`, used));
  }

  // 4. 大會時程表
  const overlaps = findOverlaps(schedule);
  const sched = schedule.map((s) => ({
    日期: s.date,
    開始: hm(s.start_time),
    結束: hm(s.end_time),
    活動名稱: s.name,
    地點: lk.loc[s.location_id]?.name || '',
    並行: overlaps.has(s.id) ? '是' : '',
    備註: s.note || '',
  }));
  XLSX.utils.book_append_sheet(wb, sheet(sched, [12, 8, 8, 24, 18, 6, 30]), safeSheetName('大會時程表', used));

  XLSX.writeFile(wb, `交通組_派車需求_${todayStr()}.xlsx`);
}
