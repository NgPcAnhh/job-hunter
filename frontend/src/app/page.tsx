'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Banner & Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-primary">
              <Sparkles size={13} style={{ marginRight: '3px' }} />
              Dữ liệu Real-Time
            </span>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              • Bảng tổng hợp: <code style={{ color: '#ea580c', fontWeight: 600 }}>all_jobs_unified</code>
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#111827' }}>
            Tổng Quan Thị Trường Việc Làm IT
          </h1>
          <p style={{ color: '#4b5563', fontSize: '0.95rem' }}>
            Nền tảng phân tích và quản lý tin tuyển dụng từ 7 website hàng đầu Việt Nam.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/jobs" className="btn btn-primary">
            <Briefcase size={16} />
            Tìm kiếm & Lọc Job chi tiết
          </Link>
          <button
            onClick={handleRefresh}
            className="btn btn-secondary"
            disabled={isRefreshing}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Đang tải...' : 'Làm mới dữ liệu'}
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Card 1: Tổng số tin */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>
              Tổng tin đã đồng bộ
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={20} color="#ff6b00" />
            </div>
          </div>
          <p style={{ fontSize: '2.35rem', fontWeight: 800, margin: '0.5rem 0', color: '#ff6b00' }}>
            {loading ? '...' : stats?.totalUnified || 0}
          </p>
          <span className="badge badge-primary">all_jobs_unified</span>
        </div>

        {/* Card 2: Tin trùng lặp đã khử */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>
              Khử trùng lặp (Fuzzy ≥ 90%)
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={20} color="#ef4444" />
            </div>
          </div>
          <p style={{ fontSize: '2.35rem', fontWeight: 800, margin: '0.5rem 0', color: '#dc2626' }}>
            {loading ? '...' : stats?.totalDuplicatesDetected || 0}
          </p>
          <span className="badge badge-multi">Đã gộp đa nguồn</span>
        </div>

        {/* Card 3: Số nguồn kết nối */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>
              Nguồn tuyển dụng tích hợp
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={20} color="#16a34a" />
            </div>
          </div>
          <p style={{ fontSize: '2.35rem', fontWeight: 800, margin: '0.5rem 0', color: '#16a34a' }}>
            7 / 7
          </p>
          <span className="badge" style={{ color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }}>
            100% Hoạt động
          </span>
        </div>

        {/* Card 4: Trạng thái Database */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>
              Cơ sở dữ liệu Supabase
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={20} color="#0284c7" />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: '0.5rem 0', color: '#0284c7' }}>
            Connected
          </p>
          <span className="badge" style={{ color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}>
            PostgreSQL Pooler IPv4
          </span>
        </div>
      </div>

      {/* Sources Breakdown Grid */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
              Phân Bổ Dữ Liệu Theo Từng Website Tuyển Dụng
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Số bản ghi cào thô (Raw) vào từng bảng riêng <code>jobs_&lt;source&gt;</code> và số tin đã chuẩn hóa vào <code>all_jobs_unified</code>
            </p>
          </div>
          <Link href="/jobs" style={{ fontSize: '0.85rem', color: '#ff6b00', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            Xem chi tiết &rarr;
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
          }}
        >
          {stats?.sources.map((src) => (
            <Link
              key={src.source}
              href={`/jobs?source=${src.source}`}
              style={{
                background: '#ffffff',
                padding: '1.15rem 1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #e5e7eb',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#fdba74';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 107, 0, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
              }}
            >
              <span className={`badge ${getSourceBadgeClass(src.source)}`} style={{ alignSelf: 'flex-start', marginBottom: '0.65rem' }}>
                {src.source.toUpperCase()}
              </span>
              <div>
                <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827' }}>
                  {src.unifiedCount} <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>jobs</span>
                </p>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Raw: {src.rawCount} bản ghi
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Top Locations & Recent Jobs 2-Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Top Locations */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827' }}>
            <MapPin size={18} color="#ff6b00" /> Khu vực tuyển dụng nhiều nhất
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stats?.topLocations && stats.topLocations.length > 0 ? (
              stats.topLocations.map((loc, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 0.95rem',
                    background: '#f8fafc',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 600 }}>
                    {loc.location}
                  </span>
                  <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>
                    {loc.count} việc làm
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Chưa có dữ liệu địa điểm.</p>
            )}
          </div>
        </div>

        {/* Right Column: Recent Jobs */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827' }}>
              <Clock size={18} color="#ff6b00" /> Việc làm mới đồng bộ gần đây
            </h3>
            <Link href="/jobs" style={{ fontSize: '0.85rem', color: '#ff6b00', fontWeight: 700 }}>
              Xem tất cả &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stats?.latestJobs && stats.latestJobs.length > 0 ? (
              stats.latestJobs.slice(0, 4).map((job) => (
                <div
                  key={job.job_url}
                  onClick={() => setSelectedJob(job)}
                  style={{
                    padding: '0.85rem 1rem',
                    background: '#ffffff',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid #e5e7eb',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#fdba74';
                    e.currentTarget.style.background = '#fff7ed';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className={`badge ${getSourceBadgeClass(job.source)}`} style={{ fontSize: '0.7rem' }}>
                      {job.source.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: 700 }}>
                      {job.salary || 'Thương lượng'}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '0.925rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {job.job_title}
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    {job.company_name} • {job.location_short || 'Chưa rõ'}
                  </p>
                </div>
              ))
            ) : (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Chưa có bài đăng nào.</p>
            )}
          </div>
        </div>
      </div>

      {/* CTA Box to Search Page */}
      <div
        style={{
          background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
          border: '1px solid #fed7aa',
          borderRadius: 'var(--radius-md)',
          padding: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9a3412', marginBottom: '0.35rem' }}>
            Khám phá Màn hình Tìm kiếm & Lọc Việc Làm Chuyên Sâu
          </h3>
          <p style={{ color: '#7c2d12', fontSize: '0.9rem', maxWidth: '600px' }}>
            Tra cứu theo kỹ năng IT, cấp bậc vị trí, mức lương, kinh nghiệm và nguồn tuyển dụng. Xem toàn văn mô tả công việc và ứng tuyển trực tiếp.
          </p>
        </div>
        <Link href="/jobs" className="btn btn-primary" style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
          Đến Màn Hình Chi Tiết Việc Làm
          <ArrowRight size={18} />
        </Link>
      </div>

      {/* Modal View */}
      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
