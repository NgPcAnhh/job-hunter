'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { TechTrendItem } from '@/types/job';
import {
  TrendingUp,
  Search,
  Code2,
  DollarSign,
  Briefcase,
  Flame,
  Layers,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function TrendsPage() {
  const [trends, setTrends] = useState<TechTrendItem[]>([]);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/trends');
      if (!res.ok) throw new Error('Failed to load trends');
      const data = await res.json();
      setTrends(data.trends || []);
      setTotalJobs(data.totalJobs || 0);
    } catch (err) {
      console.error('Error fetching trends:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  const categories = ['all', 'Language', 'Framework', 'Database/Cloud', 'Tool'];

  const filteredTrends = trends.filter((item) => {
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchSearch = item.name.toLowerCase().includes(searchFilter.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-primary">
              <Sparkles size={12} style={{ marginRight: '3px' }} />
              Tech Radar Analytics
            </span>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              • Tổng hợp trên {totalJobs} việc làm Supabase
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Xu Hướng Kỹ Năng & Công Nghệ IT
          </h1>
          <p style={{ color: '#475569', fontSize: '0.95rem' }}>
            Thống kê tỷ trọng nhu cầu tuyển dụng thực tế, ước tính mức lương tham chiếu và độ hot của các công nghệ phần mềm tại Việt Nam.
          </p>
        </div>

        <button onClick={fetchTrends} className="btn btn-secondary" title="Cập nhật lại dữ liệu">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Cập nhật xu hướng
        </button>
      </div>

      {/* Highlights Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #ff6b00' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>CÔNG NGHỆ HOT NHẤT</span>
          <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0' }}>React & Next.js</p>
          <span className="badge" style={{ background: '#fff7ed', color: '#ea580c', borderColor: '#fed7aa', fontSize: '0.75rem' }}>
            🔥 Nhu cầu tuyển dụng hàng đầu
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>MỨC LƯƠNG TRUNG BÌNH CAO</span>
          <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#16a34a', margin: '0.25rem 0' }}>Golang & Cloud</p>
          <span className="badge" style={{ background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0', fontSize: '0.75rem' }}>
            💰 Trung bình 35 - 70 triệu
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #0284c7' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>TĂNG TRƯỞNG NHANH NHẤT</span>
          <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0284c7', margin: '0.25rem 0' }}>Python AI & DevOps</p>
          <span className="badge" style={{ background: '#f0f9ff', color: '#0284c7', borderColor: '#bae6fd', fontSize: '0.75rem' }}>
            ↗️ Tăng trưởng mạnh mẽ
          </span>
        </div>
      </div>

      {/* Toolbar & Category Filters */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: '8px',
                border: selectedCategory === cat ? '1px solid #ff6b00' : '1px solid #e2e8f0',
                background: selectedCategory === cat ? '#ff6b00' : '#ffffff',
                color: selectedCategory === cat ? '#ffffff' : '#475569',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {cat === 'all' ? 'Tất cả lĩnh vực' : cat}
            </button>
          ))}
        </div>

        {/* Filter Input */}
        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            className="search-input"
            style={{ padding: '0.45rem 0.75rem 0.45rem 2.2rem', fontSize: '0.85rem' }}
            placeholder="Lọc nhanh công nghệ..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Tech Trends Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-panel" style={{ height: '180px', opacity: 0.6 }} />
          ))
        ) : filteredTrends.length === 0 ? (
          <p style={{ color: '#64748b', gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 0' }}>
            Không tìm thấy công nghệ nào phù hợp.
          </p>
        ) : (
          filteredTrends.map((tech, idx) => (
            <div
              key={tech.name}
              className="glass-panel"
              style={{
                padding: '1.35rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
                borderTop: idx < 3 ? '3px solid #ff6b00' : '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge" style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    {tech.category}
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: tech.badge.includes('Hot') ? '#fff7ed' : tech.badge.includes('Tăng') ? '#f0fdf4' : '#f0f9ff',
                      color: tech.badge.includes('Hot') ? '#ea580c' : tech.badge.includes('Tăng') ? '#16a34a' : '#0284c7',
                      borderColor: tech.badge.includes('Hot') ? '#fed7aa' : tech.badge.includes('Tăng') ? '#bbf7d0' : '#bae6fd',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                    }}
                  >
                    {tech.badge}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  {tech.name}
                </h3>
              </div>

              {/* Share and progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748b' }}>Tỷ trọng nhu cầu:</span>
                  <span style={{ fontWeight: 800, color: '#ff6b00' }}>
                    {tech.count} jobs ({tech.sharePercent}%)
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(10, tech.sharePercent)}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: '3px' }} />
                </div>
              </div>

              {/* Salary & Action Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ fontSize: '0.725rem', color: '#94a3b8', display: 'block' }}>Mức lương tham chiếu</span>
                  <span style={{ fontSize: '0.925rem', fontWeight: 800, color: '#ea580c' }}>{tech.avgSalaryEstimate}</span>
                </div>

                <Link
                  href={`/jobs?q=${encodeURIComponent(tech.name.split('/')[0].trim())}`}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', borderColor: '#fed7aa', color: '#ea580c', background: '#fff7ed' }}
                >
                  Xem tin
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
