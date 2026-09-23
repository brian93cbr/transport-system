'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { DEFAULT_LEAD_MINUTES, DEFAULT_TRIP_MINUTES } from '@/lib/constants';
import { dbError } from '@/lib/utils';
import { groupCountMap, tripCapacity, tripHeadcount, vehicleCount } from '@/lib/calc';
import { loadPrivateNotes } from '@/lib/privateNotes';

// 用車需求相關頁面共用的資料載入與計算
export function useTransportData() {
  const supabase = getSupabase();
  const { isOwner } = useAuth();
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [trips, locs, sched, types, vendors, counts, settings] = await Promise.all([
      supabase.from('trips').select('*').order('date').order('depart_time'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('schedule_items').select('*').order('date').order('start_time'),
      supabase.from('vehicle_types').select('*').order('capacity', { ascending: false }),
      supabase.from('vendors').select('*').order('name'),
      supabase.rpc('roster_group_counts'),
      supabase.from('settings').select('*'),
    ]);
    const firstErr = [trips, locs, sched, types, vendors, counts, settings].find((r) => r.error);
    setError(firstErr ? dbError(firstErr.error) : '');
    const st = Object.fromEntries((settings.data || []).map((r) => [r.key, Number(r.value)]));
    setData({
      trips: trips.data || [],
      locations: locs.data || [],
      schedule: sched.data || [],
      types: types.data || [],
      vendors: vendors.data || [],
      counts: groupCountMap(counts.data),
      lead: Number.isFinite(st.trip_lead_minutes) ? st.trip_lead_minutes : DEFAULT_LEAD_MINUTES,
      tripMinutes: Number.isFinite(st.default_trip_minutes) ? st.default_trip_minutes : DEFAULT_TRIP_MINUTES,
    });
    if (isOwner) setNotes(await loadPrivateNotes(supabase, 'trips'));
  }, [supabase, isOwner]);

  useEffect(() => { reload(); }, [reload]);

  const lk = useMemo(() => {
    if (!data) return null;
    const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
    return { loc: by(data.locations), sched: by(data.schedule), type: by(data.types), vendor: by(data.vendors) };
  }, [data]);

  const computed = useMemo(() => {
    if (!data) return [];
    return data.trips.map((t) => {
      const hc = tripHeadcount(t, data.counts);
      const cap = tripCapacity(t, lk.type);
      return { ...t, hc, cap, vehicles: vehicleCount(hc.total, cap) };
    });
  }, [data, lk]);

  return { data, lk, computed, notes, error, setError, reload };
}
