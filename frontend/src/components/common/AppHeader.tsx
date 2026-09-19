'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Clock,
  Briefcase,
  RefreshCw,
  Search,
  Menu,
  X,
  BarChart3,
  ChevronDown,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);

  // 1. Live Hanoi Time Clock (GMT+7)
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
    <header className="app-header" ref={menuRef}>
      {/* Left Area: Sidebar Toggle & Total Jobs Stat pill */}
      <div className="header-left">
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          style={{
            background: sidebarCollapsed ? '#ffffff' : '#fff7ed',
            borderColor: sidebarCollapsed ? 'var(--border-medium, #cbd5e1)' : '#fdba74',
            color: sidebarCollapsed ? '#334155' : '#c2410c',
          }}
          title={sidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
        >
          {sidebarCollapsed ? <Menu size={18} /> : <X size={18} />}
        </button>

        <div className="stat-pill">
          <Briefcase size={16} color="#ea580c" style={{ flexShrink: 0 }} />
          <div className="stat-pill-text">
            <span className="stat-pill-label">Thị trường:</span>
            <strong className="stat-pill-value">
              {totalJobs !== null ? `${totalJobs.toLocaleString('vi-VN')} việc làm` : 'Đang tính...'}
            </strong>
          </div>
        </div>

        <div className="platform-pill">
          <span className="platform-dot" />
          <span className="platform-text">{sourcesCount}/{sourcesCount} nền tảng hoạt động</span>
        </div>
      </div>

      {/* Right Area: Desktop items + Mobile menu toggle */}
      <div className="header-right">
        {/* Hanoi Clock */}
        <div className="clock-box" title="Giờ chuẩn Việt Nam (GMT+7 Hà Nội)">
          <Clock size={16} color="#ea580c" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span className="clock-time">
              {timeStr || '--:--:--'} <small className="clock-tz">VN</small>
            </span>
            <span className="clock-date">{dateStr || 'Thị trường mở'}</span>
          </div>
        </div>

        {/* Refresh Stats Button */}
        <button
          onClick={fetchStats}
          disabled={isRefreshing}
          className="btn btn-secondary refresh-btn"
          title="Làm mới thống kê thị trường"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>

        {/* Overview Link - Màn hình quan sát Button */}
        <Link
          href="/overview"
          className="btn overview-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
            color: '#ffffff',
            border: '1px solid #9a3412',
            padding: '0.45rem 0.95rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(234, 88, 12, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title="Mở Dashboard Quan sát tổng quan thị trường"
        >
          <BarChart3 size={15} color="#ffffff" style={{ flexShrink: 0 }} />
          <span className="overview-text">Màn hình quan sát</span>
          <span className="overview-live-dot" title="Trực quan hóa Live" />
        </Link>

        {/* Quick Search Link */}
        <Link href="/jobs" className="btn btn-primary search-link">
          <Search size={14} />
          <span>Tìm việc ngay</span>
        </Link>

        {/* Mobile Menu Toggle (visible only on mobile) */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen((v) => !v)}
          title="Menu"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Mobile Dropdown Panel */}
      <div className={`mobile-dropdown ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Clock row */}
        <div className="mobile-dropdown-row">
          <div className="clock-box" title="Giờ chuẩn Việt Nam (GMT+7 Hà Nội)" style={{ flex: 1 }}>
            <Clock size={16} color="#ea580c" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span className="clock-time">
                {timeStr || '--:--:--'} <small className="clock-tz">VN</small>
              </span>
              <span className="clock-date" style={{ display: 'block' }}>{dateStr || 'Thị trường mở'}</span>
            </div>
          </div>
          <button
            onClick={() => { fetchStats(); setMobileMenuOpen(false); }}
            disabled={isRefreshing}
            className="btn btn-secondary refresh-btn"
            title="Làm mới thống kê thị trường"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>

        {/* Action buttons */}
        <div className="mobile-dropdown-actions">
          <Link
            href="/overview"
            className="btn overview-link"
            title="Mở Dashboard Quan sát tổng quan thị trường"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              flex: 1,
              justifyContent: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              color: '#ffffff',
              border: '1px solid #9a3412',
              padding: '0.5rem 0.95rem',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.32)',
            }}
          >
            <BarChart3 size={15} color="#ffffff" style={{ flexShrink: 0 }} />
            <span className="overview-text">Màn hình quan sát</span>
            <span className="overview-live-dot" />
          </Link>
          <Link
            href="/jobs"
            className="btn btn-primary search-link"
            onClick={() => setMobileMenuOpen(false)}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <Search size={14} />
            <span>Tìm việc ngay</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
