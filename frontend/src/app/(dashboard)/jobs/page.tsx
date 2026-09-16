'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UnifiedJob, JobsApiResponse } from '@/types/job';
import JobDetailModal from '@/components/jobs/JobDetailModal';
import JobCompareModal from '@/components/jobs/JobCompareModal';
import { exportJobsToCsv } from '@/lib/exportCsv';
import { isJobSaved, saveJob, removeSavedJob } from '@/lib/savedJobs';
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
  X,
  SlidersHorizontal,
  Check,
  Bookmark,
  Scale,
  Download,
  Share2,
} from 'lucide-react';

const QUICK_TAGS = ['React', 'NodeJS', 'Python', 'Golang', 'Java', 'Tester', 'DevOps', 'Fresher', 'Senior'];

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

  // Compare List State
  const [compareJobs, setCompareJobs] = useState<UnifiedJob[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);

  // Saved Jobs lookup state for quick UI updates
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());

  const updateSavedUrls = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('jobs_hunter_saved_jobs_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        setSavedUrls(new Set(parsed.map((item: any) => item.job?.job_url)));
      } else {
        setSavedUrls(new Set());
      }
    } catch {
      setSavedUrls(new Set());
    }
  }, []);

  useEffect(() => {
    updateSavedUrls();
    window.addEventListener('savedJobsUpdated', updateSavedUrls);
    return () => window.removeEventListener('savedJobsUpdated', updateSavedUrls);
  }, [updateSavedUrls]);

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

  const handleToggleCompare = (job: UnifiedJob, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCompareJobs((prev) => {
      const exists = prev.some((j) => j.job_url === job.job_url);
      if (exists) {
        return prev.filter((j) => j.job_url !== job.job_url);
      }
      if (prev.length >= 3) {
        alert('Bạn chỉ có thể so sánh tối đa 3 việc làm cùng một lúc.');
        return prev;
      }
      return [...prev, job];
    });
  };

  const handleToggleSaveJob = (job: UnifiedJob, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isSaved = savedUrls.has(job.job_url);
    if (isSaved) {
      removeSavedJob(job.job_url);
    } else {
      saveJob(job, 'saved');
    }
  };

  const handleExportCsv = () => {
    if (jobs.length === 0) return;
    const filename = `viec_lam_it_${new Date().toISOString().slice(0, 10)}.csv`;
    exportJobsToCsv(jobs, filename);
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

  const hasActiveFilters =
    debouncedSearch ||
    selectedSource !== 'all' ||
    selectedLocation !== 'all' ||
    selectedLevel !== 'all' ||
    selectedExperience !== 'all';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <span className="badge badge-primary">
              <Sparkles size={12} style={{ marginRight: '3px' }} />
              Dữ liệu Tuyển dụng Trực tiếp
            </span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              • Bảng hợp nhất: <code style={{ color: '#ea580c', fontWeight: 600 }}>all_jobs_unified</code>
            </span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Khám Phá & Lọc Việc Làm IT
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={fetchJobs} className="btn btn-secondary" title="Làm mới dữ liệu">
            🔄 Làm mới
          </button>
        </div>
      </div>

      {/* 2-COLUMN SCREEN LAYOUT (SIDEBAR FILTER + MAIN FEED) */}
      <div className="jobs-container-layout">
        {/* LEFT COLUMN: FILTER SIDEBAR */}
        <aside className="filter-sidebar">
          <div className="filter-sidebar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <SlidersHorizontal size={18} color="#ea580c" />
              <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>Bộ Lọc Tuyển Dụng</h2>
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c2410c',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {/* Group 1: Nguồn tuyển dụng */}
          <div className="filter-group">
            <span className="filter-title">Nguồn tuyển dụng</span>
            <div className="filter-options-list">
              <div
                className={`filter-checkbox-item ${selectedSource === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSource('all');
                  setPage(1);
                }}
              >
                <span>Tất cả nguồn</span>
                <span className="badge" style={{ fontSize: '0.7rem' }}>
                  {sourcesList.reduce((acc, curr) => acc + curr.count, 0)}
                </span>
              </div>
              {sourcesList.map((s) => (
                <div
                  key={s.source}
                  className={`filter-checkbox-item ${selectedSource === s.source ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSource(selectedSource === s.source ? 'all' : s.source);
                    setPage(1);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {selectedSource === s.source && <Check size={14} color="#ea580c" />}
                    <span className={`badge ${getSourceBadgeClass(s.source)}`} style={{ fontSize: '0.65rem' }}>
                      {s.source.toUpperCase()}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Group 2: Địa điểm */}
          <div className="filter-group">
            <span className="filter-title">Địa điểm</span>
            <div className="filter-options-list">
              {['all', 'Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Remote'].map((loc) => {
                const isSelected = selectedLocation === loc;
                return (
                  <div
                    key={loc}
                    className={`filter-checkbox-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedLocation(loc);
                      setPage(1);
                    }}
                  >
                    <span>{loc === 'all' ? 'Tất cả khu vực' : loc}</span>
                    {isSelected && <Check size={14} color="#ea580c" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 3: Cấp bậc */}
          <div className="filter-group">
            <span className="filter-title">Cấp bậc</span>
            <div className="filter-options-list">
              {[
                { label: 'Tất cả cấp bậc', val: 'all' },
                { label: 'Thực tập / Intern', val: 'Thực tập' },
                { label: 'Nhân viên / Chuyên viên', val: 'Nhân viên' },
                { label: 'Trưởng nhóm / Leader', val: 'Trưởng nhóm' },
                { label: 'Quản lý / Manager', val: 'Quản lý' },
              ].map((lvl) => {
                const isSelected = selectedLevel === lvl.val;
                return (
                  <div
                    key={lvl.val}
                    className={`filter-checkbox-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedLevel(lvl.val);
                      setPage(1);
                    }}
                  >
                    <span>{lvl.label}</span>
                    {isSelected && <Check size={14} color="#ea580c" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 4: Kinh nghiệm */}
          <div className="filter-group">
            <span className="filter-title">Yêu cầu kinh nghiệm</span>
            <div className="filter-options-list">
              {[
                { label: 'Tất cả kinh nghiệm', val: 'all' },
                { label: 'Không yêu cầu', val: 'Không yêu cầu' },
                { label: 'Dưới 1 năm', val: '1 năm' },
                { label: '1 - 3 năm', val: '2 năm' },
                { label: '3 - 5 năm', val: '3 năm' },
                { label: 'Trên 5 năm', val: '5 năm' },
              ].map((exp) => {
                const isSelected = selectedExperience === exp.val;
                return (
                  <div
                    key={exp.val}
                    className={`filter-checkbox-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedExperience(exp.val);
                      setPage(1);
                    }}
                  >
                    <span>{exp.label}</span>
                    {isSelected && <Check size={14} color="#ea580c" />}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* RIGHT COLUMN: MAIN CONTENT (TOOLBAR + JOBS GRID) */}
        <main style={{ minWidth: 0 }}>
          {/* Feed Toolbar */}
          <div className="feed-toolbar">
            {/* Search Input */}
            <div className="search-box-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Tìm việc làm theo tiêu đề (React, Python, Backend), kỹ năng, công ty..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Quick Search Chips */}
            <div className="quick-tags-container">
              <span style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>Gợi ý:</span>
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  className="quick-tag-chip"
                  onClick={() => {
                    setSearchTerm(tag);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Results bar & Sorting */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>
                  Tìm thấy <span style={{ color: '#c2410c' }}>{total}</span> việc làm
                </span>

                {/* Active Filter Badges */}
                {selectedSource !== 'all' && (
                  <span
                    className="badge badge-primary"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedSource('all')}
                  >
                    Nguồn: {selectedSource.toUpperCase()} <X size={12} style={{ marginLeft: '4px' }} />
                  </span>
                )}
                {selectedLocation !== 'all' && (
                  <span
                    className="badge badge-primary"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedLocation('all')}
                  >
                    Khu vực: {selectedLocation} <X size={12} style={{ marginLeft: '4px' }} />
                  </span>
                )}
                {selectedLevel !== 'all' && (
                  <span
                    className="badge badge-primary"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedLevel('all')}
                  >
                    Cấp bậc: {selectedLevel} <X size={12} style={{ marginLeft: '4px' }} />
                  </span>
                )}
              </div>

              {/* Actions: Export Excel & Sort By Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleExportCsv}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.45rem 0.75rem',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                  title="Xuất danh sách công việc hiện tại ra file CSV chuẩn UTF-8 tương thích Excel"
                >
                  <Download size={14} color="#475569" />
                  <span>Xuất Excel ({jobs.length})</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.825rem', color: '#475569', fontWeight: 700 }}>Sắp xếp:</span>
                  <select
                    className="filter-select"
                    style={{
                      padding: '0.45rem 2rem 0.45rem 0.75rem',
                      fontSize: '0.825rem',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '6px',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontWeight: 600,
                    }}
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="similarity">🎯 Độ tương quan cao nhất</option>
                    <option value="latest">⚡ Mới cập nhật</option>
                    <option value="deadline">📅 Hạn nộp hồ sơ</option>
                    <option value="title">🔤 Tiêu đề A-Z</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Jobs List / Cards Grid */}
          {loading ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1rem',
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="job-card"
                  style={{ height: '220px', opacity: 0.6, background: '#ffffff' }}
                >
                  <div style={{ height: '20px', width: '35%', background: '#e2e8f0', borderRadius: '4px' }} />
                  <div style={{ height: '40px', width: '85%', background: '#e2e8f0', borderRadius: '4px' }} />
                  <div style={{ height: '24px', width: '50%', background: '#e2e8f0', borderRadius: '4px' }} />
                  <div style={{ height: '24px', width: '100%', background: '#e2e8f0', borderRadius: '4px' }} />
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
                  border: '1px solid #fed7aa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Search size={28} color="#ea580c" />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                Không tìm thấy việc làm phù hợp
              </h3>
              <p style={{ color: '#475569', maxWidth: '460px', fontSize: '0.9rem' }}>
                Không có bài đăng nào khớp với điều kiện lọc hiện tại. Thử bỏ chọn một số bộ lọc hoặc gõ từ khóa khác.
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1rem',
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
                    {/* Top: Source badge, Duplication badge, Match score & Date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                        {job.match_score !== undefined && job.match_score > 0 && debouncedSearch && (
                          <span
                            className="badge"
                            style={{
                              background: job.match_score >= 50 ? '#fff7ed' : '#f1f5f9',
                              color: job.match_score >= 50 ? '#c2410c' : '#334155',
                              borderColor: job.match_score >= 50 ? '#fdba74' : '#cbd5e1',
                              fontWeight: 700,
                              fontSize: '0.7rem',
                            }}
                          >
                            🎯 {job.match_score}% Phù hợp
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
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
                            width: '44px',
                            height: '44px',
                            borderRadius: '8px',
                            objectFit: 'contain',
                            background: '#ffffff',
                            padding: '3px',
                            border: '1px solid var(--border-medium)',
                            flexShrink: 0,
                          }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '8px',
                            background: 'var(--accent-gradient)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.1rem',
                            fontWeight: 800,
                            color: 'white',
                            flexShrink: 0,
                            boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
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
                            fontSize: '0.825rem',
                            color: '#475569',
                            marginTop: '0.2rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: 600,
                          }}
                          title={job.company_name}
                        >
                          {job.company_name}
                        </p>
                      </div>
                    </div>

                    {/* Salary Highlight */}
                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#fff7ed',
                        borderRadius: '8px',
                        border: '1px solid #fdba74',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span className="job-salary-tag">
                        💰 {job.salary || 'Thương lượng'}
                      </span>
                      {job.level && (
                        <span style={{ fontSize: '0.725rem', color: '#334155', fontWeight: 700, background: '#ffffff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                          {job.level}
                        </span>
                      )}
                    </div>

                    {/* Metadata details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
                      <div className="job-meta-item">
                        <MapPin size={14} color="#ea580c" style={{ flexShrink: 0 }} />
                        <span>{job.location_short || 'Chưa rõ địa điểm'}</span>
                      </div>
                      <div className="job-meta-item">
                        <Briefcase size={14} color="#64748b" style={{ flexShrink: 0 }} />
                        <span>{job.experience || 'Không yêu cầu KN'}</span>
                      </div>
                      {job.deadline && (
                        <div className="job-meta-item">
                          <Calendar size={14} color="#ea580c" style={{ flexShrink: 0 }} />
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
                        paddingTop: '0.65rem',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleSaveJob(job, e)}
                          style={{
                            background: savedUrls.has(job.job_url) ? '#fff7ed' : '#ffffff',
                            border: `1px solid ${savedUrls.has(job.job_url) ? '#fdba74' : 'var(--border-medium)'}`,
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.75rem',
                            color: savedUrls.has(job.job_url) ? '#c2410c' : '#334155',
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                          }}
                          title={savedUrls.has(job.job_url) ? 'Đã lưu việc này' : 'Lưu vào danh sách theo dõi'}
                        >
                          <Bookmark size={13} fill={savedUrls.has(job.job_url) ? '#ea580c' : 'none'} color={savedUrls.has(job.job_url) ? '#ea580c' : '#64748b'} />
                          <span>{savedUrls.has(job.job_url) ? 'Đã lưu' : 'Lưu'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleToggleCompare(job, e)}
                          style={{
                            background: compareJobs.some((j) => j.job_url === job.job_url) ? '#eff6ff' : '#ffffff',
                            border: `1px solid ${compareJobs.some((j) => j.job_url === job.job_url) ? '#93c5fd' : 'var(--border-medium)'}`,
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.75rem',
                            color: compareJobs.some((j) => j.job_url === job.job_url) ? '#1d4ed8' : '#334155',
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                          }}
                          title="Thêm vào bảng so sánh"
                        >
                          <Scale size={13} color={compareJobs.some((j) => j.job_url === job.job_url) ? '#1d4ed8' : '#64748b'} />
                          <span>{compareJobs.some((j) => j.job_url === job.job_url) ? 'Đang so sánh' : 'So sánh'}</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.825rem', color: '#c2410c', fontWeight: 700 }}>
                          Chi tiết &rarr;
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(job.job_url, '_blank', 'noopener,noreferrer');
                          }}
                          style={{
                            background: '#ffffff',
                            border: '1px solid var(--border-medium)',
                            borderRadius: '6px',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '5px',
                          }}
                          title="Mở tin gốc"
                        >
                          <ExternalLink size={14} />
                        </button>
                      </div>
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
                      {showEllipsis && <span style={{ color: '#64748b', padding: '0 4px' }}>...</span>}
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

              <span style={{ fontSize: '0.85rem', color: '#475569', marginLeft: '1rem', fontWeight: 600 }}>
                Trang {page} / {totalPages}
              </span>
            </div>
          )}
        </main>
      </div>

      {/* Floating Comparison Bar when jobs are selected for compare */}
      {compareJobs.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: 'white',
            borderRadius: '12px',
            padding: '0.75rem 1.25rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 900,
            maxWidth: '90vw',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Scale size={18} color="#ff6b00" />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              Đã chọn <strong style={{ color: '#ff6b00' }}>{compareJobs.length}</strong> / 3 việc làm
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setIsCompareModalOpen(true)}
              className="btn btn-primary"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
            >
              So sánh chi tiết ngay
            </button>
            <button
              onClick={() => setCompareJobs([])}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#94a3b8',
                padding: '0.4rem 0.6rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Xóa tất cả
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onAddToCompare={(job) => handleToggleCompare(job)}
        isCompared={selectedJob ? compareJobs.some((j) => j.job_url === selectedJob.job_url) : false}
      />

      {/* Compare Modal */}
      {isCompareModalOpen && (
        <JobCompareModal
          jobs={compareJobs}
          onClose={() => setIsCompareModalOpen(false)}
          onRemoveJob={(jobUrl) => {
            setCompareJobs((prev) => prev.filter((j) => j.job_url !== jobUrl));
          }}
        />
      )}
    </div>
  );
}
