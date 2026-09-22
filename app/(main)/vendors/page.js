'use client';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import Modal from '@/components/Modal';
import OwnerOnly from '@/components/OwnerOnly';
import { dbError, emptyToNull } from '@/lib/utils';

export default function VendorsPage() {
  return <OwnerOnly><Vendors /></OwnerOnly>;
}

function Vendors() {
  const supabase = getSupabase();
  const [vendors, setVendors] = useState(null);
  const [types, setTypes] = useState([]);
  const [editVendor, setEditVendor] = useState(null);
  const [editType, setEditType] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [v, t] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('vehicle_types').select('*').order('capacity', { ascending: false }),
    ]);
    if (v.error || t.error) setError(dbError(v.error || t.error));
    setVendors(v.data || []);
    setTypes(t.data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function removeVendor(v) {
    if (types.some((t) => t.vendor_id === v.id)) {
      return setError(`請先刪除「${v.name}」底下的所有車型，再刪除廠商。`);
    }
    if (!confirm(`確定刪除廠商「${v.name}」？`)) return;
    const { error: err } = await supabase.from('vendors').delete().eq('id', v.id);
    if (err) return setError(dbError(err));
    setError(''); load();
  }

  async function removeType(t) {
    if (!confirm(`確定刪除車型「${t.name}」？`)) return;
    const { error: err } = await supabase.from('vehicle_types').delete().eq('id', t.id);
    if (err) return setError(dbError(err));
    setError(''); load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>廠商與車型</h1>
          <p>設定好的車型可在用車需求中直接選擇，並自動帶入每車可搭乘人數。</p>
        </div>
        <button className="btn primary" onClick={() => setEditVendor({})}>新增廠商</button>
      </div>
      {error && <div className="alert error">{error}</div>}

      {vendors === null ? <div className="loading">載入中…</div> : vendors.length === 0 ? (
        <div className="panel"><div className="empty">
          還沒有任何廠商。
          <div><button className="btn primary" onClick={() => setEditVendor({})}>新增第一家廠商</button></div>
        </div></div>
      ) : vendors.map((v) => {
        const vt = types.filter((t) => t.vendor_id === v.id);
        return (
          <div className="panel vendor-block" key={v.id}>
            <div className="panel-head">
              <div>
                <h2>{v.name}</h2>
                <div className="small muted">
                  {[v.contact_name, v.phone].filter(Boolean).join('　') || '尚未填寫聯絡資訊'}
                  {v.phone && <>　<a href={`tel:${v.phone}`}>撥打</a></>}
                </div>
                {v.note && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{v.note}</div>}
              </div>
              <div className="actions">
                <button className="btn sm" onClick={() => setEditType({ vendor_id: v.id })}>新增車型</button>
                <button className="btn sm" onClick={() => setEditVendor(v)}>編輯廠商</button>
                <button className="btn sm danger" onClick={() => removeVendor(v)}>刪除</button>
              </div>
            </div>
            {vt.length === 0 ? (
              <div className="empty small">這家廠商還沒有車型，新增後才能在用車需求中選用。</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>車型</th><th>每車可搭乘人數</th><th>備註</th><th /></tr></thead>
                  <tbody>
                    {vt.map((t) => (
                      <tr key={t.id}>
                        <td><strong>{t.name}</strong></td>
                        <td className="num">{t.capacity} 人</td>
                        <td className="small">{t.note}</td>
                        <td><div className="row-actions">
                          <button className="link-btn" onClick={() => setEditType(t)}>編輯</button>
                          <button className="link-btn danger" onClick={() => removeType(t)}>刪除</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {editVendor && <VendorForm initial={editVendor} onClose={() => setEditVendor(null)} onSaved={() => { setEditVendor(null); load(); }} />}
      {editType && <TypeForm initial={editType} vendors={vendors} onClose={() => setEditType(null)} onSaved={() => { setEditType(null); load(); }} />}
    </>
  );
}

function VendorForm({ initial, onClose, onSaved }) {
  const supabase = getSupabase();
  const [f, setF] = useState({ name: '', contact_name: '', phone: '', note: '', ...initial });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    const payload = {
      name: f.name.trim(),
      contact_name: emptyToNull(f.contact_name),
      phone: emptyToNull(f.phone),
      note: emptyToNull(f.note),
    };
    const { error: err } = initial.id
      ? await supabase.from('vendors').update(payload).eq('id', initial.id)
      : await supabase.from('vendors').insert(payload);
    if (err) return setError(dbError(err));
    onSaved();
  }

  return (
    <Modal title={initial.id ? '編輯廠商' : '新增廠商'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" form="vendor-form">儲存廠商</button></>}>
      <form id="vendor-form" onSubmit={save} className="form-grid">
        {error && <div className="alert error full">{error}</div>}
        <div className="field full"><label className="required">廠商名稱</label>
          <input className="input" value={f.name} onChange={set('name')} required /></div>
        <div className="field"><label>聯絡人</label>
          <input className="input" value={f.contact_name || ''} onChange={set('contact_name')} /></div>
        <div className="field"><label>電話</label>
          <input className="input" value={f.phone || ''} onChange={set('phone')} inputMode="tel" /></div>
        <div className="field full"><label>備註</label>
          <textarea className="textarea" value={f.note || ''} onChange={set('note')} /></div>
      </form>
    </Modal>
  );
}

function TypeForm({ initial, vendors, onClose, onSaved }) {
  const supabase = getSupabase();
  const [f, setF] = useState({ name: '', capacity: '', note: '', ...initial });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    const cap = parseInt(f.capacity, 10);
    if (!cap || cap < 1) return setError('每車可搭乘人數需為正整數。');
    const payload = { vendor_id: f.vendor_id, name: f.name.trim(), capacity: cap, note: emptyToNull(f.note) };
    const { error: err } = initial.id
      ? await supabase.from('vehicle_types').update(payload).eq('id', initial.id)
      : await supabase.from('vehicle_types').insert(payload);
    if (err) return setError(dbError(err));
    onSaved();
  }

  return (
    <Modal title={initial.id ? '編輯車型' : '新增車型'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" form="type-form">儲存車型</button></>}>
      <form id="type-form" onSubmit={save} className="form-grid">
        {error && <div className="alert error full">{error}</div>}
        <div className="field full"><label className="required">廠商</label>
          <select className="select" value={f.vendor_id} onChange={set('vendor_id')} required>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></div>
        <div className="field"><label className="required">車型名稱</label>
          <input className="input" value={f.name} onChange={set('name')} required placeholder="例如：43 人座大巴" /></div>
        <div className="field"><label className="required">每車可搭乘人數</label>
          <input className="input" type="number" min="1" value={f.capacity} onChange={set('capacity')} required />
          <div className="hint">不一定等於座位數，可預留工作人員或行李空間。</div></div>
        <div className="field full"><label>備註</label>
          <textarea className="textarea" value={f.note || ''} onChange={set('note')} /></div>
      </form>
    </Modal>
  );
}
