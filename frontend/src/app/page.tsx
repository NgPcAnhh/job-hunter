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
      {/* Top Banner & Refresh Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-primary">Supabase Real-Time</span>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              • Bảng dữ liệu tổng: <code>all_jobs_unified</code>
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Trung Tâm Dữ Liệu Việc Làm IT
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Dữ liệu tổng hợp từ 7 nền tảng tuyển dụng hàng đầu Việt Nam, tự động khử trùng lặp và làm sạch.
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
            {isRefreshing ? 'Đang tải...' : 'Làm mới'}
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
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              Tổng số tin đã đồng bộ
            </span>
            <Briefcase size={20} color="#818cf8" />
          </div>
          <p style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0.5rem 0', color: '#a5b4fc' }}>
            {loading ? '...' : stats?.totalUnified || 0}
          </p>
          <span className="badge badge-primary">Bảng all_jobs_unified</span>
        </div>

        {/* Card 2: Tin trùng lặp đã khử */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              Khử trùng lặp (Fuzzy ≥ 90%)
            </span>
            <Layers size={20} color="#f472b6" />
          </div>
          <p style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0.5rem 0', color: '#f472b6' }}>
            {loading ? '...' : stats?.totalDuplicatesDetected || 0}
          </p>
          <span className="badge badge-multi">Đã gộp đa nguồn</span>
        </div>

        {/* Card 3: Số nguồn kết nối */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              Nguồn tuyển dụng tích hợp
            </span>
            <Globe size={20} color="var(--success)" />
          </div>
          <p style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--success)' }}>
            7 / 7
          </p>
          <span className="badge" style={{ color: 'var(--success)', borderColor: 'rgba(16,185,129,0.3)' }}>
            100% Sẵn sàng
          </span>
        </div>

        {/* Card 4: Trạng thái Database */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              Trạng thái Supabase
            </span>
            <Database size={20} color="var(--info)" />
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--info)' }}>
            Connected
          </p>
          <span className="badge" style={{ color: 'var(--info)', borderColor: 'rgba(6,182,212,0.3)' }}>
            PostgreSQL Pooler IPv4
          </span>
        </div>
      </div>

      {/* Sources Breakdown Grid */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Phân Bổ Dữ Liệu Theo Nguồn Tuyển Dụng
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Số bản ghi cào thô (Raw) vào từng bảng <code>jobs_&lt;source&gt;</code> và số tin hợp nhất vào <code>all_jobs_unified</code>
            </p>
          </div>
          <Link href="/jobs" style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
                background: 'rgba(255,255,255,0.03)',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
              className="source-card-hover"
            >
              <span className={`badge ${getSourceBadgeClass(src.source)}`} style={{ alignSelf: 'flex-start', marginBottom: '0.5rem' }}>
                {src.source.toUpperCase()}
              </span>
              <div>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {src.unifiedCount} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>jobs</span>
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={18} color="#38bdf8" /> Khu vực tuyển dụng nhiều nhất
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
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {loc.location}
                  </span>
                  <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>
                    {loc.count} việc làm
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Chưa có dữ liệu địa điểm.</p>
            )}
          </div>
        </div>

        {/* Right Column: Recent Jobs */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="#f59e0b" /> Việc làm mới đồng bộ gần đây
            </h3>
            <Link href="/jobs" style={{ fontSize: '0.825rem', color: '#818cf8', fontWeight: 600 }}>
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
                    padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  className="recent-job-item"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span className={`badge ${getSourceBadgeClass(job.source)}`} style={{ fontSize: '0.7rem' }}>
                      {job.source.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                      {job.salary || 'Thương lượng'}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {job.job_title}
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {job.company_name} • {job.location_short || 'Chưa rõ'}
                  </p>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Chưa có bài đăng nào.</p>
            )}
          </div>
        </div>
      </div>

      {/* CTA Box to Search Page */}
      <div
        style={{
          background: 'var(--accent-gradient-subtle)',
          border: '1px solid var(--border-accent)',
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
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            Khám phá Màn hình Tìm kiếm & Lọc Việc Làm Chuyên Sâu
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '600px' }}>
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
