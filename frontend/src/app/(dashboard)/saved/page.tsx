'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SavedJobItem, ApplicationStatus, UnifiedJob } from '@/types/job';
import { getSavedJobs, removeSavedJob, updateJobStatus } from '@/lib/savedJobs';
import JobDetailModal from '@/components/jobs/JobDetailModal';
import { exportJobsToCsv } from '@/lib/exportCsv';
import {
  Bookmark,
  Briefcase,
  ExternalLink,
  Trash2,
  MapPin,
  DollarSign,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  FolderHeart,
} from 'lucide-react';

const STATUS_LABELS: Record<ApplicationStatus, { label: string; color: string; bg: string }> = {
  saved: { label: 'Đã lưu', color: '#64748b', bg: '#f1f5f9' },
  applied: { label: 'Đã nộp CV', color: '#0284c7', bg: '#e0f2fe' },
  interviewing: { label: 'Đang phỏng vấn', color: '#ea580c', bg: '#fff7ed' },
  offered: { label: 'Đã nhận Offer', color: '#16a34a', bg: '#dcfce7' },
  rejected: { label: 'Từ chối / Dừng lại', color: '#dc2626', bg: '#fee2e2' },
};

export default function SavedJobsPage() {
  const [savedItems, setSavedItems] = useState<SavedJobItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<ApplicationStatus | 'all'>('all');
  const [selectedJob, setSelectedJob] = useState<UnifiedJob | null>(null);
  const [isClient, setIsClient] = useState<boolean>(false);

  const loadJobs = () => {
    setSavedItems(getSavedJobs());
  };

  useEffect(() => {
    setIsClient(true);
    loadJobs();
    window.addEventListener('savedJobsUpdated', loadJobs);
    return () => window.removeEventListener('savedJobsUpdated', loadJobs);
  }, []);

  const handleStatusChange = (jobUrl: string, newStatus: ApplicationStatus) => {
    updateJobStatus(jobUrl, newStatus);
    loadJobs();
  };

  const handleRemove = (jobUrl: string) => {
    removeSavedJob(jobUrl);
    loadJobs();
  };

  const handleExport = () => {
    if (savedItems.length === 0) return;
    const jobs = savedItems.map((item) => item.job);
    exportJobsToCsv(jobs, `danh_sach_viec_da_luu_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const filteredItems = activeFilter === 'all'
    ? savedItems
    : savedItems.filter((i) => i.status === activeFilter);

  // Status counts
  const counts = {
    all: savedItems.length,
    saved: savedItems.filter((i) => i.status === 'saved').length,
    applied: savedItems.filter((i) => i.status === 'applied').length,
    interviewing: savedItems.filter((i) => i.status === 'interviewing').length,
    offered: savedItems.filter((i) => i.status === 'offered').length,
    rejected: savedItems.filter((i) => i.status === 'rejected').length,
  };

  if (!isClient) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Header Banner */}
      <div className="analytics-card" style={{ padding: '1.5rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-primary">Quản Lý Ứng Tuyển Cá Nhân</span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Mini-ATS Tracker</span>
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              Việc Làm Đã Lưu & Tiến Trình Ứng Tuyển
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Theo dõi tình trạng từng công việc mục tiêu: từ lúc lưu tin, nộp hồ sơ, tham gia phỏng vấn đến khi nhận offer chính thức.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={handleExport}
              disabled={savedItems.length === 0}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
              title="Xuất toàn bộ việc làm đã lưu ra file Excel"
            >
              <Download size={15} />
              Xuất Excel ({savedItems.length})
            </button>
            <Link href="/jobs" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              <Briefcase size={15} />
              Tìm Thêm Việc Mới
            </Link>
          </div>
        </div>
      </div>

      {/* Stage Status Tabs */}
      <div className="analytics-card" style={{ padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          <button
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeFilter === 'all' ? 'var(--accent-gradient)' : '#f8fafc',
              color: activeFilter === 'all' ? '#ffffff' : '#475569',
              transition: 'all 0.15s ease',
            }}
          >
            Tất cả ({counts.all})
          </button>

          {(['saved', 'applied', 'interviewing', 'offered', 'rejected'] as ApplicationStatus[]).map((st) => {
            const info = STATUS_LABELS[st];
            const isActive = activeFilter === st;
            return (
              <button
                key={st}
                onClick={() => setActiveFilter(st)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: isActive ? `1.5px solid ${info.color}` : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  background: isActive ? info.bg : '#ffffff',
                  color: isActive ? info.color : '#475569',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span>{info.label}</span>
                <span
                  style={{
                    background: isActive ? info.color : '#f1f5f9',
                    color: isActive ? '#ffffff' : '#64748b',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px',
                  }}
                >
                  {counts[st]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Saved Jobs List */}
      {filteredItems.length === 0 ? (
        <div className="analytics-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#fff7ed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}
          >
            <FolderHeart size={32} color="#ea580c" />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>
            {savedItems.length === 0 ? 'Bạn chưa lưu công việc nào' : 'Không có việc làm nào ở trạng thái này'}
          </h3>
          <p style={{ color: '#64748b', maxWidth: '420px', margin: '0.5rem auto 1.5rem', fontSize: '0.9rem' }}>
            Hãy truy cập Bộ lọc Việc làm để bấm nút &quot;Lưu&quot; cho những vị trí phù hợp, hệ thống sẽ tự động tổng hợp tại đây để bạn quản lý tiến độ nộp CV.
          </p>
          <Link href="/jobs" className="btn btn-primary">
            Khám phá việc làm IT ngay
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredItems.map((item) => {
            const job = item.job;
            const currentStage = STATUS_LABELS[item.status] || STATUS_LABELS.saved;

            return (
              <div
                key={job.job_url}
                className="analytics-card"
                style={{
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                {/* Left: Logo & Job Details */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1, minWidth: '300px' }}>
                  {job.company_logo ? (
                    <img
                      src={job.company_logo}
                      alt={job.company_name}
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '10px',
                        objectFit: 'contain',
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        padding: '3px',
                        flexShrink: 0,
                      }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '10px',
                        background: 'var(--accent-gradient)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '1.2rem',
                        flexShrink: 0,
                      }}
                    >
                      {job.company_name?.charAt(0)?.toUpperCase() || 'J'}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <span className="badge badge-primary">{job.source.toUpperCase()}</span>
                      {job.level && <span className="badge">{job.level}</span>}
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Lưu ngày: {new Date(item.savedAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    <h3
                      onClick={() => setSelectedJob(job)}
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: '#0f172a',
                        cursor: 'pointer',
                      }}
                    >
                      {job.job_title}
                    </h3>

                    <p style={{ fontSize: '0.875rem', color: '#334155', marginTop: '0.2rem' }}>
                      {job.company_name}
                    </p>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                      <span style={{ color: '#c2410c', fontWeight: 700 }}>
                        💰 {job.salary || 'Thương lượng'}
                      </span>
                      <span style={{ color: '#64748b' }}>
                        📍 {job.location_short || 'Chưa rõ'}
                      </span>
                      {job.deadline && (
                        <span style={{ color: '#c2410c', fontWeight: 600 }}>
                          📅 Hạn: {job.deadline}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Stage Status Selector & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      Giai đoạn ứng tuyển:
                    </span>
                    <select
                      className="filter-select"
                      value={item.status}
                      onChange={(e) => handleStatusChange(job.job_url, e.target.value as ApplicationStatus)}
                      style={{
                        padding: '0.45rem 2rem 0.45rem 0.75rem',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        color: currentStage.color,
                        background: currentStage.bg,
                        borderColor: currentStage.color,
                      }}
                    >
                      <option value="saved">📌 Đã lưu tin</option>
                      <option value="applied">📤 Đã nộp CV</option>
                      <option value="interviewing">🗣️ Đang phỏng vấn</option>
                      <option value="offered">🎉 Nhận Offer</option>
                      <option value="rejected">🛑 Dừng lại / Từ chối</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.8rem', fontSize: '0.825rem' }}
                    >
                      Chi tiết
                    </button>
                    <a
                      href={job.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
                    >
                      <ExternalLink size={14} />
                      Nộp CV
                    </a>
                    <button
                      onClick={() => handleRemove(job.job_url)}
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        padding: '7px',
                        color: '#dc2626',
                        cursor: 'pointer',
                      }}
                      title="Xóa khỏi danh sách lưu"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
