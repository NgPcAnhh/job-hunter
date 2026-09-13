import type { Metadata } from 'next';
import DashboardLayoutShell from '@/components/common/DashboardLayoutShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jobs Hunter Dashboard | Thị Trường Việc Làm IT',
  description: 'Serverless Real-time IT Job Analytics & Market Insights Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <DashboardLayoutShell>
          {children}
        </DashboardLayoutShell>
      </body>
    </html>
  );
}
