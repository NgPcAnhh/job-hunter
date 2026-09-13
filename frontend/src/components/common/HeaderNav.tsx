'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  DollarSign,
  Activity,
  Building2,
  Bookmark,
} from 'lucide-react';
import { getSavedJobs } from '@/lib/savedJobs';

export default function HeaderNav() {
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
    { label: 'Tổng quan', href: '/', icon: LayoutDashboard },
    { label: 'Xu hướng Kỹ năng', href: '/trends', icon: TrendingUp },
    { label: 'Ma trận Lương', href: '/salaries', icon: DollarSign },
    { label: 'Doanh nghiệp', href: '/companies', icon: Building2 },
    { label: 'Giám sát Pipeline', href: '/monitor', icon: Activity },
    { label: 'Bộ lọc Việc làm', href: '/jobs', icon: Briefcase },
    {
      label: 'Việc đã lưu',
      href: '/saved',
      icon: Bookmark,
      badge: savedCount > 0 ? savedCount : null,
    },
  ];

  return (
    <nav style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#ea580c' : '#475569',
              background: isActive ? '#fff7ed' : 'transparent',
              border: isActive ? '1px solid #fed7aa' : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={15} color={isActive ? '#ff6b00' : '#64748b'} />
            <span>{item.label}</span>
            {item.badge !== null && item.badge !== undefined && (
              <span
                style={{
                  background: isActive ? '#ea580c' : '#ffedd5',
                  color: isActive ? '#ffffff' : '#ea580c',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '999px',
                }}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
