'use client';
import { useAuth } from './AuthProvider';

export default function OwnerOnly({ children }) {
  const { isOwner } = useAuth();
  if (!isOwner) return <div className="empty">此頁面僅限交通組長使用。</div>;
  return children;
}
