'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, profile: null });

  useEffect(() => {
    const supabase = getSupabase();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        window.location.href = '/login';
        return;
      }
      setState({ loading: false, profile });
    })();
  }, []);

  if (state.loading) return <div className="loading">載入中…</div>;
  const value = { profile: state.profile, isOwner: state.profile.role === 'owner' };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
