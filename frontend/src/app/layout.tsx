import type { Metadata } from 'next';
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
              <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                <a href="/" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Tổng quan</a>
                <a href="/trends" style={{ color: 'var(--text-secondary)' }}>Xu hướng Kỹ năng</a>
                <a href="/jobs" style={{ color: 'var(--text-secondary)' }}>Danh sách tin</a>
              </nav>
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
