'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SalaryLevelStat, SalaryCityStat } from '@/types/job';
import {
  DollarSign,
  TrendingUp,
  MapPin,
  Building,
  GraduationCap,
  Briefcase,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Award,
} from 'lucide-react';

export default function SalariesPage() {
  const [data, setData] = useState<{
    totalJobs: number;
    levels: SalaryLevelStat[];
    cities: SalaryCityStat[];
    topCompanies: any[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchSalaries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/salaries');
      if (!res.ok) throw new Error('Failed to load salaries data');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching salaries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-primary">
              <Sparkles size={12} style={{ marginRight: '3px' }} />
              Compensation Benchmark
            </span>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              • Dữ liệu bóc tách từ các tin tuyển dụng Supabase
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Ma Trận Mức Lương & Đãi Ngộ IT
          </h1>
          <p style={{ color: '#475569', fontSize: '0.95rem' }}>
            Phân tích phổ thu nhập theo cấp bậc kỹ năng, so sánh giữa các trung tâm công nghệ và mức lương theo doanh nghiệp.
          </p>
        </div>

        <button onClick={fetchSalaries} className="btn btn-secondary" title="Cập nhật lại dữ liệu">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Làm mới bảng lương
        </button>
      </div>

      {/* KPI Benchmark Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #ea580c' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>LƯƠNG KHỞI ĐIỂM (FRESHER)</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#c2410c', margin: '0.35rem 0' }}>8 - 15 triệu</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân 10.5 triệu VND / tháng</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #16a34a' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>KỸ SƯ TRUNG CẤP (MIDDLE)</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#166534', margin: '0.35rem 0' }}>25 - 40 triệu</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân 32.5 triệu VND / tháng</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #0284c7' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>KỸ SƯ CAO CẤP (SENIOR)</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0369a1', margin: '0.35rem 0' }}>40 - 65+ triệu</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân 52.5 triệu VND / tháng</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #9333ea' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>TECH LEAD / QUẢN LÝ</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#7e22ce', margin: '0.35rem 0' }}>65 - 120 triệu</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân 80+ triệu VND / tháng</span>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left: Salary By Level Breakdown */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                Phổ Lương Chi Tiết Theo Cấp Bậc
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#475569' }}>Ước tính khoảng lương và số lượng vị trí tuyển dụng tương ứng</p>
            </div>
            <Link href="/jobs" style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 700 }}>
              Xem danh sách &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data?.levels.map((lvl) => {
              const maxAvg = 80;
              const percent = Math.min(100, Math.round((lvl.avgVnd / maxAvg) * 100));
              return (
                <div
                  key={lvl.level}
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Award size={18} color="#ea580c" />
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{lvl.level}</h3>
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#c2410c' }}>
                      {lvl.range}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.825rem', color: '#334155' }}>{lvl.description}</p>

                  <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: '4px' }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#475569' }}>
                    <span style={{ fontWeight: 500 }}>Số tin khớp trên hệ thống: <strong style={{ color: '#0f172a' }}>{lvl.count}</strong> jobs</span>
                    <Link
                      href={`/jobs?level=${encodeURIComponent(lvl.level.split('/')[0].trim())}`}
                      style={{ color: '#c2410c', fontWeight: 700 }}
                    >
                      Lọc theo cấp bậc này &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Regional Comparison & Top Companies */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Regional Table */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={18} color="#ea580c" /> So Sánh Thu Nhập Theo Thành Phố
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data?.cities.map((c) => (
                <div
                  key={c.city}
                  style={{
                    padding: '0.85rem 1rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{c.city}</span>
                    <p style={{ fontSize: '0.75rem', color: '#475569' }}>{c.jobCount} việc làm ghi nhận</p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, color: '#c2410c', fontSize: '0.95rem' }}>{c.range}</span>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>TB: ~{c.avgVnd} tr</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Companies With Open Positions */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building size={18} color="#ea580c" /> Doanh Nghiệp Có Tuyển Dụng Mới
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {data?.topCompanies.map((comp: any) => (
                <Link
                  key={comp.company_name}
                  href={`/jobs?q=${encodeURIComponent(comp.company_name)}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    background: '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                  className="company-hover"
                >
                  <div style={{ minWidth: 0, paddingRight: '0.5rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {comp.company_name}
                    </p>
                    <span style={{ fontSize: '0.75rem', color: '#c2410c', fontWeight: 700 }}>
                      {comp.sample_salary || 'Lương thỏa thuận'}
                    </span>
                  </div>

                  <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                    {comp.job_count} tin
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
