import './globals.css';
import { APP_NAME } from '@/lib/constants';

export const metadata = { title: APP_NAME };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
