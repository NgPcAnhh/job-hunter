'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, TrendingUp } from 'lucide-react';

export default function HeaderNav() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Tổng quan', href: '/', icon: LayoutDashboard },
    { label: 'Danh sách việc làm', href: '/jobs', icon: Briefcase },
  ];

  return (
    <nav style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
              padding: '0.5rem 0.95rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#ea580c' : '#475467',
              background: isActive ? '#fff7ed' : 'transparent',
              border: isActive ? '1px solid #fed7aa' : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={17} color={isActive ? '#ff6b00' : '#64748b'} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
