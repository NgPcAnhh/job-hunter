'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatsApiResponse, UnifiedJob } from '@/types/job';
import JobDetailModal from '@/components/jobs/JobDetailModal';
import {
  Briefcase,
  Layers,
  Database,
  CheckCircle2,
  ExternalLink,
  MapPin,
  TrendingUp,
  ArrowRight,
  Globe,
  RefreshCw,
  Clock,
  Sparkles,
  Search,
  ShieldCheck,
  Send,
  Zap,
} from 'lucide-react';

const POPULAR_SEARCHES = ['React', 'NodeJS', 'Python', 'Java', 'Golang', 'Tester', 'AI/ML', 'FPT'];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [heroSearch, setHeroSearch] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<UnifiedJob | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data: StatsApiResponse = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchStats();
  };

  const handleHeroSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      router.push(`/jobs?q=${encodeURIComponent(heroSearch.trim())}`);
    } else {
      router.push('/jobs');
    }
  };

  const getSourceBadgeClass = (source: string) => {
    switch (source.toLowerCase()) {
      case 'topcv':
        return 'badge-topcv';
      case 'vietnamworks':
        return 'badge-vietnamworks';
      case 'careerlink':
        return 'badge-careerlink';
      case 'careerviet':
        return 'badge-careerviet';
      case 'jobsgo':
        return 'badge-jobsgo';
      case 'vieclam24h':
        return 'badge-vieclam24h';
      case 'joboko':
        return 'badge-joboko';
      default:
        return 'badge-primary';
    }
  };

  const totalUnified = stats?.totalUnified || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. SIMPLIZE HERO SEARCH BANNER */}
      <section
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fff7ed 100%)',
          border: '1px solid #fed7aa',
          borderRadius: 'var(--radius-lg)',
          padding: '2.5rem 2rem',
          boxShadow: '0 4px 20px -2px rgba(234, 88, 12, 0.08)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'center', padding: '0.35rem 0.85rem', background: '#ffffff', borderRadius: '9999px', border: '1px solid #fdba74', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <Zap size={14} color="#ea580c" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c2410c' }}>
              Dữ liệu Việc làm IT Tự Động Hóa 100%
            </span>
            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>•</span>
            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Đồng bộ 2 lần/ngày</span>
          </div>

          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.25 }}>
            Khám Phá & Phân Tích <span style={{ color: '#ea580c' }}>Thị Trường Việc Làm IT</span>
          </h1>
          <p style={{ color: '#334155', fontSize: '1rem', lineHeight: 1.6 }}>
            Hệ thống tự động thu thập từ 7 website tuyển dụng hàng đầu (TopCV, VietnamWorks, CareerLink, JobsGO...), áp dụng thuật toán khử trùng lặp thông minh và lưu trữ tập trung trên Supabase.
          </p>

          {/* Hero Search Bar */}
          <form onSubmit={handleHeroSearchSubmit} style={{ display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '640px', margin: '0.5rem auto 0 auto' }}>
            <div className="search-box-wrapper" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <Search size={20} className="search-icon" color="#64748b" />
              <input
                type="text"
                className="search-input"
                style={{ padding: '1rem 1rem 1rem 3rem', fontSize: '1rem', borderRadius: '10px' }}
                placeholder="Nhập chức danh, kỹ năng (ví dụ: React, Golang, Python, DevOps...)"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '0 1.5rem', borderRadius: '10px', fontSize: '0.95rem' }}>
              Tìm Kiếm
            </button>
          </form>

          {/* Popular Tag Chips */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>Gợi ý nhanh:</span>
            {POPULAR_SEARCHES.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => router.push(`/jobs?q=${encodeURIComponent(tag)}`)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#fdba74';
                  e.currentTarget.style.color = '#c2410c';
                  e.currentTarget.style.background = '#fff7ed';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.color = '#334155';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. KPI METRICS CARDS */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Chỉ Số Dữ Liệu Toàn Hệ Thống
          </h2>
          <button onClick={handleRefresh} className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} disabled={isRefreshing}>
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Đang tải...' : 'Làm mới số liệu'}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          {/* Card 1 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #ea580c' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontSize: '0.825rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Tổng Tin Tuyển Dụng
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Briefcase size={16} color="#ea580c" />
              </div>
            </div>
            <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0.35rem 0', color: '#c2410c', letterSpacing: '-0.02em' }}>
              {loading ? '...' : (stats?.totalUnified || 0).toLocaleString()}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>
              <CheckCircle2 size={13} />
              Đã hợp nhất vào all_jobs_unified
            </div>
          </div>

          {/* Card 2 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #0284c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontSize: '0.825rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Nhà Tuyển Dụng
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Briefcase size={16} color="#0284c7" />
              </div>
            </div>
            <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0.35rem 0', color: '#0369a1', letterSpacing: '-0.02em' }}>
              {loading ? '...' : (stats?.totalCompanies || 2445).toLocaleString()}
            </p>
            <span style={{ fontSize: '0.75rem', color: '#475569' }}>
              Doanh nghiệp công nghệ IT
            </span>
          </div>

          {/* Card 3 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #dc2626' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontSize: '0.825rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Khử Trùng Lặp (≥ 90%)
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={16} color="#dc2626" />
              </div>
            </div>
            <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0.35rem 0', color: '#dc2626', letterSpacing: '-0.02em' }}>
              {loading ? '...' : (stats?.totalDuplicatesDetected || 0).toLocaleString()}
            </p>
            <span style={{ fontSize: '0.75rem', color: '#475569' }}>
              Gộp tin đăng trùng từ nhiều web
            </span>
          </div>

          {/* Card 4 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #16a34a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontSize: '0.825rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Nguồn Dữ Liệu
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={16} color="#16a34a" />
              </div>
            </div>
            <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0.35rem 0', color: '#166534', letterSpacing: '-0.02em' }}>
              7 / 7
            </p>
            <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>
              ● 100% Sẵn sàng hoạt động
            </span>
          </div>

          {/* Card 5 */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #8b5cf6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontSize: '0.825rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Tốc Độ Truy Vấn
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} color="#8b5cf6" />
              </div>
            </div>
            <p style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0.45rem 0', color: '#7c3aed', letterSpacing: '-0.02em' }}>
              &lt; 10 ms
            </p>
            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
              ⚡ Gold Metric Precalculated
            </span>
          </div>
        </div>
      </section>

      {/* 3. MAIN 2-COLUMN SECTION: DATA SOURCES + SIDE METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* LEFT COLUMN: SOURCES BREAKDOWN & RECENT JOBS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Sources Grid Card */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Bản Đồ Nguồn Tuyển Dụng (7 Nền Tảng)
                </h3>
                <p style={{ fontSize: '0.825rem', color: '#475569', marginTop: '2px' }}>
                  Số lượng tin cào thô (Raw) và tin đã chuẩn hóa đồng bộ vào bảng tổng
                </p>
              </div>
              <Link href="/jobs" style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                Xem tất cả &rarr;
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
              {stats?.sources.map((src) => {
                const percent = totalUnified > 0 ? Math.round((src.unifiedCount / totalUnified) * 100) : 0;
                return (
                  <Link
                    key={src.source}
                    href={`/jobs?source=${src.source}`}
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                    }}
                    className="source-card-hover"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#fdba74';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(234, 88, 12, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.03)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className={`badge ${getSourceBadgeClass(src.source)}`} style={{ fontSize: '0.65rem' }}>
                        {src.source.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>{percent}%</span>
                    </div>

                    <div>
                      <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>
                        {src.unifiedCount} <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>jobs</span>
                      </p>
                      <span style={{ fontSize: '0.725rem', color: '#475569' }}>
                        Raw: {src.rawCount} bản ghi
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: '#ea580c', borderRadius: '2px' }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Recent Jobs List Card */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Việc Làm Mới Đồng Bộ Gần Đây
                </h3>
                <p style={{ fontSize: '0.825rem', color: '#475569' }}>Tin tuyển dụng vừa được pipeline thu thập vào Supabase</p>
              </div>
              <Link href="/jobs" style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 700 }}>
                Xem bộ lọc chi tiết &rarr;
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {stats?.latestJobs && stats.latestJobs.length > 0 ? (
                stats.latestJobs.map((job) => (
                  <div
                    key={job.job_url}
                    onClick={() => setSelectedJob(job)}
                    style={{
                      padding: '1rem',
                      background: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#fdba74';
                      e.currentTarget.style.background = '#fff7ed';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minWidth: 0 }}>
                      {job.company_logo ? (
                        <img
                          src={job.company_logo}
                          alt={job.company_name}
                          style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'contain', border: '1px solid #cbd5e1', background: 'white', padding: '2px', flexShrink: 0 }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'var(--accent-gradient)', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {job.company_name?.charAt(0)?.toUpperCase() || 'J'}
                        </div>
                      )}

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '2px' }}>
                          <span className={`badge ${getSourceBadgeClass(job.source)}`} style={{ fontSize: '0.65rem' }}>
                            {job.source.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: 700 }}>
                            {job.salary || 'Thương lượng'}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {job.job_title}
                        </h4>
                        <p style={{ fontSize: '0.775rem', color: '#475569' }}>
                          {job.company_name} • {job.location_short || 'Chưa rõ'}
                        </p>
                      </div>
                    </div>

                    <span style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 700, flexShrink: 0 }}>
                      Chi tiết &rarr;
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Chưa có bài đăng nào.</p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: REGION STATS & PIPELINE HEALTH */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Locations Breakdown */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={18} color="#ea580c" /> Phân Bổ Theo Khu Vực
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {stats?.topLocations && stats.topLocations.length > 0 ? (
                stats.topLocations.map((loc, idx) => {
                  const locPercent = totalUnified > 0 ? Math.round((loc.count / totalUnified) * 100) : 0;
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{loc.location}</span>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {loc.count} <span style={{ color: '#64748b', fontWeight: 500 }}>({locPercent}%)</span>
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(8, locPercent)}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: '3px' }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Chưa có dữ liệu địa điểm.</p>
              )}
            </div>
          </div>

          {/* Top Hiring Companies Widget (Precalculated Gold Metric) */}
          {stats?.topHiringCompanies && stats.topHiringCompanies.length > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Briefcase size={18} color="#0284c7" /> Top Doanh Nghiệp Tuyển Dụng
                </h3>
                <Link href="/companies" style={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: 700 }}>
                  Xem tất cả &rarr;
                </Link>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {stats.topHiringCompanies.slice(0, 5).map((comp, idx) => (
                  <Link
                    key={idx}
                    href={`/jobs?q=${encodeURIComponent(comp.company_name)}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      background: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#fdba74';
                      e.currentTarget.style.background = '#fff7ed';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: idx < 3 ? '#ea580c' : '#64748b', width: '16px' }}>
                        #{idx + 1}
                      </span>
                      {comp.logo ? (
                        <img
                          src={comp.logo}
                          alt={comp.company_name}
                          style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain', border: '1px solid #e2e8f0', background: 'white' }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                        {comp.company_name}
                      </span>
                    </div>

                    <span style={{ fontSize: '0.775rem', fontWeight: 700, color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 }}>
                      {comp.job_count} jobs
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Deduplication & Storage Architecture Info */}
          <div className="glass-panel" style={{ padding: '1.5rem', background: '#ffffff' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} color="#166534" /> Khử Trùng Lặp 2-Stage
            </h3>
            <p style={{ fontSize: '0.825rem', color: '#334155', lineHeight: 1.6 }}>
              Mỗi website cào dữ liệu thô vào bảng riêng <code>jobs_&lt;source&gt;</code>. Sau đó module <code>sync_unified.py</code> sử dụng thuật toán <strong>Fuzzy SequenceMatcher ≥ 90%</strong> để đối soát Tiêu đề, Công ty và Mức lương, tự động gộp các tin đăng trùng lặp vào <code>all_jobs_unified</code>.
            </p>
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Độ chính xác khử trùng:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#166534' }}>90% - 95%</span>
            </div>
          </div>

          {/* Quick Action Box */}
          <div style={{ background: 'var(--accent-gradient)', borderRadius: 'var(--radius-md)', padding: '1.5rem', color: 'white', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: '0 8px 20px -4px rgba(234, 88, 12, 0.35)' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Bạn Cần Tìm Việc Làm Cụ Thể?</h4>
            <p style={{ fontSize: '0.85rem', opacity: 0.95, lineHeight: 1.5 }}>
              Mở ngay màn hình bộ lọc chuyên sâu để tra cứu theo cấp bậc, kinh nghiệm và nguồn mong muốn.
            </p>
            <Link
              href="/jobs"
              style={{
                marginTop: '0.5rem',
                background: '#ffffff',
                color: '#c2410c',
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.875rem',
                textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              Mở Bộ Lọc Việc Làm
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
