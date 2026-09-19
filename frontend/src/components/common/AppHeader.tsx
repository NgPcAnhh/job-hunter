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
    <>
      <style jsx>{`
        .app-header {
          height: 68px;
          background: #ffffff;
          border-bottom: 1px solid var(--border-subtle, #e2e8f0);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.75rem;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          min-width: 0;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .sidebar-toggle-btn {
          background: ${sidebarCollapsed ? '#ffffff' : '#fff7ed'};
          border: 1px solid ${sidebarCollapsed ? 'var(--border-medium, #cbd5e1)' : '#fdba74'};
          border-radius: 8px;
          padding: 7px 9px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${sidebarCollapsed ? '#334155' : '#c2410c'};
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          transition: all 0.18s ease;
          flex-shrink: 0;
        }

        .sidebar-toggle-btn:hover {
          background: #fff7ed;
          border-color: #fdba74;
        }

        .stat-pill {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          background: #fff7ed;
          border: 1px solid #fdba74;
          border-radius: 999px;
          padding: 0.35rem 0.95rem;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .stat-pill-text {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.85rem;
        }

        .stat-pill-label {
          color: #475569;
          font-weight: 600;
        }

        .stat-pill-value {
          color: #c2410c;
          font-weight: 800;
        }

        .platform-pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.78rem;
          color: #166534;
          background: #dcfce7;
          border: 1px solid #86efac;
          padding: 0.3rem 0.75rem;
          border-radius: 999px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .platform-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #15803d;
          display: inline-block;
          box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.2);
          flex-shrink: 0;
        }

        .platform-text {
          font-weight: 700;
        }

        .clock-box {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          background: #f8fafc;
          border: 1px solid var(--border-medium, #cbd5e1);
          border-radius: 8px;
          padding: 0.4rem 0.85rem;
          flex-shrink: 0;
        }

        .clock-time {
          font-size: 0.875rem;
          font-weight: 800;
          color: #0f172a;
          font-family: var(--font-mono, monospace);
          line-height: 1.15;
        }

        .clock-tz {
          font-size: 0.68rem;
          color: #c2410c;
          font-weight: 700;
        }

        .clock-date {
          font-size: 0.68rem;
          color: #475569;
          font-weight: 500;
          line-height: 1.15;
        }

        .refresh-btn {
          padding: 0.42rem 0.75rem;
          font-size: 0.8rem;
          flex-shrink: 0;
        }

        .overview-link {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
          color: #ffffff;
          border: 1px solid #c2410c;
          padding: 0.42rem 0.85rem;
          border-radius: 8px;
          font-size: 0.825rem;
          font-weight: 800;
          text-decoration: none;
          box-shadow: 0 2px 8px rgba(234, 88, 12, 0.28);
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .overview-link:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 14px rgba(234, 88, 12, 0.4);
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
        }

        .overview-link:active {
          transform: translateY(1px);
          box-shadow: 0 1px 4px rgba(234, 88, 12, 0.2);
        }

        .search-link {
          padding: 0.45rem 0.95rem;
          font-size: 0.825rem;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Mobile menu toggle - hidden on desktop */
        .mobile-menu-toggle {
          display: none;
          background: #f8fafc;
          border: 1px solid var(--border-medium, #cbd5e1);
          border-radius: 8px;
          padding: 7px 9px;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          color: #334155;
          transition: all 0.18s ease;
          flex-shrink: 0;
        }

        .mobile-menu-toggle:hover {
          background: #fff7ed;
          border-color: #fdba74;
          color: #c2410c;
        }

        /* Mobile dropdown panel */
        .mobile-dropdown {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #ffffff;
          border-bottom: 1px solid var(--border-subtle, #e2e8f0);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
          padding: 1rem 1.25rem;
          flex-direction: column;
          gap: 0.75rem;
          z-index: 99;
          animation: slideDown 0.2s ease-out;
        }

        .mobile-dropdown.open {
          display: flex;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .mobile-dropdown-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .mobile-dropdown-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        /* ======================== */
        /* RESPONSIVE BREAKPOINTS  */
        /* ======================== */

        /* Tablet: 769px - 1024px */
        @media (max-width: 1024px) {
          .app-header {
            padding: 0 1rem;
            gap: 0.5rem;
          }

          .header-left {
            gap: 0.5rem;
          }

          .header-right {
            gap: 0.5rem;
          }

          .platform-pill {
            display: none;
          }

          .stat-pill-label {
            display: none;
          }

          .overview-link span,
          .refresh-btn span {
            display: none;
          }

          .overview-link {
            padding: 0.42rem 0.6rem;
          }

          .refresh-btn {
            padding: 0.42rem 0.55rem;
          }

          .clock-date {
            display: none;
          }
        }

        /* Mobile: max 768px */
        @media (max-width: 768px) {
          .app-header {
            height: 56px;
            padding: 0 0.75rem;
            position: relative;
          }

          .header-left {
            gap: 0.5rem;
          }

          /* On mobile, hide everything in header-right except the mobile menu toggle */
          .header-right > *:not(.mobile-menu-toggle) {
            display: none;
          }

          .mobile-menu-toggle {
            display: flex;
          }

          .mobile-dropdown {
            /* Will show when .open class is added */
          }

          .stat-pill-label {
            display: inline;
          }

          .stat-pill {
            padding: 0.3rem 0.7rem;
            font-size: 0.8rem;
          }

          .platform-pill {
            display: flex;
          }

          .overview-link span {
            display: inline;
          }

          .refresh-btn span {
            display: inline;
          }
        }

        /* Extra small: max 480px */
        @media (max-width: 480px) {
          .app-header {
            height: 50px;
            padding: 0 0.5rem;
          }

          .stat-pill {
            padding: 0.25rem 0.6rem;
          }

          .stat-pill-label {
            display: none;
          }

          .stat-pill-text {
            font-size: 0.78rem;
          }

          .mobile-dropdown {
            padding: 0.75rem 0.75rem;
          }

          .mobile-dropdown-actions {
            flex-direction: column;
          }

          .mobile-dropdown-actions > * {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>

      <header className="app-header" ref={menuRef}>
        {/* Left Area: Sidebar Toggle & Total Jobs Stat pill */}
        <div className="header-left">
          <button
            className="sidebar-toggle-btn"
            onClick={onToggleSidebar}
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

          {/* Overview Link */}
          <Link href="/overview" className="overview-link" title="Mở Dashboard Quan sát tổng quan thị trường">
            <BarChart3 size={15} color="#ffffff" />
            <span>Màn hình quan sát</span>
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
              className="overview-link"
              title="Mở Dashboard Quan sát tổng quan thị trường"
              onClick={() => setMobileMenuOpen(false)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <BarChart3 size={15} color="#ffffff" />
              <span>Màn hình quan sát</span>
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
    </>
  );
}
