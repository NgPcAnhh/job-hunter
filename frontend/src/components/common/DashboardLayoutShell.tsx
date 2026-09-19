'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import AppSidebar from '@/components/common/AppSidebar';
import AppHeader from '@/components/common/AppHeader';

export default function DashboardLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const pathname = usePathname();

  // Read initial collapsed state from localStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem('jobs_hunter_sidebar_collapsed');
      if (saved !== null) {
        setCollapsed(JSON.parse(saved));
      }
    } catch {
      // Ignore
    }
  }, []);

  // For /overview route, render children directly in full screen mode without standard layout shell
  if (pathname === '/overview') {
    return <>{children}</>;
  }

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('jobs_hunter_sidebar_collapsed', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  return (
    <>
      <style jsx>{`
        .dashboard-main-content {
          flex: 1;
          padding: 1.75rem 2rem;
          max-width: 1440px;
          width: 100%;
          margin: 0 auto;
        }

        @media (max-width: 768px) {
          .dashboard-main-content {
            padding: 1rem 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .dashboard-main-content {
            padding: 0.75rem 0.5rem;
          }
        }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
        {/* 1. Left Collapsible Sidebar */}
        <AppSidebar collapsed={collapsed} onToggle={handleToggle} />

        {/* 2. Main Content Area */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Top Header */}
          <AppHeader sidebarCollapsed={collapsed} onToggleSidebar={handleToggle} />

          {/* Content Container */}
          <main className="dashboard-main-content">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
