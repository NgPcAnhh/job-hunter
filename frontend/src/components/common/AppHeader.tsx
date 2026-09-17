'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock,
  Briefcase,
  Layers,
  Sparkles,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
  Zap,
  Menu,
  X,
  BarChart3,
} from 'lucide-react';

interface AppHeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export default function AppHeader({ sidebarCollapsed, onToggleSidebar }: AppHeaderProps) {
  const [totalJobs, setTotalJobs] = useState<number | null>(null);
  const [sourcesCount, setSourcesCount] = useState<number>(9);
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // 1. Live Hanoi Time Clock (GMT+7)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format Hanoi Time (Asia/Bangkok / Asia/Ho_Chi_Minh)
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

  // 2. Fetch Total Jobs from API
  const fetchStats = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setTotalJobs(data.totalUnified || 0);
        if (data.sources && data.sources.length > 0) {
          setSourcesCount(data.sources.length);
        }
      }
    } catch (e) {
      console.error('Failed to fetch header stats:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <header
      style={{
        height: '68px',
        background: '#ffffff',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.75rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
      }}
    >
      {/* Left Area: Sidebar Toggle & Total Jobs Stat pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            background: sidebarCollapsed ? '#ffffff' : '#fff7ed',
            border: `1px solid ${sidebarCollapsed ? 'var(--border-medium)' : '#fdba74'}`,
            borderRadius: '8px',
            padding: '7px 9px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: sidebarCollapsed ? '#334155' : '#c2410c',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            transition: 'all 0.18s ease',
          }}
          title={sidebarCollapsed ? 'Mở rộng Sidebar (3 thanh ngang)' : 'Thu gọn Sidebar (Đóng)'}
        >
          {sidebarCollapsed ? (
            <Menu size={18} />
          ) : (
            <X size={18} />
          )}
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            background: '#fff7ed',
            border: '1px solid #fdba74',
            borderRadius: '999px',
            padding: '0.35rem 0.95rem',
          }}
        >
          <Briefcase size={16} color="#ea580c" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Thị trường:</span>
            <strong style={{ color: '#c2410c', fontWeight: 800 }}>
              {totalJobs !== null ? `${totalJobs.toLocaleString('vi-VN')} việc làm` : 'Đang tính...'}
            </strong>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.78rem',
            color: '#166534',
            background: '#dcfce7',
            border: '1px solid #86efac',
            padding: '0.3rem 0.75rem',
            borderRadius: '999px',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#15803d',
              display: 'inline-block',
              boxShadow: '0 0 0 2px rgba(22, 101, 52, 0.2)',
            }}
          />
          <span style={{ fontWeight: 700 }}>{sourcesCount}/{sourcesCount} nền tảng hoạt động</span>
        </div>
      </div>

      {/* Right Area: Hanoi Clock & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Hanoi Clock */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            background: '#f8fafc',
            border: '1px solid var(--border-medium)',
            borderRadius: '8px',
            padding: '0.4rem 0.85rem',
          }}
          title="Giờ chuẩn Việt Nam (GMT+7 Hà Nội)"
        >
          <Clock size={16} color="#ea580c" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
              {timeStr || '--:--:--'} <small style={{ fontSize: '0.68rem', color: '#c2410c', fontWeight: 700 }}>VN</small>
            </span>
            <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 500 }}>
              {dateStr || 'Thị trường mở'}
            </span>
          </div>
        </div>

        {/* Refresh Stats Button */}
        <button
          onClick={fetchStats}
          disabled={isRefreshing}
          className="btn btn-secondary"
          style={{ padding: '0.42rem 0.75rem', fontSize: '0.8rem' }}
          title="Làm mới thống kê thị trường"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>

        {/* PowerBI Overview Observation Screen Switcher Button (Cam chữ trắng + Hover ấn nút) */}
        <Link
          href="/overview"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
            color: '#ffffff',
            border: '1px solid #c2410c',
            padding: '0.42rem 0.85rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            fontWeight: 800,
            textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(234, 88, 12, 0.28)',
            transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 5px 14px rgba(234, 88, 12, 0.4)';
            e.currentTarget.style.background = 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(234, 88, 12, 0.28)';
            e.currentTarget.style.background = 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(1px)';
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(234, 88, 12, 0.2)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          title="Mở Dashboard Quan sát tổng quan thị trường"
        >
          <BarChart3 size={15} color="#ffffff" />
          <span>Màn hình quan sát</span>
        </Link>

        {/* Quick Search Shortcut Link */}
        <Link
          href="/jobs"
          className="btn btn-primary"
          style={{ padding: '0.45rem 0.95rem', fontSize: '0.825rem' }}
        >
          <Search size={14} />
          <span>Tìm việc ngay</span>
        </Link>
      </div>
    </header>
  );
}
