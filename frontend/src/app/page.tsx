'use client';

import { useState } from 'react';

export default function DashboardPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulating SWR mutate / Supabase fetch
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Banner & Refresh Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Thị trường Việc làm IT</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Dữ liệu được đồng bộ tự động từ GitHub Actions & Supabase
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="btn btn-secondary"
          disabled={isRefreshing}
        >
          {isRefreshing ? '⏳ Đang làm mới...' : '🔄 Làm mới dữ liệu'}
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.25rem'
      }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tổng số tin tuyển dụng</span>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: '0.5rem 0', color: '#a5b4fc' }}>1,248</p>
          <span className="badge badge-primary">+85 tin mới hôm nay</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Lương trung bình (Senior)</span>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--success)' }}>42.5 tr</p>
          <span className="badge">VND / tháng</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Kỹ năng phổ biến nhất</span>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--warning)' }}>React / TS</p>
          <span className="badge">Chiếm 38% tổng số tin</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Trạng thái kết nối</span>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--info)' }}>Connected</p>
          <span className="badge">Supabase Ready</span>
        </div>
      </div>

      {/* Architecture Status Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Cấu trúc luồng dữ liệu (Next.js App Router)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ color: '#818cf8', marginBottom: '0.25rem' }}>1. Client-Side Fetching (SWR)</h4>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Fetch trực tiếp từ Supabase REST API qua <code>@/src/lib/supabase/client.ts</code>.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ color: '#34d399', marginBottom: '0.25rem' }}>2. On-demand Revalidation</h4>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Nút &quot;Làm mới dữ liệu&quot; kích hoạt <code>mutate()</code> cập nhật cache tức thì.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ color: '#f472b6', marginBottom: '0.25rem' }}>3. Zero-Server Hosting</h4>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Sẵn sàng build tĩnh (SSG/Client) và deploy trực tiếp lên Vercel Edge Network.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
