import type { Metadata } from 'next';
import Link from 'next/link';
import HeaderNav from '@/components/common/HeaderNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jobs Hunter Dashboard | Thị Trường Việc Làm IT',
  description: 'Serverless Real-time IT Job Analytics & Market Insights Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <div className="layout-wrapper">
          <header className="site-header" style={{ padding: '0.85rem 0' }}>
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'var(--accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '1.2rem',
                  boxShadow: '0 4px 12px rgba(255, 107, 0, 0.25)',
                  color: 'white',
                }}>
                  🎯
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#111827' }}>Jobs Hunter</h1>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '4px' }}>SIMPLIZE</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Phân tích & Quản lý việc làm IT</p>
                </div>
              </Link>
              <HeaderNav />
            </div>
          </header>
          <main className="container" style={{ padding: '2rem 1.5rem' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
