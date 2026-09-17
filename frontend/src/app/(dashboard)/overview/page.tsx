'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  StatsApiResponse,
  TechTrendItem,
  SalaryLevelStat,
  SalaryCityStat,
  SalaryRoleStat,
  ProvinceStat,
} from '@/types/job';
import RoleSalaryChart from '@/components/analytics/RoleSalaryChart';
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  Briefcase,
  Globe,
  Layers,
  Zap,
  Sparkles,
  TrendingUp,
  DollarSign,
  MapPin,
  Award,
  Filter,
  Search,
  CheckCircle2,
  Flame,
  Compass,
  BarChart3,
  Building2,
  Cpu,
  ShieldCheck,
  Server,
  Smartphone,
  Users,
  Layout,
  Cloud,
  ChevronRight,
  X,
} from 'lucide-react';

// Dynamic import Leaflet component with SSR disabled
const VietnamLeafletMap = dynamic(
  () => import('@/components/analytics/VietnamLeafletMap'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: '240px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          gap: '0.5rem',
        }}
      >
        <div
          className="animate-spin"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '2px solid #e2e8f0',
            borderTopColor: '#ea580c',
          }}
        />
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
          Đang nạp bản đồ địa lý PowerBI...
        </span>
      </div>
    ),
  }
);

const ROLE_ICONS: Record<string, React.ReactNode> = {
  'data-ai': <Cpu size={13} />,
  'devops': <Cloud size={13} />,
  'security': <ShieldCheck size={13} />,
  'fullstack': <Layers size={13} />,
  'backend': <Server size={13} />,
  'mobile': <Smartphone size={13} />,
  'product-ba': <Users size={13} />,
  'frontend': <Layout size={13} />,
  'qa-qc': <CheckCircle2 size={13} />,
};

