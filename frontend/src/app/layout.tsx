import type { Metadata } from 'next';
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
          <header style={{ borderBottom: '1px solid var(--border-subtle)', padding: '1rem 0' }}>
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '1.2rem'
                }}>
                  🎯
                </div>
                <div>
                  <h1 style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Jobs Hunter</h1>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Serverless Market Analytics</p>
                </div>
              </div>
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
