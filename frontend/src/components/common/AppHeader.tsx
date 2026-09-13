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
} from 'lucide-react';

interface AppHeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export default function AppHeader({ sidebarCollapsed, onToggleSidebar }: AppHeaderProps) {
  const [totalJobs, setTotalJobs] = useState<number | null>(null);
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
        borderBottom: '1px solid #edf2f7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.75rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.03)',
      }}
    >
      {/* Left Area: Sidebar Toggle & Total Jobs Stat pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '7px 9px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            transition: 'all 0.15s ease',
          }}
          title={sidebarCollapsed ? 'Mở rộng Menu bên trái' : 'Thu gọn Menu'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: '999px',
            padding: '0.35rem 0.95rem',
          }}
        >
          <Briefcase size={16} color="#ff6b00" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>Thị trường:</span>
            <strong style={{ color: '#ea580c', fontWeight: 800 }}>
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
            color: '#16a34a',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            padding: '0.3rem 0.75rem',
            borderRadius: '999px',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#16a34a',
              display: 'inline-block',
              boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.2)',
            }}
          />
          <span style={{ fontWeight: 700 }}>7/7 nền tảng hoạt động</span>
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
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '0.4rem 0.85rem',
          }}
          title="Giờ chuẩn Việt Nam (GMT+7 Hà Nội)"
        >
          <Clock size={16} color="#ff6b00" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
              {timeStr || '--:--:--'} <small style={{ fontSize: '0.68rem', color: '#ea580c', fontWeight: 700 }}>VN</small>
            </span>
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
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