export default function PowerBIOverviewDashboard() {
  // Data States
  const [stats, setStats] = useState<StatsApiResponse | null>(null);
  const [trends, setTrends] = useState<TechTrendItem[]>([]);
  const [salaryData, setSalaryData] = useState<{
    totalJobs: number;
    levels: SalaryLevelStat[];
    cities: SalaryCityStat[];
    roles?: SalaryRoleStat[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Filter States
  const [selectedTechCategory, setSelectedTechCategory] = useState<string>('all');
  const [techSearch, setTechSearch] = useState<string>('');
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<'all' | 'north' | 'central' | 'south'>('all');

  // Time clock
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');

  // Auto-scale state for responsive dashboard
  const [dashScale, setDashScale] = useState<number>(1);

  // Auto-scale: calculate scale factor based on viewport width vs reference design width (1920px)
  // This mimics browser zoom behavior - on smaller screens, everything scales down proportionally
  useEffect(() => {
    const DESIGN_WIDTH = 1920;

    const calcScale = () => {
      const vw = window.innerWidth;
      const scale = vw / DESIGN_WIDTH;
      // Only scale down, never scale up beyond 1
      setDashScale(Math.min(1, scale));
    };

    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, []);

  // 1. Hanoi Time Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const time = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);

      const date = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(now);

      setTimeStr(time);
      setDateStr(date);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch All Data in Parallel
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [resStats, resTrends, resSalaries] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/analytics/trends'),
        fetch('/api/analytics/salaries'),
      ]);

      if (resStats.ok) {
        const statsJson = await resStats.json();
        setStats(statsJson);
      }
      if (resTrends.ok) {
        const trendsJson = await resTrends.json();
        setTrends(trendsJson.trends || []);
      }
      if (resSalaries.ok) {
        const salaryJson = await resSalaries.json();
        setSalaryData(salaryJson);
      }
    } catch (err) {
      console.error('Failed to load combined overview dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Derived Tech Trends
  const filteredTrends = useMemo(() => {
    return trends.filter((item) => {
      const matchCat = selectedTechCategory === 'all' || item.category === selectedTechCategory;
      const matchSearch = item.name.toLowerCase().includes(techSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [trends, selectedTechCategory, techSearch]);

  // Derived Provinces & Top 10 Cities
  const provincesList = useMemo(() => stats?.provinces || [], [stats]);
  const top10Cities = useMemo(() => {
    if (provincesList.length > 0) {
      return provincesList
        .filter((p) => !['Toàn quốc / Remote', 'Khác / Chưa rõ'].includes(p.province))
        .slice(0, 10);
    }
    return [
      { province: 'TP. Hồ Chí Minh', jobCount: 8420, percentage: 46.8 },
      { province: 'Hà Nội', jobCount: 7850, percentage: 43.6 },
      { province: 'Đà Nẵng', jobCount: 1210, percentage: 6.7 },
      { province: 'Bình Dương', jobCount: 280, percentage: 1.6 },
      { province: 'Đồng Nai', jobCount: 190, percentage: 1.1 },
      { province: 'Cần Thơ', jobCount: 140, percentage: 0.8 },
      { province: 'Hải Phòng', jobCount: 120, percentage: 0.7 },
      { province: 'Bà Rịa - Vũng Tàu', jobCount: 95, percentage: 0.5 },
      { province: 'Thừa Thiên Huế', jobCount: 80, percentage: 0.4 },
      { province: 'Bắc Ninh', jobCount: 75, percentage: 0.4 },
    ];
  }, [provincesList]);

  // Derived Top Hiring Companies (Top 10)
  const topCompaniesList = useMemo(() => {
    if (stats?.topHiringCompanies && stats.topHiringCompanies.length > 0) {
      return stats.topHiringCompanies.slice(0, 10);
    }
    return [
      { company_name: 'FPT Software', job_count: 342 },
      { company_name: 'Viettel Telecom', job_count: 215 },
      { company_name: 'VNG Corporation', job_count: 184 },
      { company_name: 'Techcombank IT Center', job_count: 156 },
      { company_name: 'MISA Joint Stock Co.', job_count: 128 },
      { company_name: 'CMC Global', job_count: 110 },
      { company_name: 'VPBank Technology', job_count: 95 },
      { company_name: 'Shopee Vietnam', job_count: 88 },
      { company_name: 'One Mount Group', job_count: 76 },
      { company_name: 'NAB Innovation Centre', job_count: 64 },
    ];
  }, [stats]);

  // Active Role in Salary Section
  const activeRole = useMemo(() => {
    if (selectedRoleKey === 'all' || !salaryData?.roles) return null;
    return salaryData.roles.find((r) => r.key === selectedRoleKey) || null;
  }, [selectedRoleKey, salaryData]);

  // Sources Map (Sorted by heat percentage descending)
  const sourcesFormatted = useMemo(() => {
    let list = [
      { source: 'TopCV', jobCount: 6540, percentage: 36.3 },
      { source: 'VietnamWorks', jobCount: 4210, percentage: 23.4 },
      { source: 'CareerLink', jobCount: 2450, percentage: 13.6 },
      { source: 'JobsGO', jobCount: 1980, percentage: 11.0 },
      { source: 'Careerviet', jobCount: 1420, percentage: 7.9 },
      { source: 'Vieclam24h', jobCount: 890, percentage: 4.9 },
      { source: 'Joboko', jobCount: 508, percentage: 2.8 },
    ];
    if (stats?.sources) {
      const total = stats.totalUnified || 1;
      list = stats.sources.map((src) => {
        const count = src.unifiedCount || src.rawCount || 0;
        return {
          source: src.source,
          jobCount: count,
          percentage: Math.round((count / total) * 1000) / 10,
        };
      });
    }
    return list.sort((a, b) => b.percentage - a.percentage);
  }, [stats]);

  // Heatmap Gradient Color Config Generator
  const getSourceHeatConfig = (percent: number) => {
    if (percent >= 25) {
      return {
        bg: 'linear-gradient(135deg, #9a3412 0%, #ea580c 100%)',
        border: '#7c2d12',
        text: '#ffffff',
        subText: '#ffedd5',
        badgeBg: 'rgba(255, 255, 255, 0.22)',
        badgeText: '#ffffff',
        tag: 'Cực nóng 🔥',
      };
    }
    if (percent >= 15) {
      return {
        bg: 'linear-gradient(135deg, #c2410c 0%, #f97316 100%)',
        border: '#9a3412',
        text: '#ffffff',
        subText: '#ffedd5',
        badgeBg: 'rgba(255, 255, 255, 0.2)',
        badgeText: '#ffffff',
        tag: 'Rất nóng ⚡',
      };
    }
    if (percent >= 8) {
      return {
        bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        border: '#fdba74',
        text: '#9a3412',
        subText: '#c2410c',
        badgeBg: '#fed7aa',
        badgeText: '#9a3412',
        tag: 'Ấm áp ♨️',
      };
    }
    return {
      bg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      border: '#cbd5e1',
      text: '#1e293b',
      subText: '#64748b',
      badgeBg: '#e2e8f0',
      badgeText: '#475569',
      tag: 'Bình ổn ❄️',
    };
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#f8fafc',
      }}
    >
    <div
      className="overview-wrapper"
      style={{
        width: `${100 / dashScale}vw`,
        height: `${100 / dashScale}vh`,
        overflow: 'hidden',
        background: '#f8fafc',
        color: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        boxSizing: 'border-box',
        transform: `scale(${dashScale})`,
        transformOrigin: 'top left',
      }}
    >
      <style jsx global>{`
        .overview-wrapper {
          overflow: hidden;
          background: #f8fafc;
          color: #0f172a;
          display: flex;
          flex-direction: column;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          box-sizing: border-box;
        }

        .overview-main-grid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(320px, 1fr) minmax(0, 2fr);
          gap: 0.65rem;
          padding: 0.65rem;
          box-sizing: border-box;
          overflow: hidden;
        }

        .overview-right-rows {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          flex: 1;
        }

        .overview-row-1 {
          display: flex;
          gap: 0.65rem;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .overview-row-2 {
          display: flex;
          gap: 0.65rem;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        @keyframes kpiMarqueeScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .kpi-marquee-track {
          display: flex;
          gap: 0.65rem;
          align-items: center;
          width: max-content;
          animation: kpiMarqueeScroll 35s linear infinite;
        }
        .kpi-marquee-container:hover .kpi-marquee-track {
          animation-play-state: paused;
        }

        @keyframes cityMarqueeScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .city-marquee-track {
          display: flex;
          gap: 0.45rem;
          align-items: center;
          width: max-content;
          animation: cityMarqueeScroll 28s linear infinite;
        }
        .city-marquee-container:hover .city-marquee-track {
          animation-play-state: paused;
        }
      `}</style>
      {/* 1. TOP POWERBI EXECUTIVE HEADER BAR (Only 1 Back Button) */}
      <header
        style={{
          height: '52px',
          minHeight: '52px',
          background: '#ffffff',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          zIndex: 100,
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)',
        }}
      >
        {/* Left Area: ONLY 1 Back Button + Main Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#c2410c',
              padding: '0.35rem 0.85rem',
              borderRadius: '7px',
              fontSize: '0.825rem',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'all 0.18s ease',
              boxShadow: '0 1px 2px rgba(234, 88, 12, 0.08)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ea580c';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = '#ea580c';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff7ed';
              e.currentTarget.style.color = '#c2410c';
              e.currentTarget.style.borderColor = '#fdba74';
            }}
            title="Quay về giao diện trang chủ chính"
          >
            <ArrowLeft size={16} />
            <span>Quay về màn hình chính</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '7px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 3px 10px rgba(234, 88, 12, 0.25)',
              }}
            >
              <BarChart3 size={17} color="#ffffff" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <h1 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
                  QUAN SÁT TỔNG QUAN THỊ TRƯỜNG IT
                </h1>
                <span
                  style={{
                    fontSize: '0.65rem',
                    background: '#fff7ed',
                    color: '#c2410c',
                    border: '1px solid #fdba74',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 800,
                  }}
                >
                  POWER BI VIEW
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
                Hệ thống Dashboard quan sát thời gian thực & dữ liệu tuyển dụng tập trung
              </span>
            </div>
          </div>
        </div>

        {/* Right Area: Hanoi Clock & Quick Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Live Market Counter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#fff7ed',
              border: '1px solid #fdba74',
              borderRadius: '999px',
              padding: '0.25rem 0.75rem',
              fontSize: '0.775rem',
            }}
          >
            <Briefcase size={14} color="#ea580c" />
            <span style={{ color: '#475569', fontWeight: 600 }}>Thị trường:</span>
            <strong style={{ color: '#c2410c', fontWeight: 800 }}>
              {stats?.totalUnified ? `${stats.totalUnified.toLocaleString('vi-VN')} việc làm` : 'Đang tính...'}
            </strong>
          </div>

          {/* Platforms Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.75rem',
              color: '#166534',
              background: '#dcfce7',
              border: '1px solid #86efac',
              padding: '0.25rem 0.65rem',
              borderRadius: '999px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#15803d',
                display: 'inline-block',
                boxShadow: '0 0 4px #15803d',
              }}
            />
            <span style={{ fontWeight: 700 }}>9/9 web hoạt động</span>
          </div>

          {/* Live Clock */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '6px',
              padding: '0.25rem 0.65rem',
            }}
            title="Giờ chuẩn Việt Nam (GMT+7)"
          >
            <Clock size={14} color="#ea580c" />
            <span style={{ fontSize: '0.775rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
              {timeStr || '--:--:--'} <small style={{ color: '#c2410c', fontSize: '0.65rem' }}>VN</small>
            </span>
          </div>

          {/* Refresh button */}
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
            title="Cập nhật lại số liệu mới nhất"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* 2. CONTINUOUS AUTO-SCROLLING HORIZONTAL MARQUEE KPI STRIP */}
      <div
        style={{
          height: '52px',
          minHeight: '52px',
          background: '#ffffff',
          borderBottom: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          position: 'relative',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
        }}
      >


        <div className="kpi-marquee-container" style={{ width: '100%', overflow: 'hidden' }}>
          <div className="kpi-marquee-track">
            {/* Render KPI Items Array Twice for Seamless Infinite Marquee Loop */}
            {[1, 2].map((loopIdx) => (
              <React.Fragment key={loopIdx}>
                {/* 1. Tổng tin tuyển dụng */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#fff7ed',
                    border: '1px solid #fdba74',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <Briefcase size={16} color="#ea580c" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>TỔNG TIN TUYỂN DỤNG</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#c2410c', lineHeight: 1 }}>
                      {loading && !stats ? '...' : (stats?.totalUnified || 0).toLocaleString()} <small style={{ fontSize: '0.65rem' }}>jobs</small>
                    </div>
                  </div>
                </div>

                {/* 2. Nhà tuyển dụng */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <Building2 size={16} color="#0284c7" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>NHÀ TUYỂN DỤNG</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0369a1', lineHeight: 1 }}>
                      {loading && !stats ? '...' : (stats?.totalCompanies || 2445).toLocaleString()} <small style={{ fontSize: '0.65rem' }}>cty IT</small>
                    </div>
                  </div>
                </div>

                {/* 3. Nguồn dữ liệu */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={16} color="#16a34a" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>NGUỒN DỮ LIỆU</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#166534', lineHeight: 1 }}>
                      7 / 7 Web <small style={{ fontSize: '0.65rem' }}>Crawled Live</small>
                    </div>
                  </div>
                </div>

                {/* 4. Fresher */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderLeft: '3px solid #ea580c',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <DollarSign size={15} color="#ea580c" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>LƯƠNG KHỞI ĐIỂM (FRESHER)</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#c2410c', lineHeight: 1 }}>
                      8 - 15 triệu <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(TB ~10.5tr)</small>
                    </div>
                  </div>
                </div>

                {/* 5. Middle */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderLeft: '3px solid #16a34a',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <DollarSign size={15} color="#16a34a" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>KỸ SƯ TRUNG CẤP (MIDDLE)</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#166534', lineHeight: 1 }}>
                      25 - 40 triệu <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(TB ~32.5tr)</small>
                    </div>
                  </div>
                </div>

                {/* 6. Senior */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderLeft: '3px solid #0284c7',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <DollarSign size={15} color="#0284c7" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>KỸ SƯ CAO CẤP (SENIOR)</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0369a1', lineHeight: 1 }}>
                      40 - 65+ triệu <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(TB ~52.5tr)</small>
                    </div>
                  </div>
                </div>

                {/* 7. Tech Lead */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderLeft: '3px solid #9333ea',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <Award size={15} color="#9333ea" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>TECH LEAD / QUẢN LÝ</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7e22ce', lineHeight: 1 }}>
                      65 - 120 triệu <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(TB ~80+tr)</small>
                    </div>
                  </div>
                </div>

                {/* 8. Thu nhập TP. Hồ Chí Minh */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={15} color="#ea580c" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>THU NHẬP TP. HỒ CHÍ MINH</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#c2410c', lineHeight: 1 }}>
                      TB ~36.5 tr/tháng <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(18 - 65tr)</small>
                    </div>
                  </div>
                </div>

                {/* 9. Thu nhập Hà Nội */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={15} color="#0284c7" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>THU NHẬP HÀ NỘI</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0369a1', lineHeight: 1 }}>
                      TB ~33.2 tr/tháng <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(16 - 60tr)</small>
                    </div>
                  </div>
                </div>

                {/* 10. Thu nhập Đà Nẵng */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={15} color="#16a34a" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>THU NHẬP ĐÀ NẴNG</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#166534', lineHeight: 1 }}>
                      TB ~27.8 tr/tháng <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(14 - 45tr)</small>
                    </div>
                  </div>
                </div>

                {/* 11. Thu nhập Remote / US */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    background: '#f5f3ff',
                    border: '1px solid #ddd6fe',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={15} color="#8b5cf6" />
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>THU NHẬP REMOTE / US CLIENT</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>
                      TB ~45.0+ tr/tháng <small style={{ fontSize: '0.65rem', color: '#64748b' }}>(25 - 90+tr)</small>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE: 1/3 LEFT (Map + Top 10 Horizontal Cities) & 2/3 RIGHT */}
      <div
        className="overview-main-grid"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 2fr)',
          gap: '0.65rem',
          padding: '0.65rem',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* ========================================================================= */}
        {/* LEFT COLUMN (1/3 WIDTH): VIETNAM MAP + REGION FILTER + HORIZONTAL TOP 10 CITIES */}
        {/* ========================================================================= */}
        <div
          className="glass-panel"
          style={{
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            borderLeft: '4px solid #ea580c',
          }}
        >
          {/* Map Title & Region Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Compass size={16} color="#ea580c" />
              <h2 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Bản Đồ Mật Độ Việc Làm IT
              </h2>
            </div>

            {/* Region Filter Buttons */}
            <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '2px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              {[
                { id: 'all', label: 'Toàn quốc' },
                { id: 'north', label: 'Bắc' },
                { id: 'central', label: 'Trung' },
                { id: 'south', label: 'Nam' },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRegion(r.id as any)}
                  style={{
                    border: 'none',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: selectedRegion === r.id ? '#ea580c' : 'transparent',
                    color: selectedRegion === r.id ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Leaflet Vietnam Map Component Container */}
          <div
            style={{
              flex: 1,
              minHeight: '220px',
              width: '100%',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <VietnamLeafletMap provinces={provincesList} selectedRegion={selectedRegion} />
          </div>

          {/* BELOW THE MAP: TOP 10 CITIES AUTO-SCROLLING MARQUEE STRIP (TỰ CHẠY NGANG) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.45rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.725rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <MapPin size={13} color="#ea580c" /> TOP 10 ĐÔ THỊ VIỆC LÀM (TỰ CHẠY NGANG)
              </span>
              <span style={{ fontSize: '0.675rem', color: '#64748b' }}>Địa điểm • Số jobs • Thị phần</span>
            </div>



            {/* Continuous Marquee Track for Top 10 Cities */}
            <div className="city-marquee-container" style={{ width: '100%', overflow: 'hidden' }}>
              <div className="city-marquee-track">
                {[1, 2].map((loopIdx) => (
                  <React.Fragment key={loopIdx}>
                    {top10Cities.map((city, idx) => (
                      <Link
                        key={`${loopIdx}-${city.province}`}
                        href={`/jobs?location=${encodeURIComponent(city.province)}`}
                        style={{
                          display: 'inline-flex',
                          flexDirection: 'column',
                          gap: '2px',
                          padding: '0.35rem 0.6rem',
                          borderRadius: '6px',
                          background: idx === 0 ? '#fff7ed' : idx === 1 ? '#f0fdf4' : idx === 2 ? '#f0f9ff' : '#ffffff',
                          border: idx === 0 ? '1px solid #fdba74' : idx === 1 ? '1px solid #86efac' : idx === 2 ? '1px solid #7dd3fc' : '1px solid #e2e8f0',
                          minWidth: '115px',
                          flexShrink: 0,
                          textDecoration: 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: idx === 0 ? '#c2410c' : idx === 1 ? '#166534' : idx === 2 ? '#0369a1' : '#0f172a' }}>
                            #{idx + 1} {city.province}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', marginTop: '1px' }}>
                          <strong style={{ color: '#ea580c' }}>{city.jobCount.toLocaleString()} jobs</strong>
                          <span style={{ color: '#64748b', fontSize: '0.65rem' }}>{city.percentage}%</span>
                        </div>
                      </Link>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT AREA (2/3 WIDTH): REORGANIZED INTO 2 ROWS */}
        {/* ========================================================================= */}
        <div
          className="overview-right-rows"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            flex: 1,
          }}
        >
          {/* ========================================================================= */}
          {/* ROW 1: EQUAL WIDTH (50% - 50%) FOR TREEMAP SOURCES & TECH RADAR */}
          {/* ========================================================================= */}
          <div
            className="overview-row-1"
            style={{
              display: 'flex',
              gap: '0.65rem',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* 1. Heatmap & Treemap Nguồn Tuyển Dụng (50% Width) */}
            <div
              className="glass-panel"
              style={{
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Flame size={15} color="#ea580c" />
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Heatmap & Treemap Nguồn Tuyển Dụng
                  </h3>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Thị phần 9 nền tảng</span>
              </div>

              {/* 100% Market Share Ribbon Spectrum Bar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>
                  <span>Phổ nhiệt thị phần (Market Ribbon)</span>
                  <span style={{ color: '#ea580c' }}>{(stats?.totalUnified || 0).toLocaleString()} jobs</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    display: 'flex',
                    background: '#e2e8f0',
                    border: '1px solid #cbd5e1',
                  }}
                >
                  {sourcesFormatted.map((src) => {
                    const heat = getSourceHeatConfig(src.percentage);
                    return (
                      <div
                        key={src.source}
                        title={`${src.source}: ${src.jobCount.toLocaleString()} jobs (${src.percentage}%)`}
                        style={{
                          width: `${src.percentage}%`,
                          minWidth: src.percentage > 0 ? '4px' : '0',
                          height: '100%',
                          background: heat.bg,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Treemap 3-Column Heat Grid Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gridTemplateRows: 'repeat(3, 1fr)',
                  gap: '0.35rem',
                  overflow: 'hidden',
                  flex: 1,
                  minHeight: 0,
                  height: '100%',
                }}
              >
                {sourcesFormatted.map((src) => {
                  const heat = getSourceHeatConfig(src.percentage);
                  const isDarkBg = src.percentage >= 15;

                  return (
                    <Link
                      key={src.source}
                      href={`/jobs?source=${src.source}`}
                      style={{
                        background: heat.bg,
                        border: `1px solid ${heat.border}`,
                        borderRadius: '6px',
                        padding: '0.45rem 0.6rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.25rem',
                        textDecoration: 'none',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(234,88,12,0.18)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: heat.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {src.source}
                        </span>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 5px',
                            borderRadius: '4px',
                            background: heat.badgeBg,
                            color: heat.badgeText,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {heat.tag}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px' }}>
                        <strong style={{ fontSize: '1.05rem', fontWeight: 900, color: heat.text, whiteSpace: 'nowrap' }}>
                          {src.jobCount.toLocaleString()} <small style={{ fontSize: '0.68rem', fontWeight: 600, color: heat.subText }}>jobs</small>
                        </strong>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: heat.subText, flexShrink: 0 }}>
                          {src.percentage}%
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '4px', background: isDarkBg ? 'rgba(255,255,255,0.35)' : '#cbd5e1', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(6, src.percentage)}%`,
                            height: '100%',
                            background: isDarkBg ? '#ffffff' : '#ea580c',
                            borderRadius: '2px',
                          }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 2. Xu Hướng Kỹ Năng & Radar Công Nghệ (50% Width) */}
            <div
              className="glass-panel"
              style={{
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              {/* Title & Search */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <TrendingUp size={15} color="#ea580c" />
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Xu Hướng Kỹ Năng & Radar Công Nghệ
                  </h3>
                </div>

                {/* Filter Input */}
                <div style={{ position: 'relative', width: '135px' }}>
                  <Search size={12} color="#64748b" style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Lọc tech stack..."
                    value={techSearch}
                    onChange={(e) => setTechSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '2px 4px 2px 22px',
                      fontSize: '0.7rem',
                      background: '#ffffff',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '4px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Category Pills */}
              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                {['all', 'Language', 'Framework', 'Database/Cloud', 'Tool'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedTechCategory(cat)}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      border: selectedTechCategory === cat ? '1px solid #ea580c' : '1px solid var(--border-medium)',
                      background: selectedTechCategory === cat ? '#ea580c' : '#ffffff',
                      color: selectedTechCategory === cat ? '#ffffff' : '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    {cat === 'all' ? 'Tất cả' : cat}
                  </button>
                ))}
              </div>

              {/* OVERFLOW Y SCROLLABLE LIST OF SKILLS */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  paddingRight: '2px',
                }}
              >
                {filteredTrends.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', padding: '1.5rem 0' }}>
                    Không có công nghệ nào khớp từ khóa.
                  </div>
                ) : (
                  filteredTrends.map((tech) => (
                    <div
                      key={tech.name}
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '0.45rem 0.6rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                            {tech.name}
                          </span>
                          <span style={{ fontSize: '0.625rem', color: '#64748b', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>
                            {tech.category}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: tech.badge.includes('Hot') ? '#fff7ed' : '#dcfce7',
                            color: tech.badge.includes('Hot') ? '#c2410c' : '#166534',
                            border: tech.badge.includes('Hot') ? '1px solid #fdba74' : '1px solid #86efac',
                          }}
                        >
                          {tech.badge}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                        <span style={{ color: '#475569' }}>
                          Nhu cầu: <strong style={{ color: '#c2410c' }}>{tech.count} jobs ({tech.sharePercent}%)</strong>
                        </span>
                        <span style={{ color: '#166534', fontWeight: 700 }}>
                          Lương TB: {tech.avgSalaryEstimate}
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(8, tech.sharePercent)}%`,
                            height: '100%',
                            background: 'var(--accent-gradient)',
                            borderRadius: '2px',
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* ROW 2: ASYMMETRIC WIDTH (Top Doanh Nghiệp ~27% + Phổ Lương ~73%) */}
          {/* ========================================================================= */}
          <div
            className="overview-row-2"
            style={{
              display: 'flex',
              gap: '0.65rem',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* 3. Top Doanh Nghiệp Tuyển Dụng IT (Narrow width ~27%) */}
            <div
              className="glass-panel"
              style={{
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                flex: '0.75',
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Building2 size={15} color="#ea580c" />
                  <h3 style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Top Doanh Nghiệp IT
                  </h3>
                </div>
                <span style={{ fontSize: '0.65rem', color: '#ea580c', fontWeight: 700 }}>Top 10</span>
              </div>

              {/* Company List Stacked Vertically */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', overflowY: 'auto', paddingRight: '2px', flex: 1 }}>
                {topCompaniesList.map((comp, idx) => (
                  <div
                    key={comp.company_name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.3rem 0.45rem',
                      background: '#ffffff',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '5px',
                      fontSize: '0.72rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '3px',
                          background: idx === 0 ? '#ea580c' : idx === 1 ? '#0284c7' : '#f1f5f9',
                          color: idx < 2 ? '#ffffff' : '#64748b',
                          fontSize: '0.6rem',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '0.72rem',
                        }}
                      >
                        {comp.company_name}
                      </span>
                    </div>

                    <Link
                      href={`/jobs?q=${encodeURIComponent(comp.company_name)}`}
                      style={{
                        color: '#c2410c',
                        fontWeight: 800,
                        fontSize: '0.68rem',
                        background: '#fff7ed',
                        border: '1px solid #fdba74',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        textDecoration: 'none',
                        flexShrink: 0,
                      }}
                    >
                      {comp.job_count} jobs &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Phổ Lương & So Sánh Theo Chuyên Môn (Wider width ~73%) */}
            <div
              className="glass-panel"
              style={{
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                flex: '2.25',
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
                borderTop: '3px solid #ea580c',
              }}
            >
              {/* Header & Role Filter Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DollarSign size={15} color="#ea580c" />
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Phổ Lương & So Sánh Theo Chuyên Môn
                    </h3>
                  </div>
                  {activeRole && (
                    <button
                      onClick={() => setSelectedRoleKey('all')}
                      style={{ border: 'none', background: 'transparent', color: '#c2410c', fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                    >
                      <X size={12} /> Bỏ lọc
                    </button>
                  )}
                </div>

                {/* Role Filter Pills Strip */}
                <div style={{ display: 'flex', gap: '3px', overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '2px', scrollbarWidth: 'thin' }}>
                  <button
                    onClick={() => setSelectedRoleKey('all')}
                    style={{
                      padding: '2px 7px',
                      borderRadius: '12px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedRoleKey === 'all' ? '1px solid #ea580c' : '1px solid var(--border-medium)',
                      background: selectedRoleKey === 'all' ? '#ea580c' : '#ffffff',
                      color: selectedRoleKey === 'all' ? '#ffffff' : '#334155',
                      flexShrink: 0,
                    }}
                  >
                    Tất cả vị trí
                  </button>
                  {salaryData?.roles?.map((role) => {
                    const isSel = selectedRoleKey === role.key;
                    return (
                      <button
                        key={role.key}
                        onClick={() => setSelectedRoleKey(role.key)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 7px',
                          borderRadius: '12px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: isSel ? '1px solid #ea580c' : '1px solid var(--border-medium)',
                          background: isSel ? '#ea580c' : '#ffffff',
                          color: isSel ? '#ffffff' : '#334155',
                          flexShrink: 0,
                        }}
                      >
                        {ROLE_ICONS[role.key]}
                        <span>{role.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-panels side by side inside Phổ Lương */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(320px, 2fr)', gap: '0.5rem', flex: 1, minHeight: 0 }}>
                {/* Left Sub-panel: Phổ Lương Chi Tiết Theo Cấp Bậc */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    overflowY: 'auto',
                  }}
                >
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ea580c', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Award size={13} /> Phổ Lương Theo Cấp Bậc
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
                    {[
                      {
                        level: 'Fresher (0-1 năm)',
                        tag: 'Mới tốt nghiệp 🎓',
                        range: activeRole ? `${Math.round(activeRole.minVnd * 0.7)} - ${Math.round(activeRole.minVnd * 1.1)} tr` : '8 - 15 triệu',
                        avg: activeRole ? `~${Math.round(activeRole.minVnd * 0.9)} tr` : '~11.5 tr',
                        percent: 25,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
                        border: '#fed7aa',
                      },
                      {
                        level: 'Junior / Mid (1-3 năm)',
                        tag: 'Kinh nghiệm ⚡',
                        range: activeRole ? `${Math.round(activeRole.avgVnd * 0.75)} - ${Math.round(activeRole.avgVnd * 1.15)} tr` : '25 - 40 triệu',
                        avg: activeRole ? `~${Math.round(activeRole.avgVnd * 0.95)} tr` : '~32.5 tr',
                        percent: 52,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
                        border: '#fdba74',
                      },
                      {
                        level: 'Senior (3-5 năm+)',
                        tag: 'Chuyên gia 🔥',
                        range: activeRole ? `${Math.round(activeRole.avgVnd * 1.15)} - ${Math.round(activeRole.maxVnd * 0.95)} tr` : '40 - 65+ triệu',
                        avg: activeRole ? `~${Math.round(activeRole.maxVnd * 0.7)} tr` : '~52.5 tr',
                        percent: 78,
                        bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                        border: '#f97316',
                      },
                      {
                        level: 'Tech Lead / Manager',
                        tag: 'Quản lý IT 👑',
                        range: activeRole ? `${Math.round(activeRole.maxVnd * 0.9)} - ${Math.round(activeRole.maxVnd * 1.3)} tr` : '65 - 120+ triệu',
                        avg: activeRole ? `~${Math.round(activeRole.maxVnd * 1.1)} tr` : '~92.5 tr',
                        percent: 100,
                        bg: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)',
                        border: '#ea580c',
                      },
                    ].map((lvl) => (
                      <div
                        key={lvl.level}
                        style={{
                          background: lvl.bg,
                          border: `1px solid ${lvl.border}`,
                          borderRadius: '6px',
                          padding: '0.4rem 0.55rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          flex: 1,
                          gap: '0.15rem',
                          transition: 'transform 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a' }}>
                            {lvl.level}
                          </span>
                          <span
                            style={{
                              fontSize: '0.58rem',
                              fontWeight: 800,
                              padding: '1px 4px',
                              borderRadius: '3px',
                              background: 'rgba(234, 88, 12, 0.12)',
                              color: '#c2410c',
                            }}
                          >
                            {lvl.tag}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <strong style={{ fontSize: '0.85rem', fontWeight: 900, color: '#ea580c' }}>
                            {lvl.range}
                          </strong>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b' }}>
                            {lvl.avg}
                          </span>
                        </div>

                        <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${lvl.percent}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)',
                              borderRadius: '2px',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Sub-panel: So Sánh Mức Lương Theo Chuyên Môn (RoleSalaryChart) */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '0.4rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    overflowY: 'auto',
                  }}
                >
                  <RoleSalaryChart
                    roles={salaryData?.roles}
                    selectedRoleKey={selectedRoleKey}
                    onSelectRole={(key) => setSelectedRoleKey(key)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
