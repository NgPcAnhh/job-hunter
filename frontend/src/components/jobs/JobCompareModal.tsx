'use client';

import React from 'react';
import { UnifiedJob } from '@/types/job';
import {
  X,
  ExternalLink,
  DollarSign,
  MapPin,
  Briefcase,
  Calendar,
  Layers,
  Award,
  CheckCircle2,
} from 'lucide-react';

interface JobCompareModalProps {
  jobs: UnifiedJob[];
  onClose: () => void;
  onRemoveJob: (jobUrl: string) => void;
}

export default function JobCompareModal({ jobs, onClose, onRemoveJob }: JobCompareModalProps) {
  if (!jobs || jobs.length === 0) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: jobs.length === 2 ? '920px' : '1180px',
          width: '95vw',
        }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={20} color="#ea580c" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Đối Chiếu & So Sánh ({jobs.length} Việc Làm)
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: '1px solid var(--border-medium)',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: '#475569',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: Side-by-Side Comparison Grid */}
        <div className="modal-body" style={{ padding: '1.5rem', overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${jobs.length}, minmax(280px, 1fr))`,
              gap: '1.25rem',
            }}
          >
            {jobs.map((job) => (
              <div
                key={job.job_url}
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  position: 'relative',
                }}
              >
                {/* Remove button */}
                <button
                  onClick={() => onRemoveJob(job.job_url)}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: '#ffffff',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#475569',
                  }}
                  title="Gỡ khỏi danh sách so sánh"
                >
                  <X size={14} />
                </button>

                {/* Company & Title */}
                <div>
                  <span className="badge badge-primary" style={{ fontSize: '0.7rem', marginBottom: '0.35rem' }}>
                    {job.source.toUpperCase()}
                  </span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.35, marginTop: '2px' }}>
                    {job.job_title}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 700, marginTop: '2px' }}>
                    {job.company_name}
                  </p>
                </div>

                {/* Criteria 1: Salary */}
                <div style={{ background: '#fff7ed', border: '1px solid #fdba74', padding: '0.65rem 0.85rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.725rem', color: '#c2410c', fontWeight: 700, textTransform: 'uppercase' }}>
                    Mức Lương
                  </span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#c2410c' }}>
                    💰 {job.salary || 'Thương lượng'}
                  </p>
                </div>

                {/* Criteria 2: Location & Work Type */}
                <div>
                  <span style={{ fontSize: '0.725rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                    Khu Vực & Hình Thức
                  </span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                    📍 {job.location_short || 'Chưa rõ'} • {job.work_type || 'Toàn thời gian'}
                  </p>
                </div>

                {/* Criteria 3: Level & Experience */}
                <div>
                  <span style={{ fontSize: '0.725rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                    Cấp Bậc & Kinh Nghiệm
                  </span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                    🎖️ {job.level || 'Chưa xác định'} • ⏳ {job.experience || 'Không yêu cầu'}
                  </p>
                </div>

                {/* Criteria 4: Deadline */}
                <div>
                  <span style={{ fontSize: '0.725rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                    Hạn Nộp Hồ Sơ
                  </span>
                  <p style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 700 }}>
                    📅 {job.deadline || 'Hết hạn theo quy định'}
                  </p>
                </div>

                {/* Criteria 5: Benefits */}
                <div>
                  <span style={{ fontSize: '0.725rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                    Quyền Lợi & Đãi Ngộ
                  </span>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '0.8rem', color: '#1e293b', background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', marginTop: '2px', lineHeight: 1.5 }}>
                    {job.benefits || 'Được hưởng đầy đủ quyền lợi theo quy định công ty.'}
                  </div>
                </div>

                {/* Criteria 6: Requirements preview */}
                <div>
                  <span style={{ fontSize: '0.725rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                    Tóm Tắt Yêu Cầu
                  </span>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '0.8rem', color: '#1e293b', background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', marginTop: '2px', lineHeight: 1.5 }}>
                    {job.job_requirements || 'Không có yêu cầu đặc thù.'}
                  </div>
                </div>

                {/* Action Link */}
                <div style={{ marginTop: 'auto', paddingTop: '0.75rem' }}>
                  <a
                    href={job.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  >
                    <ExternalLink size={15} />
                    Xem bài đăng gốc
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
            Mẹo: Bạn có thể chọn tối đa 3 việc làm để so sánh trực diện trước khi ứng tuyển.
          </span>
          <button onClick={onClose} className="btn btn-secondary">
            Đóng bảng so sánh
          </button>
        </div>
      </div>
    </div>
  );
}
