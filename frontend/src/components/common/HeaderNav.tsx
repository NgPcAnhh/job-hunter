'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, TrendingUp } from 'lucide-react';

export default function HeaderNav() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Tổng quan', href: '/', icon: LayoutDashboard },
    { label: 'Danh sách việc làm', href: '/jobs', icon: Briefcase },
    { label: 'Xu hướng thị trường', href: '/trends', icon: TrendingUp },
  ];

  return (
    <nav style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
              gap: '0.5rem',
              padding: '0.5rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#f9fafb' : 'var(--text-secondary)',
              background: isActive ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
              border: isActive ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={16} color={isActive ? '#818cf8' : 'currentColor'} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
