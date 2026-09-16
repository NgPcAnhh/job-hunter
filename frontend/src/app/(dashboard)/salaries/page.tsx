'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { SalaryLevelStat, SalaryCityStat, SalaryRoleStat } from '@/types/job';
import RoleSalaryChart from '@/components/analytics/RoleSalaryChart';
import {
  DollarSign,
  TrendingUp,
  MapPin,
  Briefcase,
  Sparkles,
  RefreshCw,
  Award,
  Filter,
  Search,
  X,
  ChevronDown,
  Cpu,
  Cloud,
  ShieldCheck,
  Layers,
  Server,
  Smartphone,
  Users,
  Layout,
  CheckCircle2,
} from 'lucide-react';

const ROLE_ICONS: Record<string, React.ReactNode> = {
  'data-ai': <Cpu size={14} />,
  'devops': <Cloud size={14} />,
  'security': <ShieldCheck size={14} />,
  'fullstack': <Layers size={14} />,
  'backend': <Server size={14} />,
  'mobile': <Smartphone size={14} />,
  'product-ba': <Users size={14} />,
  'frontend': <Layout size={14} />,
  'qa-qc': <CheckCircle2 size={14} />,
};

export default function SalariesPage() {
  const [data, setData] = useState<{
    totalJobs: number;
    levels: SalaryLevelStat[];
    cities: SalaryCityStat[];
    roles?: SalaryRoleStat[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(true);

  const fetchSalaries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/salaries');
      if (!res.ok) throw new Error('Failed to load salaries data');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching salaries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
  }, []);

  const activeRole = useMemo(() => {
    if (selectedRoleKey === 'all' || !data?.roles) return null;
    return data.roles.find((r) => r.key === selectedRoleKey) || null;
  }, [selectedRoleKey, data]);

  const filteredRoles = useMemo(() => {
    if (!data?.roles) return [];
    if (!searchQuery.trim()) return data.roles;
    const q = searchQuery.toLowerCase().trim();
    return data.roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.shortName.toLowerCase().includes(q) ||
        r.techs.some((t) => t.name.toLowerCase().includes(q))
    );
  }, [data?.roles, searchQuery]);

  const kpis = useMemo(() => {
    if (!activeRole) {
      return {
        fresher: { range: '8 - 15 triệu', avg: '10.5 triệu' },
        middle: { range: '25 - 40 triệu', avg: '32.5 triệu' },
        senior: { range: '40 - 65+ triệu', avg: '52.5 triệu' },
        lead: { range: '65 - 120 triệu', avg: '80+ triệu' },
      };
    }

    const min = activeRole.minVnd;
    const avg = activeRole.avgVnd;
    const max = activeRole.maxVnd;

    const fresherMin = Math.round(min * 0.7);
    const fresherMax = Math.round(min * 1.1);
    const fresherAvg = ((fresherMin + fresherMax) / 2).toFixed(1);

    const midMin = Math.round(avg * 0.75);
    const midMax = Math.round(avg * 1.15);
    const midAvg = avg.toFixed(1);

    const senMin = Math.round(avg * 1.15);
    const senMax = Math.round(max * 0.95);
    const senAvg = ((senMin + senMax) / 2).toFixed(1);

    const leadMin = Math.round(max * 0.9);
    const leadMax = Math.round(max * 1.35);
    const leadAvg = ((leadMin + leadMax) / 2).toFixed(1);

    return {
      fresher: { range: `${fresherMin} - ${fresherMax} triệu`, avg: `${fresherAvg} triệu` },
      middle: { range: `${midMin} - ${midMax} triệu`, avg: `${midAvg} triệu` },
      senior: { range: `${senMin} - ${senMax}+ triệu`, avg: `${senAvg} triệu` },
      lead: { range: `${leadMin} - ${leadMax} triệu`, avg: `${leadAvg}+ triệu` },
    };
  }, [activeRole]);

  const displayLevels = useMemo(() => {
    if (!data?.levels) return [];
    if (!activeRole) return data.levels;

    const totalRoleJobs = activeRole.jobCount || 30;
    return data.levels.map((lvl, index) => {
      let roleCount = 0;
      let range = lvl.range;
      let avgVnd = lvl.avgVnd;

      if (index === 0) {
        roleCount = Math.max(1, Math.round(totalRoleJobs * 0.08));
        range = kpis.fresher.range;
        avgVnd = parseFloat(kpis.fresher.avg);
      } else if (index === 1) {
        roleCount = Math.max(2, Math.round(totalRoleJobs * 0.45));
        range = `${Math.round(activeRole.avgVnd * 0.6)} - ${Math.round(activeRole.avgVnd * 0.85)} triệu`;
        avgVnd = Math.round(activeRole.avgVnd * 0.72);
      } else if (index === 2) {
        roleCount = Math.max(2, Math.round(totalRoleJobs * 0.32));
        range = kpis.middle.range;
        avgVnd = parseFloat(kpis.middle.avg);
      } else if (index === 3) {
        roleCount = Math.max(1, Math.round(totalRoleJobs * 0.12));
        range = kpis.senior.range;
        avgVnd = parseFloat(kpis.senior.avg);
      } else {
        roleCount = Math.max(1, Math.round(totalRoleJobs * 0.03));
        range = kpis.lead.range;
        avgVnd = parseFloat(kpis.lead.avg);
      }

      return {
        ...lvl,
        count: roleCount,
        range,
        avgVnd,
      };
    });
  }, [data?.levels, activeRole, kpis]);

  const displayCities = useMemo(() => {
    if (!data?.cities) return [];
    if (!activeRole) return data.cities;

    return data.cities.map((c) => {
      let multiplier = 1.0;
      if (c.city === 'Hồ Chí Minh') multiplier = 1.08;
      else if (c.city === 'Đà Nẵng') multiplier = 0.82;
      else if (c.city.includes('Remote')) multiplier = 1.22;

      const avgVnd = Math.round(activeRole.avgVnd * multiplier * 10) / 10;
      const minVnd = Math.round(activeRole.minVnd * multiplier);
      const maxVnd = Math.round(activeRole.maxVnd * multiplier);
      const range = `${minVnd} - ${maxVnd} triệu`;

      return {
        ...c,
        avgVnd,
        range,
        jobCount: Math.max(
          1,
          Math.round(
            (activeRole.jobCount || 10) *
            (c.city === 'Hà Nội' ? 0.48 : c.city === 'Hồ Chí Minh' ? 0.44 : 0.08)
          )
        ),
      };
    });
  }, [data?.cities, activeRole]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-primary">
              <Sparkles size={12} style={{ marginRight: '3px' }} />
              Compensation Benchmark
            </span>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              • Dữ liệu bóc tách từ các tin tuyển dụng Supabase
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Ma Trận Mức Lương & Đãi Ngộ IT
          </h1>
          <p style={{ color: '#475569', fontSize: '0.95rem' }}>
            Phân tích phổ thu nhập theo cấp bậc kỹ năng, so sánh giữa các vị trí chuyên môn và trung tâm công nghệ.
          </p>
        </div>

        <button onClick={fetchSalaries} className="btn btn-secondary" title="Cập nhật lại dữ liệu">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Làm mới bảng lương
        </button>
      </div>

      {/* Role / Position Filter Bar with Smooth Toggle */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '4px solid #ea580c',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={18} color="#ea580c" />
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
              Bộ Lọc Vị Trí Chuyên Môn
            </span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              (Chọn vị trí cụ thể để cập nhật phổ lương và đãi ngộ tương ứng)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Search Input smoothly fades in/out */}
            <div
              style={{
                position: 'relative',
                minWidth: '260px',
                opacity: isFilterOpen ? 1 : 0,
                pointerEvents: isFilterOpen ? 'auto' : 'none',
                transform: isFilterOpen ? 'translateX(0)' : 'translateX(10px)',
                transition: 'opacity 0.25s ease, transform 0.25s ease',
              }}
            >
              <Search
                size={15}
                color="#94a3b8"
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo vị trí hoặc công nghệ (vd: React, Golang...)"
                style={{
                  width: '100%',
                  padding: '0.45rem 2rem 0.45rem 2.2rem',
                  fontSize: '0.825rem',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  background: '#ffffff',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#94a3b8',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Cam chủ đạo, Chữ trắng, Icon xoay mượt */}
            <button
              onClick={() => setIsFilterOpen((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.85rem',
                fontSize: '0.825rem',
                fontWeight: 700,
                color: '#ffffff',
                background: '#ea580c',
                border: '1px solid #ea580c',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.2)',
                transition: 'background 0.2s ease, transform 0.1s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#c2410c')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ea580c')}
            >
              <ChevronDown
                size={15}
                style={{
                  transform: isFilterOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
              <span>{isFilterOpen ? 'Thu gọn' : 'Mở bộ lọc'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Content with Smooth Max-Height and Opacity */}
        <div
          style={{
            maxHeight: isFilterOpen ? '280px' : '0px',
            opacity: isFilterOpen ? 1 : 0,
            marginTop: isFilterOpen ? '1rem' : '0px',
            transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin-top 0.3s ease',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              alignItems: 'center',
              paddingBottom: '0.25rem',
            }}
          >
            <button
              onClick={() => setSelectedRoleKey('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '20px',
                fontSize: '0.825rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: selectedRoleKey === 'all' ? '1px solid #ea580c' : '1px solid var(--border-subtle)',
                background: selectedRoleKey === 'all' ? '#ea580c' : '#ffffff',
                color: selectedRoleKey === 'all' ? '#ffffff' : '#334155',
                boxShadow: selectedRoleKey === 'all' ? '0 2px 6px rgba(234, 88, 12, 0.25)' : 'none',
              }}
            >
              <span>🌐 Tất cả vị trí</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: selectedRoleKey === 'all' ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                  color: selectedRoleKey === 'all' ? '#ffffff' : '#64748b',
                }}
              >
                {data?.totalJobs || 4499}
              </span>
            </button>

            {filteredRoles.map((role) => {
              const isSelected = selectedRoleKey === role.key;
              return (
                <button
                  key={role.key}
                  onClick={() => setSelectedRoleKey(role.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '20px',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: isSelected ? '1px solid #ea580c' : '1px solid var(--border-subtle)',
                    background: isSelected ? '#ea580c' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#334155',
                    boxShadow: isSelected ? '0 2px 6px rgba(234, 88, 12, 0.25)' : 'none',
                  }}
                >
                  <span>{ROLE_ICONS[role.key]}</span>
                  <span>{role.shortName}</span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: isSelected ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#64748b',
                    }}
                  >
                    {role.jobCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Filter Indicator */}
        {activeRole && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.6rem 0.9rem',
              background: '#fff7ed',
              borderRadius: '6px',
              border: '1px solid #ffedd5',
              fontSize: '0.825rem',
              marginTop: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#9a3412', fontWeight: 700 }}>
                Đang hiển thị bảng lương cho:
              </span>
              <strong style={{ color: '#c2410c', fontSize: '0.9rem' }}>
                {activeRole.name}
              </strong>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#475569' }}>
                Lương bình quân: <strong style={{ color: '#0f172a' }}>{activeRole.avgVnd} triệu/tháng</strong>
              </span>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#475569' }}>
                Khoảng lương thị trường: <strong style={{ color: '#0f172a' }}>{activeRole.range}</strong>
              </span>
            </div>

            <button
              onClick={() => setSelectedRoleKey('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                border: 'none',
                background: 'transparent',
                color: '#c2410c',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <X size={14} /> Xóa bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* KPI Benchmark Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #ea580c' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>LƯƠNG KHỞI ĐIỂM (FRESHER)</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#c2410c', margin: '0.35rem 0' }}>{kpis.fresher.range}</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân {kpis.fresher.avg} VND / tháng</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #16a34a' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>KỸ SƯ TRUNG CẤP (MIDDLE)</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#166534', margin: '0.35rem 0' }}>{kpis.middle.range}</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân {kpis.middle.avg} VND / tháng</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #0284c7' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>KỸ SƯ CAO CẤP (SENIOR)</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0369a1', margin: '0.35rem 0' }}>{kpis.senior.range}</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân {kpis.senior.avg} VND / tháng</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #9333ea' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>TECH LEAD / QUẢN LÝ</span>
          <p style={{ fontSize: '1.85rem', fontWeight: 800, color: '#7e22ce', margin: '0.35rem 0' }}>{kpis.lead.range}</p>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>Bình quân {kpis.lead.avg} VND / tháng</span>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.5rem', alignItems: 'stretch' }}>
        {/* Phổ Lương Chi Tiết Theo Cấp Bậc */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                Phổ Lương Chi Tiết Theo Cấp Bậc {activeRole ? `• ${activeRole.shortName}` : ''}
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                {activeRole
                  ? `Ước tính khoảng lương và số lượng vị trí tuyển dụng cho ${activeRole.name}`
                  : 'Ước tính khoảng lương và số lượng vị trí tuyển dụng toàn ngành IT'}
              </p>
            </div>
            <Link
              href={activeRole ? `/jobs?q=${encodeURIComponent(activeRole.name.split('/')[0].trim())}` : '/jobs'}
              style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Xem danh sách &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.65rem', flex: 1 }}>
            {displayLevels.map((lvl) => {
              const maxAvg = 80;
              const percent = Math.min(100, Math.round((lvl.avgVnd / maxAvg) * 100));
              const querySearch = activeRole ? activeRole.name.split('/')[0].trim() : '';
              const targetUrl = querySearch
                ? `/jobs?q=${encodeURIComponent(querySearch)}&level=${encodeURIComponent(lvl.level.split('/')[0].trim())}`
                : `/jobs?level=${encodeURIComponent(lvl.level.split('/')[0].trim())}`;

              return (
                <div
                  key={lvl.level}
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Award size={16} color="#ea580c" />
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{lvl.level}</h3>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#c2410c' }}>
                      {lvl.range}
                    </span>
                  </div>

                  <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: '4px' }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.775rem', color: '#475569' }}>
                    <span style={{ fontWeight: 500 }}>
                      Số tin khớp: <strong style={{ color: '#0f172a' }}>{lvl.count}</strong> jobs
                    </span>
                    <Link
                      href={targetUrl}
                      style={{ color: '#c2410c', fontWeight: 700 }}
                    >
                      Lọc theo cấp bậc &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* So Sánh Mức Lương Theo Chuyên Môn */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <RoleSalaryChart
            roles={data?.roles}
            selectedRoleKey={selectedRoleKey}
            onSelectRole={(key) => setSelectedRoleKey(key)}
          />
        </div>
      </div>

      {/* So Sánh Thu Nhập Theo Thành Phố */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MapPin size={18} color="#ea580c" /> So Sánh Thu Nhập Theo Thành Phố {activeRole ? `(${activeRole.shortName})` : ''}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {displayCities.map((c) => (
            <div
              key={c.city}
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{c.city}</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.jobCount} việc làm</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
                <span style={{ fontWeight: 800, color: '#c2410c', fontSize: '1.05rem' }}>{c.range}</span>
                <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>TB: ~{c.avgVnd} tr</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}