'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { getSupabase } from '@/lib/supabase/client';
import { APP_NAME, APP_VERSION, APP_DATE } from '@/lib/constants';

const NAV = [
  { href: '/trips', label: '用車需求' },
  { href: '/schedule', label: '大會時程表' },
  { href: '/locations', label: '地點庫' },
  { href: '/vendors', label: '廠商與車型', ownerOnly: true },
  { href: '/roster', label: '搭車名單' },
  { href: '/settings', label: '帳號與設定', ownerOnly: true },
];

export default function Shell({ children }) {
  const pathname = usePathname();
  const { profile, isOwner } = useAuth();

  async function logout() {
    await getSupabase().auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">{APP_NAME}<small>{isOwner ? '交通組長' : '檢視者'}</small></div>
        <nav className="nav">
          {NAV.filter((n) => isOwner || !n.ownerOnly).map((n) => (
            <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? 'active' : ''}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">{profile.display_name || profile.username}</div>
          <button onClick={logout}>登出</button>
          <div className="version">{APP_VERSION}（{APP_DATE}）</div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
