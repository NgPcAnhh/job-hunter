'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  DollarSign,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { getSavedJobs } from '@/lib/savedJobs';

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();
  const [savedCount, setSavedCount] = useState<number>(0);

  const updateCount = () => {
    const list = getSavedJobs();
    setSavedCount(list.length);
  };

  useEffect(() => {
    updateCount();
    window.addEventListener('savedJobsUpdated', updateCount);
    return () => window.removeEventListener('savedJobsUpdated', updateCount);
  }, []);

  const navItems = [
    { label: 'Tổng quan Thị trường', shortLabel: 'Tổng quan', href: '/', icon: LayoutDashboard },
    { label: 'Xu hướng Kỹ năng', shortLabel: 'Kỹ năng', href: '/trends', icon: TrendingUp },
    { label: 'Ma trận Lương IT', shortLabel: 'Lương', href: '/salaries', icon: DollarSign },
    { label: 'Bộ lọc & Tìm Việc', shortLabel: 'Tìm việc', href: '/jobs', icon: Briefcase },
    {
      label: 'Việc làm đã lưu',
      shortLabel: 'Đã lưu',
      href: '/saved',
      icon: Bookmark,
      badge: savedCount > 0 ? savedCount : null,
    },
  ];

  return (
    <aside
      style={{
        width: collapsed ? '72px' : '240px',
        minWidth: collapsed ? '72px' : '240px',
        background: '#ffffff',
        borderRight: '1px solid var(--border-subtle)',
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 200,
        boxShadow: '1px 0 6px rgba(15, 23, 42, 0.03)',
      }}
    >
      {/* Top Brand / Logo */}
      <div>
        <div
          style={{
            padding: collapsed ? '1.15rem 0.5rem' : '1.15rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            height: '68px',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              overflow: 'hidden',
              textDecoration: 'none',
            }}
            title="Jobs Hunter Dashboard"
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.15rem',
                color: 'white',
                boxShadow: '0 3px 10px rgba(234, 88, 12, 0.3)',
                flexShrink: 0,
              }}
            >
              🎯
            </div>
            {!collapsed && (
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                    Jobs Hunter
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      background: '#fff7ed',
                      color: '#c2410c',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      border: '1px solid #fdba74',
                    }}
                  >
                    PRO
                  </span>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>IT Market Analytics</p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation Items */}
        <nav
          style={{
            padding: collapsed ? '0.75rem 0.4rem' : '0.85rem 0.65rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'space-between',
                  padding: collapsed ? '0.65rem' : '0.6rem 0.85rem',
                  borderRadius: '9px',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? '#c2410c' : '#334155',
                  background: isActive ? '#fff7ed' : 'transparent',
                  border: isActive ? '1px solid #fdba74' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                  textDecoration: 'none',
                  position: 'relative',
                }}
                title={collapsed ? item.label : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <Icon
                    size={18}
                    color={isActive ? '#ea580c' : '#64748b'}
                    style={{ flexShrink: 0 }}
                  />
                  {!collapsed && (
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span
                    style={{
                      background: isActive ? '#c2410c' : '#ffedd5',
                      color: isActive ? '#ffffff' : '#9a3412',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: collapsed ? '1px 4px' : '2px 7px',
                      borderRadius: '999px',
                      border: isActive ? 'none' : '1px solid #fed7aa',
                      position: collapsed ? 'absolute' : 'static',
                      top: collapsed ? '4px' : 'auto',
                      right: collapsed ? '4px' : 'auto',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Toggle for Collapsed State */}
      <div
        style={{
          padding: '0.75rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            style={{
              width: '100%',
              padding: '0.6rem 0',
              background: '#f8fafc',
              border: '1px solid var(--border-medium)',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Mở rộng Sidebar"
          >
            <ChevronRight size={18} />
          </button>
        ) : (
          <div
            style={{
              background: '#f8fafc',
              borderRadius: '10px',
              padding: '0.75rem 0.85rem',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sparkles size={13} color="#ea580c" />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
                Dữ liệu Supabase Live
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Đồng bộ 7 website tự động
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
