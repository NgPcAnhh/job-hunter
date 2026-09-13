'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UnifiedJob, JobsApiResponse } from '@/types/job';
import JobDetailModal from '@/components/jobs/JobDetailModal';
import {
  Search,
  Filter,
  MapPin,
  DollarSign,
  Briefcase,
  Calendar,
  Building,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Layers,
  CheckCircle2,
} from 'lucide-react';

export default function JobsPage() {
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(12);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedExperience, setSelectedExperience] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('latest');

  // Facets
  const [sourcesList, setSourcesList] = useState<{ source: string; count: number }[]>([]);
  const [locationsList, setLocationsList] = useState<{ location: string; count: number }[]>([]);

  // Selected Job for Modal
  const [selectedJob, setSelectedJob] = useState<UnifiedJob | null>(null);

  // Debounce search term input by 350ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (selectedSource !== 'all') params.set('source', selectedSource);
      if (selectedLocation !== 'all') params.set('location', selectedLocation);
      if (selectedLevel !== 'all') params.set('level', selectedLevel);
      if (selectedExperience !== 'all') params.set('experience', selectedExperience);
      params.set('sortBy', sortBy);
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data: JobsApiResponse = await res.json();

      setJobs(data.jobs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);

      if (data.filtersAvailable) {
        if (data.filtersAvailable.sources?.length) {
          setSourcesList(data.filtersAvailable.sources);
        }
        if (data.filtersAvailable.locations?.length) {
          setLocationsList(data.filtersAvailable.locations);
        }
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedSource, selectedLocation, selectedLevel, selectedExperience, sortBy, page, limit]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedSource('all');
    setSelectedLocation('all');
    setSelectedLevel('all');
    setSelectedExperience('all');
    setSortBy('latest');
    setPage(1);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-primary">
              <Sparkles size={12} style={{ marginRight: '3px' }} />
              Dữ liệu Supabase
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              • Bảng hợp nhất: <code style={{ color: '#ea580c', fontWeight: 600 }}>all_jobs_unified</code>
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#111827' }}>
            Quản Lý & Tìm Kiếm Việc Làm IT
          </h1>
          <p style={{ color: '#4b5563', fontSize: '0.95rem', marginTop: '0.25rem' }}>
            Tìm kiếm từ khóa thông minh, lọc đa chiều và xem chi tiết tin tuyển dụng được khử trùng lặp tự động.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="badge badge-multi" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            <Sparkles size={16} style={{ marginRight: '0.35rem' }} />
            {total} Việc làm phù hợp
          </span>
          <button onClick={fetchJobs} className="btn btn-secondary" title="Làm mới dữ liệu">
            🔄 Làm mới
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Row 1: Search Input */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-box-wrapper">
            <Search size={18} className="search-icon" color="#9ca3af" />
            <input
              type="text"
              className="search-input"
              placeholder="Tìm kiếm vị trí tuyển dụng, công ty, kỹ năng (ví dụ: Python, React, Data, FPT...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            onClick={handleResetFilters}
            className="btn btn-secondary"
            style={{ whiteSpace: 'nowrap' }}
          >
            <RotateCcw size={15} />
            Đặt lại bộ lọc
          </button>
        </div>

        {/* Row 2: Filters Dropdowns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.85rem',
            alignItems: 'center',
          }}
        >
          {/* Source Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475467', marginBottom: '0.35rem' }}>
              Nguồn tuyển dụng
            </label>
            <select
              className="filter-select"
              style={{ width: '100%' }}
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">🌐 Tất cả nguồn ({sourcesList.reduce((acc, curr) => acc + curr.count, 0)})</option>
              {sourcesList.map((s) => (
                <option key={s.source} value={s.source}>
                  {s.source.toUpperCase()} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {/* Location Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475467', marginBottom: '0.35rem' }}>
              Khu vực / Tỉnh thành
            </label>
            <select
              className="filter-select"
              style={{ width: '100%' }}
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">📍 Tất cả khu vực</option>
              <option value="Hà Nội">Hà Nội</option>
              <option value="Hồ Chí Minh">TP. Hồ Chí Minh</option>
              <option value="Đà Nẵng">Đà Nẵng</option>
              <option value="Remote">Làm việc từ xa (Remote)</option>
              {locationsList
                .filter((l) => !['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng'].some((c) => l.location.includes(c)))
                .slice(0, 6)
                .map((l) => (
                  <option key={l.location} value={l.location}>
                    {l.location} ({l.count})
                  </option>
                ))}
            </select>
          </div>

          {/* Level Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475467', marginBottom: '0.35rem' }}>
              Cấp bậc vị trí
            </label>
            <select
              className="filter-select"
              style={{ width: '100%' }}
              value={selectedLevel}
              onChange={(e) => {
                setSelectedLevel(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">🎖️ Tất cả cấp bậc</option>
              <option value="Thực tập">Thực tập / Intern</option>
              <option value="Nhân viên">Nhân viên / Chuyên viên</option>
              <option value="Trưởng nhóm">Trưởng nhóm / Leader</option>
              <option value="Quản lý">Quản lý / Manager</option>
            </select>
          </div>

          {/* Experience Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475467', marginBottom: '0.35rem' }}>
              Yêu cầu kinh nghiệm
            </label>
            <select
              className="filter-select"
              style={{ width: '100%' }}
              value={selectedExperience}
              onChange={(e) => {
                setSelectedExperience(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">⏳ Tất cả kinh nghiệm</option>
              <option value="Không yêu cầu">Không yêu cầu kinh nghiệm</option>
              <option value="1 năm">Khoảng 1 năm</option>
              <option value="2 năm">Khoảng 2 năm</option>
              <option value="3 năm">3 - 5 năm</option>
              <option value="5 năm">Trên 5 năm</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475467', marginBottom: '0.35rem' }}>
              Sắp xếp theo
            </label>
            <select
              className="filter-select"
              style={{ width: '100%' }}
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
            >
              <option value="latest">⚡ Mới nhất (Created at)</option>
              <option value="deadline">📅 Hạn nộp hồ sơ</option>
              <option value="title">🔤 Tiêu đề A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Jobs Grid Display */}
      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel"
              style={{
                height: '240px',
                padding: '1.5rem',
                opacity: 0.6,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ height: '24px', width: '40%', background: '#e2e8f0', borderRadius: '4px' }} />
              <div style={{ height: '40px', width: '90%', background: '#e2e8f0', borderRadius: '4px' }} />
              <div style={{ height: '20px', width: '60%', background: '#e2e8f0', borderRadius: '4px' }} />
              <div style={{ height: '30px', width: '100%', background: '#e2e8f0', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#fff7ed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Search size={28} color="#ff6b00" />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Không tìm thấy việc làm phù hợp</h3>
          <p style={{ color: '#64748b', maxWidth: '480px', fontSize: '0.9rem' }}>
            Không có tin tuyển dụng nào thỏa mãn tiêu chí tìm kiếm hiện tại. Bạn hãy thử bỏ bớt điều kiện lọc hoặc tìm kiếm bằng từ khóa ngắn hơn.
          </p>
          <button onClick={handleResetFilters} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
            <RotateCcw size={16} />
            Khôi phục tất cả bộ lọc
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {jobs.map((job) => {
            const dupSources = job.extra_info?.duplicate_sources || [];
            return (
              <div
                key={job.job_url}
                className="job-card"
                onClick={() => setSelectedJob(job)}
              >
                {/* Card Top: Source badge & Multi badge */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge ${getSourceBadgeClass(job.source)}`}>
                        {job.source.toUpperCase()}
                      </span>
                      {dupSources.length > 0 && (
                        <span className="badge badge-multi" title={`Đã gộp từ: ${dupSources.join(', ')}`}>
                          <Layers size={11} style={{ marginRight: '3px' }} />
                          +{dupSources.length} nguồn
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {job.posted_date || 'Mới cập nhật'}
                    </span>
                  </div>

                  {/* Job Title & Company */}
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    {job.company_logo ? (
                      <img
                        src={job.company_logo}
                        alt={job.company_name}
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '8px',
                          objectFit: 'contain',
                          background: 'white',
                          padding: '3px',
                          border: '1px solid #e2e8f0',
                          flexShrink: 0,
                        }}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '8px',
                          background: 'var(--accent-gradient)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.15rem',
                          fontWeight: 700,
                          color: 'white',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(255,107,0,0.2)',
                        }}
                      >
                        {job.company_name?.charAt(0)?.toUpperCase() || 'J'}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="job-card-title" title={job.job_title}>
                        {job.job_title}
                      </h3>
                      <p
                        style={{
                          fontSize: '0.85rem',
                          color: '#64748b',
                          marginTop: '0.2rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={job.company_name}
                      >
                        {job.company_name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Salary Highlight */}
                <div style={{ padding: '0.5rem 0.75rem', background: '#fff7ed', borderRadius: '6px', border: '1px solid #ffedd5' }}>
                  <span className="job-salary-tag">
                    💰 {job.salary || 'Thương lượng'}
                  </span>
                </div>

                {/* Meta details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.825rem' }}>
                  <div className="job-meta-item">
                    <MapPin size={14} color="#ff6b00" />
                    <span>{job.location_short || 'Chưa rõ địa điểm'}</span>
                  </div>
                  <div className="job-meta-item">
                    <Briefcase size={14} color="#64748b" />
                    <span>{job.experience || 'Không yêu cầu KN'}</span>
                    {job.level && <span>• {job.level}</span>}
                  </div>
                  {job.deadline && (
                    <div className="job-meta-item">
                      <Calendar size={14} color="#ea580c" />
                      <span>Hạn nộp: {job.deadline}</span>
                    </div>
                  )}
                </div>

                {/* Card Action */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: '#ff6b00', fontWeight: 700 }}>
                    Xem chi tiết job &rarr;
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(job.job_url, '_blank', 'noopener,noreferrer');
                    }}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '5px',
                    }}
                    title="Mở link bài đăng gốc"
                  >
                    <ExternalLink size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination-container">
          <button
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
          </button>

          {Array.from({ length: totalPages }, (_, idx) => idx + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .map((p, idx, arr) => {
              const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
              return (
                <React.Fragment key={p}>
                  {showEllipsis && <span style={{ color: '#94a3b8', padding: '0 4px' }}>...</span>}
                  <button
                    className={`pagination-btn ${page === p ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                </React.Fragment>
              );
            })}

          <button
            className="pagination-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={16} />
          </button>

          <span style={{ fontSize: '0.85rem', color: '#64748b', marginLeft: '1rem', fontWeight: 500 }}>
            Trang {page} / {totalPages}
          </span>
        </div>
      )}

      {/* Detail Modal Component */}
      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
