const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export const hm = (t) => (t ? String(t).slice(0, 5) : '');

export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  const w = new Date(y, m - 1, day).getDay();
  return `${m}/${day}（${WEEK[w]}）`;
}
export function fmtDateFull(d) {
  if (!d) return '';
  return `${d.slice(0, 4)} 年 ${fmtDate(d)}`;
}

export const toMin = (t) => {
  const [h, m] = hm(t).split(':').map(Number);
  return h * 60 + m;
};

// 由活動開始時間往前推 N 分鐘；跨日時日期往前一天
export function minusMinutes(date, time, minutes) {
  let total = toMin(time) - Number(minutes || 0);
  let d = date;
  if (total < 0) {
    total += 1440;
    const [y, m, day] = date.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, day - 1));
    d = prev.toISOString().slice(0, 10);
  }
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return { date: d, time: `${h}:${mm}` };
}

// 同一天內時間重疊的活動（無結束時間者視為瞬間）
export function findOverlaps(items) {
  const ids = new Set();
  const byDate = groupBy(items, (i) => i.date);
  for (const list of Object.values(byDate)) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a], B = list[b];
        const as = toMin(A.start_time), ae = A.end_time ? toMin(A.end_time) : as;
        const bs = toMin(B.start_time), be = B.end_time ? toMin(B.end_time) : bs;
        if (as < be && bs < ae || as === bs) { ids.add(A.id); ids.add(B.id); }
      }
    }
  }
  return ids;
}

export function groupBy(list, keyFn) {
  const out = {};
  for (const it of list) {
    const k = keyFn(it);
    (out[k] ||= []).push(it);
  }
  return out;
}

export function mapsUrl(loc) {
  if (!loc) return null;
  if (loc.map_url) return loc.map_url;
  const q = loc.address || loc.name;
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function dbError(err) {
  if (!err) return '';
  if (err.code === '23503') return '這筆資料正被其他項目使用，請先修改或刪除相關項目。';
  if (err.code === '23505') return '資料重複：已有相同名稱或編號的項目。';
  if (err.code === '42501') return '沒有權限執行此操作。';
  return err.message || '發生錯誤，請稍後再試。';
}

export const toIntOrNull = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));
export const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const minToHm = (m) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
