// 內部備註：僅擁有者可讀寫（RLS 保護）
export async function loadPrivateNotes(supabase, table) {
  const { data } = await supabase.from('private_notes').select('ref_id, note').eq('ref_table', table);
  const m = {};
  for (const r of data || []) m[r.ref_id] = r.note;
  return m;
}

export async function savePrivateNote(supabase, table, id, note) {
  const text = (note || '').trim();
  if (!text) {
    return supabase.from('private_notes').delete().eq('ref_table', table).eq('ref_id', id);
  }
  return supabase.from('private_notes').upsert({ ref_table: table, ref_id: id, note: text });
}
