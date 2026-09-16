'use client';

import React, { useEffect, useState } from 'react';
import { UnifiedJob } from '@/types/job';
import { isJobSaved, saveJob, removeSavedJob } from '@/lib/savedJobs';
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
  Bookmark,
  Share2,
  Check,
  Scale,
} from 'lucide-react';

interface JobDetailModalProps {
  job: UnifiedJob | null;
  onClose: () => void;
  onAddToCompare?: (job: UnifiedJob) => void;
  isCompared?: boolean;
}

export default function JobDetailModal({
  job,
  onClose,
  onAddToCompare,
  isCompared = false,
}: JobDetailModalProps) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (job) {
      setSaved(isJobSaved(job.job_url));
    }
  }, [job]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!job) return null;

  const handleToggleSave = () => {
    if (saved) {
      removeSavedJob(job.job_url);
      setSaved(false);
    } else {
      saveJob(job, 'saved');
      setSaved(true);
    }
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(job.job_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
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
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  flexShrink: 0,
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
                  boxShadow: '0 4px 12px rgba(255, 107, 0, 0.25)',
                  flexShrink: 0,
                }}
              >
                {job.company_name?.charAt(0)?.toUpperCase() || 'J'}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
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
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                {job.job_title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', color: '#334155' }}>
                <Building size={16} color="#64748b" />
                {job.company_url ? (
                  <a
                    href={job.company_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'underline', color: '#c2410c', fontWeight: 700 }}
                  >
                    {job.company_name}
                  </a>
                ) : (
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{job.company_name}</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              onClick={handleToggleSave}
              className="btn btn-secondary"
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.8rem',
                color: saved ? '#c2410c' : '#334155',
                borderColor: saved ? '#fdba74' : 'var(--border-medium)',
                background: saved ? '#fff7ed' : '#ffffff',
                fontWeight: 600,
              }}
              title={saved ? 'Bỏ lưu việc làm' : 'Lưu vào danh sách theo dõi'}
            >
              <Bookmark size={15} fill={saved ? '#ea580c' : 'none'} color={saved ? '#ea580c' : '#64748b'} />
              <span>{saved ? 'Đã lưu' : 'Lưu tin'}</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
              title="Sao chép liên kết"
            >
              {copied ? <Check size={15} color="#15803d" /> : <Share2 size={15} color="#475569" />}
            </button>

            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '6px',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Key Attributes Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              background: '#f8fafc',
              padding: '1.15rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="job-meta-item">
              <DollarSign size={18} color="#ea580c" />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Mức lương</span>
                <p style={{ fontWeight: 800, color: '#c2410c', fontSize: '1rem' }}>
                  {job.salary || 'Thương lượng'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <MapPin size={18} color="#ea580c" />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Khu vực</span>
                <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                  {job.location_short || 'Chưa cập nhật'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <Briefcase size={18} color="#6366f1" />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Kinh nghiệm</span>
                <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                  {job.experience || 'Không yêu cầu'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <GraduationCap size={18} color="#0284c7" />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Học vấn / Bằng cấp</span>
                <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                  {job.education || 'Không bắt buộc'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <Calendar size={18} color="#b45309" />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Hạn nộp hồ sơ</span>
                <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                  {job.deadline || 'Hết hạn theo quy định'}
                </p>
              </div>
            </div>

            <div className="job-meta-item">
              <Clock size={18} color="#15803d" />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Hình thức làm việc</span>
                <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                  {job.work_type || 'Toàn thời gian'}
                </p>
              </div>
            </div>
          </div>

          {/* Deduplication Banner if merged */}
          {duplicateSources.length > 0 && (
            <div
              style={{
                background: '#fff7ed',
                border: '1px solid #fdba74',
                padding: '0.9rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.875rem',
              }}
            >
              <CheckCircle2 size={20} color="#ea580c" />
              <div>
                <span style={{ fontWeight: 700, color: '#c2410c' }}>Khử trùng lặp thông minh:</span> Tin tuyển dụng này được đồng bộ và gộp tự động từ các nguồn:{' '}
                <span style={{ fontWeight: 700, color: '#0f172a' }}>
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
                <MapPin size={16} color="#ea580c" /> Địa chỉ làm việc cụ thể
              </h4>
              <p style={{ color: '#334155', fontSize: '0.9rem' }}>
                {job.workplace_detail}
              </p>
            </div>
          )}

          {/* Job Description */}
          <div>
            <h4 className="detail-section-title">
              <Briefcase size={16} color="#ea580c" /> Mô tả công việc
            </h4>
            <div className="detail-section-content">
              {job.job_description || 'Không có mô tả chi tiết cho bài đăng này.'}
            </div>
          </div>

          {/* Job Requirements */}
          <div>
            <h4 className="detail-section-title">
              <GraduationCap size={16} color="#ea580c" /> Yêu cầu ứng viên
            </h4>
            <div className="detail-section-content">
              {job.job_requirements || 'Không có yêu cầu cụ thể.'}
            </div>
          </div>

          {/* Benefits */}
          <div>
            <h4 className="detail-section-title">
              <DollarSign size={16} color="#ea580c" /> Quyền lợi & Đãi ngộ
            </h4>
            <div className="detail-section-content">
              {job.benefits || 'Được hưởng đầy đủ chế độ đãi ngộ theo chính sách công ty.'}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
            Đồng bộ lần cuối: {job.created_at ? new Date(job.created_at).toLocaleString('vi-VN') : 'N/A'}
          </span>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {onAddToCompare && (
              <button
                onClick={() => onAddToCompare(job)}
                className="btn btn-secondary"
                style={{
                  color: isCompared ? '#c2410c' : '#334155',
                  borderColor: isCompared ? '#fdba74' : 'var(--border-medium)',
                  background: isCompared ? '#fff7ed' : '#ffffff',
                  fontWeight: 600,
                }}
              >
                <Scale size={16} color={isCompared ? '#ea580c' : '#475569'} />
                {isCompared ? 'Đã thêm so sánh' : 'Thêm vào so sánh'}
              </button>
            )}
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
              Ứng tuyển trên {job.source.toUpperCase()}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
