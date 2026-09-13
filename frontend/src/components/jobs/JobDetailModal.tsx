'use client';

import React, { useEffect } from 'react';
import { UnifiedJob } from '@/types/job';
import {
  X,
  ExternalLink,
  MapPin,
  DollarSign,
  Briefcase,
  GraduationCap,
  Calendar,
  Clock,
  Building,
  CheckCircle2,
  Share2,
} from 'lucide-react';

interface JobDetailModalProps {
  job: UnifiedJob | null;
  onClose: () => void;
}

export default function JobDetailModal({ job, onClose }: JobDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!job) return null;

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

  const duplicateSources = job.extra_info?.duplicate_sources || [];

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            {/* Company Logo / Avatar */}
            {job.company_logo ? (
              <img
                src={job.company_logo}
                alt={job.company_name}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '12px',
                  objectFit: 'contain',
                  background: 'white',
                  padding: '4px',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '12px',
                  background: 'var(--accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: 'white',
                }}
              >
                {job.company_name?.charAt(0)?.toUpperCase() || 'J'}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                <span className={`badge ${getSourceBadgeClass(job.source)}`}>
                  {job.source.toUpperCase()}
                </span>
                {duplicateSources.length > 0 && (
                  <span className="badge badge-multi">
                    ✨ Đã gộp từ {duplicateSources.length + 1} nguồn
                  </span>
                )}
                {job.level && <span className="badge">{job.level}</span>}
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {job.job_title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                <Building size={16} />
                {job.company_url ? (
                  <a
                    href={job.company_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'underline', color: '#818cf8', fontWeight: 600 }}
                  >
                    {job.company_name}
                  </a>
                ) : (
                  <span style={{ fontWeight: 600 }}>{job.company_name}</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Key Attributes Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              background: 'rgba(255,255,255,0.02)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="job-meta-item">
              <DollarSign size={18} color="var(--success)" />
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mức lương</span>
                <p style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.95rem' }}>
                  {job.salary || 'Thương lượng'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <MapPin size={18} color="#38bdf8" />
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Khu vực</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  {job.location_short || 'Chưa cập nhật'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <Briefcase size={18} color="#a855f7" />
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kinh nghiệm</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  {job.experience || 'Không yêu cầu'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <GraduationCap size={18} color="#fb7185" />
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Học vấn / Bằng cấp</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  {job.education || 'Không bắt buộc'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <Calendar size={18} color="#f59e0b" />
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hạn nộp hồ sơ</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  {job.deadline || 'Hết hạn theo quy định'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <Clock size={18} color="#22c55e" />
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hình thức làm việc</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  {job.work_type || 'Toàn thời gian'}
                </p>
              </div>
            </div>
          </div>

          {/* Deduplication Banner if merged */}
          {duplicateSources.length > 0 && (
            <div
              style={{
                background: 'linear-gradient(90deg, rgba(236,72,153,0.1) 0%, rgba(99,102,241,0.1) 100%)',
                border: '1px solid rgba(236,72,153,0.3)',
                padding: '0.85rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <CheckCircle2 size={20} color="#f472b6" />
              <div>
                <span style={{ fontWeight: 700, color: '#f472b6' }}>Khử trùng lặp thông minh:</span> Tin tuyển dụng này được đồng bộ và gộp tự động từ các nguồn:{' '}
                <span style={{ fontWeight: 600, color: '#f9fafb' }}>
                  {[job.source, ...duplicateSources].join(', ')}
                </span>
                .
              </div>
            </div>
          )}

          {/* Workplace Detail */}
          {job.workplace_detail && (
            <div>
              <h4 className="detail-section-title">
                <MapPin size={16} /> Địa chỉ làm việc cụ thể
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {job.workplace_detail}
              </p>
            </div>
          )}

          {/* Job Description */}
          <div>
            <h4 className="detail-section-title">
              <Briefcase size={16} /> Mô tả công việc
            </h4>
            <div className="detail-section-content">
              {job.job_description || 'Không có mô tả chi tiết cho bài đăng này.'}
            </div>
          </div>

          {/* Job Requirements */}
          <div>
            <h4 className="detail-section-title">
              <GraduationCap size={16} /> Yêu cầu ứng viên
            </h4>
            <div className="detail-section-content">
              {job.job_requirements || 'Không có yêu cầu cụ thể.'}
            </div>
          </div>

          {/* Benefits */}
          <div>
            <h4 className="detail-section-title">
              <DollarSign size={16} /> Quyền lợi & Đãi ngộ
            </h4>
            <div className="detail-section-content">
              {job.benefits || 'Được hưởng đầy đủ chế độ đãi ngộ theo chính sách công ty.'}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Đồng bộ lần cuối: {job.created_at ? new Date(job.created_at).toLocaleString('vi-VN') : 'N/A'}
          </span>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={onClose} className="btn btn-secondary">
              Đóng
            </button>
            <a
              href={job.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              <ExternalLink size={16} />
              Ứng tuyển / Xem tin gốc trên {job.source.toUpperCase()}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
