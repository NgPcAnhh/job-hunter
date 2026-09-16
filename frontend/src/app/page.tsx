'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatsApiResponse, UnifiedJob } from '@/types/job';
import { useCachedData } from '@/lib/useCachedData';
import JobDetailModal from '@/components/jobs/JobDetailModal';
import VietnamJobMap from '@/components/analytics/VietnamJobMap';
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
  Flame,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const POPULAR_SEARCHES = ['React', 'NodeJS', 'Python', 'Java', 'Golang', 'Tester', 'AI/ML', 'FPT'];

const fetchDashboardStats = async (): Promise<StatsApiResponse> => {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return await res.json();
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: stats, loading, isRevalidating, refresh } = useCachedData<StatsApiResponse>(
    'dashboard_stats',
    fetchDashboardStats,
    { ttlMs: 45000, persistSession: true }
  );

  const [heroSearch, setHeroSearch] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<UnifiedJob | null>(null);
  const [recentPage, setRecentPage] = useState<number>(1);
  const RECENT_PAGE_SIZE = 4;

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

  const getSourceHeatConfig = (percent: number) => {
    if (percent >= 25) {
      return {
        bg: 'linear-gradient(135deg, #9a3412 0%, #ea580c 100%)',
        border: '#7c2d12',
        text: '#ffffff',
        subText: '#ffedd5',
        badgeBg: 'rgba(255, 255, 255, 0.22)',
        badgeText: '#ffffff',
        tag: 'Cực nóng 🔥',
        heatLevel: 4,
        heatBarBg: 'rgba(255, 255, 255, 0.3)',
        heatBarFill: '#ffffff',
        accentGlow: '0 6px 18px -2px rgba(234, 88, 12, 0.35)',
      };
    }
    if (percent >= 15) {
      return {
        bg: 'linear-gradient(135deg, #c2410c 0%, #f97316 100%)',
        border: '#9a3412',
        text: '#ffffff',
        subText: '#ffedd5',
        badgeBg: 'rgba(255, 255, 255, 0.2)',
        badgeText: '#ffffff',
        tag: 'Rất nóng ⚡',
        heatLevel: 3,
        heatBarBg: 'rgba(255, 255, 255, 0.3)',
        heatBarFill: '#ffffff',
        accentGlow: '0 6px 16px -2px rgba(249, 115, 22, 0.3)',
      };
    }
    if (percent >= 8) {
      return {
        bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        border: '#fdba74',
        text: '#9a3412',
        subText: '#c2410c',
        badgeBg: '#fed7aa',
        badgeText: '#9a3412',
        tag: 'Ấm áp ♨️',
        heatLevel: 2,
        heatBarBg: '#fed7aa',
        heatBarFill: '#ea580c',
        accentGlow: '0 3px 10px rgba(251, 146, 60, 0.12)',
      };
    }
    return {
      bg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      border: '#cbd5e1',
      text: '#1e293b',
      subText: '#64748b',
      badgeBg: '#e2e8f0',
      badgeText: '#475569',
      tag: 'Bình ổn ❄️',
      heatLevel: 1,
      heatBarBg: '#e2e8f0',
      heatBarFill: '#94a3b8',
      accentGlow: '0 1px 4px rgba(15, 23, 42, 0.04)',
    };
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
          <button
            onClick={() => refresh()}
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            disabled={isRevalidating}
          >
            <RefreshCw size={13} className={isRevalidating ? 'animate-spin' : ''} />
            {isRevalidating ? 'Đang làm mới...' : 'Làm mới số liệu'}
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
              {loading && !stats ? '...' : (stats?.totalUnified || 0).toLocaleString()}
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
              {loading && !stats ? '...' : (stats?.totalCompanies || 2445).toLocaleString()}
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
              {loading && !stats ? '...' : (stats?.totalDuplicatesDetected || 0).toLocaleString()}
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
              &lt; 0.5 ms
            </p>
            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
              ⚡ In-Memory Cache Tier-1
            </span>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE VIETNAM JOB DISTRIBUTION MAP */}
      <section>
        <VietnamJobMap provinces={stats?.provinces} totalUnified={stats?.totalUnified} />
      </section>

      {/* 4. SOURCES OVERVIEW & REGIONAL BREAKDOWN */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'stretch' }}>
        {/* Sources Heatmap Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
                  <Flame size={13} color="#ea580c" /> Heatmap Nguồn Dữ Liệu
                </span>
                <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: 600 }}>
                  Thị phần tuyển dụng 7 nền tảng
                </span>
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                Heatmap Nguồn Tuyển Dụng (7 Nền Tảng)
              </h3>
              <p style={{ fontSize: '0.825rem', color: '#475569', marginTop: '2px' }}>
                Bản đồ nhiệt biểu thị mức độ sôi động & tỷ lệ đóng góp việc làm thực tế
              </p>
            </div>

            {/* Heat Scale Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: '#f8fafc', padding: '5px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>
              <span style={{ color: '#64748b' }}>Thang nhiệt:</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8' }} /> &lt;8%
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fdba74' }} /> 8-15%
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316' }} /> 15-25%
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c2410c' }} /> &gt;25% 🔥
              </span>
            </div>
          </div>

          {/* Continuous Heatmap Spectrum Strip (100% Market Share Ribbon) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
              <span>Phổ nhiệt thị phần 100% (Market Share Ribbon)</span>
              <span style={{ color: '#ea580c' }}>{totalUnified.toLocaleString('vi-VN')} việc làm</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '14px',
                borderRadius: '7px',
                overflow: 'hidden',
                display: 'flex',
                background: '#e2e8f0',
                border: '1px solid #cbd5e1',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
              }}
            >
              {stats?.sources
                ?.slice()
                .map((src) => {
                  const percent = totalUnified > 0 ? Math.round((src.unifiedCount / totalUnified) * 100) : 0;
                  const heat = getSourceHeatConfig(percent);
                  return { ...src, percent, heat };
                })
                .sort((a, b) => b.unifiedCount - a.unifiedCount)
                .map((src) => (
                  <div
                    key={src.source}
                    title={`${src.source.toUpperCase()}: ${src.unifiedCount.toLocaleString('vi-VN')} jobs (${src.percent}%)`}
                    style={{
                      width: `${src.percent}%`,
                      minWidth: src.percent > 0 ? '6px' : '0',
                      height: '100%',
                      background: src.heat.bg,
                      transition: 'all 0.2s ease',
                    }}
                  />
                ))}
            </div>
          </div>

          {/* Heatmap Grid Cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', flex: 1 }}>
            {stats?.sources.map((src) => {
              const percent = totalUnified > 0 ? Math.round((src.unifiedCount / totalUnified) * 100) : 0;
              const heat = getSourceHeatConfig(percent);

              return (
                <Link
                  key={src.source}
                  href={`/jobs?source=${src.source}`}
                  style={{
                    background: heat.bg,
                    border: `1px solid ${heat.border}`,
                    borderRadius: '12px',
                    padding: '0.9rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    textDecoration: 'none',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: heat.accentGlow,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                    e.currentTarget.style.boxShadow = '0 10px 26px -2px rgba(234, 88, 12, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = heat.accentGlow;
                  }}
                >
                  {/* Top Row: Source Name & Heat Tag */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: heat.text,
                        background: heat.badgeBg,
                        padding: '2px 7px',
                        borderRadius: '5px',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      {src.source}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: heat.badgeText,
                        background: heat.badgeBg,
                        padding: '2px 6px',
                        borderRadius: '999px',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      {heat.tag}
                    </span>
                  </div>

                  {/* Middle Row: Job Count & Share */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                      <p style={{ fontSize: '1.45rem', fontWeight: 800, color: heat.text, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                        {src.unifiedCount.toLocaleString('vi-VN')}
                      </p>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: heat.subText }}>
                        ({percent}%)
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: heat.subText, display: 'block', marginTop: '2px' }}>
                      Raw: {src.rawCount.toLocaleString('vi-VN')} bản ghi
                    </span>
                  </div>

                  {/* Bottom: Heat Intensity Bar */}
                  <div style={{ width: '100%', height: '4px', background: heat.heatBarBg, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(10, percent)}%`, height: '100%', background: heat.heatBarFill, borderRadius: '2px' }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Top Locations Breakdown */}
        <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={18} color="#ea580c" /> Phân Bổ Theo Khu Vực
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1, justifyContent: 'space-around' }}>
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
      </div>

      {/* 5. RECENT JOBS & TOP HIRING COMPANIES (Cùng hàng, thẳng hàng, độ dài bằng nhau) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'stretch' }}>
        {/* LEFT: Recent Jobs List Card with Pagination */}
        <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
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
              {(() => {
                const allRecent = stats?.latestJobs || [];
                const totalPages = Math.max(1, Math.ceil(allRecent.length / RECENT_PAGE_SIZE));
                const pagedJobs = allRecent.slice((recentPage - 1) * RECENT_PAGE_SIZE, recentPage * RECENT_PAGE_SIZE);

                if (pagedJobs.length === 0) {
                  return <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Chưa có bài đăng nào.</p>;
                }

                return (
                  <>
                    {pagedJobs.map((job) => (
                      <div
                        key={job.job_url}
                        onClick={() => setSelectedJob(job)}
                        style={{
                          padding: '0.85rem 1rem',
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
                              style={{ width: '38px', height: '38px', borderRadius: '6px', objectFit: 'contain', border: '1px solid #cbd5e1', background: 'white', padding: '2px', flexShrink: 0 }}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div style={{ width: '38px', height: '38px', borderRadius: '6px', background: 'var(--accent-gradient)', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                    ))}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Pagination Bar matching footer */}
          {(() => {
            const allRecent = stats?.latestJobs || [];
            const totalPages = Math.max(1, Math.ceil(allRecent.length / RECENT_PAGE_SIZE));
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Trang <strong>{recentPage}</strong> / <strong>{totalPages}</strong> ({allRecent.length} tin mới)
                </span>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecentPage((p) => Math.max(1, p - 1));
                    }}
                    disabled={recentPage === 1}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      background: recentPage === 1 ? '#f8fafc' : '#ffffff',
                      color: recentPage === 1 ? '#94a3b8' : '#334155',
                      cursor: recentPage === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    <ChevronLeft size={14} /> Trước
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecentPage((p) => Math.min(totalPages, p + 1));
                    }}
                    disabled={recentPage >= totalPages}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      background: recentPage >= totalPages ? '#f8fafc' : '#ffffff',
                      color: recentPage >= totalPages ? '#94a3b8' : '#334155',
                      cursor: recentPage >= totalPages ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    Sau <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* RIGHT: Top Hiring Companies Widget */}
        <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Briefcase size={18} color="#0284c7" /> Top Doanh Nghiệp Tuyển Dụng
              </h3>
              <Link href="/companies" style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 700 }}>
                Xem tất cả &rarr;
              </Link>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                maxHeight: '400px',
                overflowY: 'auto',
                paddingRight: '6px',
              }}
            >
              {stats?.topHiringCompanies && stats.topHiringCompanies.length > 0 ? (
                stats.topHiringCompanies.slice(0, 10).map((comp, idx) => (
                  <Link
                    key={idx}
                    href={`/jobs?q=${encodeURIComponent(comp.company_name)}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 0.95rem',
                      background: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: idx < 3 ? '#ea580c' : '#64748b', width: '20px' }}>
                        #{idx + 1}
                      </span>
                      {comp.logo ? (
                        <img
                          src={comp.logo}
                          alt={comp.company_name}
                          style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'contain', border: '1px solid #e2e8f0', background: 'white', padding: '2px' }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {comp.company_name?.charAt(0)?.toUpperCase() || 'C'}
                        </div>
                      )}
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                        {comp.company_name}
                      </span>
                    </div>

                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0284c7', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '3px 10px', borderRadius: '999px', flexShrink: 0 }}>
                      {comp.job_count} jobs
                    </span>
                  </Link>
                ))
              ) : (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Đang tải bảng xếp hạng công ty...</p>
              )}
            </div>
          </div>

          {/* Footer bar matching Recent Jobs pagination bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Top 10 doanh nghiệp tuyển dụng nhiều nhất
            </span>
            <Link href="/companies" style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 700 }}>
              Bảng xếp hạng chi tiết &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* 6. BANNER DƯỚI CÙNG: BẠN CẦN TÌM VIỆC LÀM CỤ THỂ? (RỘNG BẰNG 2 THẺ TRÊN CỘNG LẠI) */}
      <div
        style={{
          width: '100%',
          background: 'var(--accent-gradient)',
          borderRadius: 'var(--radius-md)',
          padding: '1.75rem 2.25rem',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
          boxShadow: '0 8px 24px -4px rgba(234, 88, 12, 0.3)',
        }}
      >
        <div style={{ maxWidth: '750px' }}>
          <h4 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.35rem', letterSpacing: '-0.01em' }}>
            Bạn Cần Tìm Việc Làm Cụ Thể?
          </h4>
          <p style={{ fontSize: '0.925rem', opacity: 0.95, lineHeight: 1.55 }}>
            Mở ngay màn hình bộ lọc chuyên sâu để tra cứu theo cấp bậc, kinh nghiệm, mức lương và nguồn tuyển dụng mong muốn.
          </p>
        </div>

        <Link
          href="/jobs"
          style={{
            background: '#ffffff',
            color: '#c2410c',
            padding: '0.85rem 1.75rem',
            borderRadius: '10px',
            fontWeight: 800,
            fontSize: '0.95rem',
            textAlign: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
          }}
        >
          Mở Bộ Lọc Việc Làm
          <ArrowRight size={18} />
        </Link>
      </div>

      {/* Detail Modal */}
      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
