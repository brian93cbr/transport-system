import AuthProvider from '@/components/AuthProvider';
import Shell from '@/components/Shell';

export default function MainLayout({ children }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
