'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SalaryRoleStat } from '@/types/job';
import {
  BarChart3,
  Layers,
  ChevronRight,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Search,
  Check,
  Cpu,
  ShieldCheck,
  Server,
  Layout,
  Smartphone,
  CheckCircle2,
  Users,
  Cloud,
} from 'lucide-react';

interface RoleSalaryChartProps {
  roles?: SalaryRoleStat[];
  selectedRoleKey: string;
  onSelectRole: (roleKey: string) => void;
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  'data-ai': <Cpu size={16} color="#8b5cf6" />,
  'devops': <Cloud size={16} color="#0284c7" />,
  'security': <ShieldCheck size={16} color="#10b981" />,
  'fullstack': <Layers size={16} color="#f59e0b" />,
  'backend': <Server size={16} color="#ea580c" />,
  'mobile': <Smartphone size={16} color="#ec4899" />,
  'product-ba': <Users size={16} color="#6366f1" />,
  'frontend': <Layout size={16} color="#06b6d4" />,
  'qa-qc': <CheckCircle2 size={16} color="#14b8a6" />,
};

export default function RoleSalaryChart({
  roles = [],
  selectedRoleKey,
  onSelectRole,
}: RoleSalaryChartProps) {
  const [viewMode, setViewMode] = useState<'avg' | 'range'>('avg');

  const selectedRole = roles.find((r) => r.key === selectedRoleKey);
  const maxAvgSalary = Math.max(...roles.map((r) => r.avgVnd), 60);

  // When a specific role is selected, show its deep-dive tech stack benchmark
  if (selectedRole) {
    const maxTechAvg = Math.max(...selectedRole.techs.map((t) => t.avg), 60);

    return (
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                {ROLE_ICONS[selectedRole.key] || <BarChart3 size={14} />}
                Chuyên Môn Đang Lọc
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                • {selectedRole.jobCount} tin tuyển dụng
              </span>
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Phổ Lương: {selectedRole.name}
            </h3>
            <p style={{ fontSize: '0.825rem', color: '#475569', marginTop: '0.2rem' }}>
              Dải thu nhập theo tech stack & kỹ năng cốt lõi (triệu VND/tháng)
            </p>
          </div>

          <button
            onClick={() => onSelectRole('all')}
            className="btn btn-secondary"
            style={{ fontSize: '0.775rem', padding: '0.4rem 0.75rem' }}
            title="Quay lại bảng so sánh tất cả vị trí"
          >
            <RotateCcw size={13} style={{ marginRight: '4px' }} />
            Tất cả vị trí
          </button>
        </div>

        {/* Highlight Summary Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.08) 0%, rgba(249, 115, 22, 0.03) 100%)',
            border: '1px solid rgba(234, 88, 12, 0.2)',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>
              Lương Trung Bình Ngành
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#c2410c' }}>
                {selectedRole.avgVnd}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 700 }}>
                triệu VND / tháng
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>
              Khoảng Thu Nhập Phổ Biến
            </span>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              {selectedRole.range}
            </p>
          </div>
        </div>

        {/* Tech Stacks Benchmark Horizontal Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
              MỨC LƯƠNG THEO KỸ NĂNG & TECH STACK
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đơn vị: Triệu VND</span>
          </div>

          {selectedRole.techs.map((tech) => {
            const widthPercent = Math.min(100, Math.round((tech.avg / maxTechAvg) * 100));
            return (
              <div
                key={tech.name}
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '0.75rem 0.9rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                    {tech.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                      Phổ: <strong style={{ color: '#0f172a' }}>{tech.range}</strong>
                    </span>
                    <span className="badge badge-primary" style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                      TB: ~{tech.avg} tr
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${widthPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #ea580c 0%, #f97316 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Salary Bracket Distribution */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.5rem' }}>
            PHÂN BỐ THEO DẢI LƯƠNG (% TIN TUYỂN DỤNG CÓ CÔNG KHAI)
          </span>
          <div style={{ display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', gap: '2px' }}>
            <div
              style={{ width: '15%', background: '#fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.675rem', fontWeight: 700, color: '#9a3412' }}
              title="Dưới 18tr: ~15%"
            >
              &lt;18tr (15%)
            </div>
            <div
              style={{ width: '45%', background: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.675rem', fontWeight: 700, color: '#ffffff' }}
              title="18 - 35tr: ~45%"
            >
              18 - 35tr (45%)
            </div>
            <div
              style={{ width: '28%', background: '#c2410c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.675rem', fontWeight: 700, color: '#ffffff' }}
              title="35 - 55tr: ~28%"
            >
              35 - 55tr (28%)
            </div>
            <div
              style={{ width: '12%', background: '#7c2d12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.675rem', fontWeight: 700, color: '#ffffff' }}
              title="Trên 55tr: ~12%"
            >
              &gt;55tr (12%)
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <Link
              href={`/jobs?q=${encodeURIComponent(selectedRole.name.split('/')[0].trim())}`}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              Xem {selectedRole.jobCount} việc làm {selectedRole.shortName} &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Overview View: Horizontal Bar Chart comparing all IT Roles
  return (
    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={18} color="#ea580c" /> So Sánh Mức Lương Theo Chuyên Môn
          </h3>
          <p style={{ fontSize: '0.825rem', color: '#475569', marginTop: '0.2rem' }}>
            Bấm vào vị trí bất kỳ để lọc chi tiết toàn bộ bảng lương
          </p>
        </div>

        {/* Mode switcher (Average vs Range) */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
          <button
            onClick={() => setViewMode('avg')}
            style={{
              border: 'none',
              padding: '0.3rem 0.65rem',
              borderRadius: '5px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: viewMode === 'avg' ? '#ffffff' : 'transparent',
              color: viewMode === 'avg' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'avg' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
            }}
          >
            Lương TB
          </button>
          <button
            onClick={() => setViewMode('range')}
            style={{
              border: 'none',
              padding: '0.3rem 0.65rem',
              borderRadius: '5px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: viewMode === 'range' ? '#ffffff' : 'transparent',
              color: viewMode === 'range' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'range' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
            }}
          >
            Khoảng Lương
          </button>
        </div>
      </div>

      {/* Role Comparison Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {roles.map((role) => {
          const widthPercent = Math.min(100, Math.round((role.avgVnd / maxAvgSalary) * 100));
          const isSelected = selectedRoleKey === role.key;

          return (
            <div
              key={role.key}
              onClick={() => onSelectRole(role.key)}
              style={{
                cursor: 'pointer',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: isSelected ? '2px solid #ea580c' : '1px solid var(--border-subtle)',
                background: isSelected ? '#fff7ed' : '#ffffff',
                boxShadow: isSelected ? '0 2px 8px rgba(234, 88, 12, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.02)',
                transition: 'all 0.15s ease',
              }}
              className="company-hover"
              title={`Nhấp để lọc bảng lương theo ${role.name}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  {ROLE_ICONS[role.key] || <BarChart3 size={15} />}
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                    {role.shortName}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>
                    {role.jobCount} tin
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {viewMode === 'avg' ? (
                    <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#c2410c' }}>
                      {role.avgVnd} tr/tháng
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                      {role.range}
                    </span>
                  )}
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </div>

              {/* Bar visualization */}
              <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${widthPercent}%`,
                    height: '100%',
                    background:
                      role.avgVnd >= 40
                        ? 'linear-gradient(90deg, #9333ea 0%, #c084fc 100%)'
                        : role.avgVnd >= 35
                        ? 'linear-gradient(90deg, #ea580c 0%, #f97316 100%)'
                        : 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
                    borderRadius: '3px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', marginTop: '0.25rem' }}>
        💡 Dữ liệu được trích xuất và tổng hợp từ hơn 4,400+ tin tuyển dụng CNTT tại Việt Nam
      </div>
    </div>
  );
}
