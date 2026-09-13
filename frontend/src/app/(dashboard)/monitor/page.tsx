'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PipelineMonitorData } from '@/types/job';
import {
  Activity,
  ShieldCheck,
  Server,
  Layers,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Database,
  RefreshCw,
  ExternalLink,
  Cpu,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function MonitorPage() {
  const [data, setData] = useState<PipelineMonitorData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMonitor = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/monitor');
      if (!res.ok) throw new Error('Failed to load monitor data');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching monitor data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitor();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-primary">
              <Activity size={12} style={{ marginRight: '3px' }} />
              Live Infrastructure Telemetry
            </span>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              • Giám sát thời gian thực PostgreSQL Supabase Pooler
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Giám Sát Thu Thập & Khử Trùng Lặp
          </h1>
          <p style={{ color: '#475569', fontSize: '0.95rem' }}>
            Bảng điều khiển kiểm soát trạng thái hoạt động của 7 Spiders, hiệu quả khử trùng lặp 2-Stage và tiến trình cronjob GitHub Actions.
          </p>
        </div>

        <button onClick={fetchMonitor} className="btn btn-secondary" title="Cập nhật trạng thái">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Làm mới trạng thái
        </button>
      </div>

      {/* KPI Telemetry Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #ff6b00' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>TỔNG BẢN GHI CÀO THÔ (RAW)</span>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0f172a', margin: '0.35rem 0' }}>
            {loading ? '...' : data?.totalRawScraped || 0}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Trong 7 bảng riêng jobs_&lt;source&gt;</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #16a34a' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>TIN ĐÃ CHUẨN HÓA (UNIFIED)</span>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, color: '#16a34a', margin: '0.35rem 0' }}>
            {loading ? '...' : data?.totalUnifiedSaved || 0}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>● Đã lưu vào all_jobs_unified</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #ef4444' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>TIN TRÙNG LẶP ĐÃ GỘP</span>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, color: '#dc2626', margin: '0.35rem 0' }}>
            {loading ? '...' : data?.totalDuplicatesMerged || 0}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>Fuzzy Match ≥ 90%</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderTop: '3px solid #0284c7' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>TỶ LỆ LÀM SẠCH DỮ LIỆU</span>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0284c7', margin: '0.35rem 0' }}>
            {loading ? '...' : `${data?.overallDedupPercent || 0}%`}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Độ tinh gọn dữ liệu</span>
        </div>
      </div>

      {/* Spider Health & Status Table */}
      <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
              Trạng Thái 7 Spider Thu Thập Dữ Liệu
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Mỗi website hoạt động độc lập, lưu trữ vào bảng raw riêng biệt trước khi qua module khử trùng lặp
            </p>
          </div>
          <span className="badge badge-primary">3 Workers Song Song</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eef0f3', textAlign: 'left', color: '#64748b' }}>
              <th style={{ padding: '0.75rem' }}>Website Tuyển Dụng</th>
              <th style={{ padding: '0.75rem' }}>Engine Cào</th>
              <th style={{ padding: '0.75rem' }}>Bảng Dữ Liệu Raw</th>
              <th style={{ padding: '0.75rem' }}>Số Bản Ghi Raw</th>
              <th style={{ padding: '0.75rem' }}>Tin Hợp Nhất</th>
              <th style={{ padding: '0.75rem' }}>Trạng Thái</th>
              <th style={{ padding: '0.75rem', textAlign: 'right' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {data?.spiders.map((spider) => (
              <tr
                key={spider.source}
                style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}
                className="spider-row-hover"
              >
                <td style={{ padding: '0.85rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>
                  {spider.displayName}
                </td>
                <td style={{ padding: '0.85rem 0.75rem' }}>
                  <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', color: '#475569' }}>
                    {spider.engine}
                  </code>
                </td>
                <td style={{ padding: '0.85rem 0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                  {spider.rawTable}
                </td>
                <td style={{ padding: '0.85rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>
                  {spider.rawCount}
                </td>
                <td style={{ padding: '0.85rem 0.75rem', fontWeight: 700, color: '#ff6b00' }}>
                  {spider.unifiedCount}
                </td>
                <td style={{ padding: '0.85rem 0.75rem' }}>
                  <span
                    className="badge"
                    style={{
                      background: spider.status === 'ACTIVE' ? '#f0fdf4' : '#f8fafc',
                      color: spider.status === 'ACTIVE' ? '#16a34a' : '#64748b',
                      borderColor: spider.status === 'ACTIVE' ? '#bbf7d0' : '#e2e8f0',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    ● {spider.status}
                  </span>
                </td>
                <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>
                  <Link
                    href={`/jobs?source=${spider.source}`}
                    style={{ color: '#ff6b00', fontWeight: 700, fontSize: '0.825rem' }}
                  >
                    Xem việc làm &rarr;
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Architecture & Cron Schedule Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Card 1: Cron & Automation */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} color="#ff6b00" /> Lịch Trình Tự Động Hóa (GitHub Actions)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Tần suất thực thi:</span>
              <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                12:00 Trưa & 24:00 Đêm (Giờ Việt Nam UTC+7)
              </p>
              <code style={{ fontSize: '0.75rem', color: '#ff6b00' }}>Cron: 0 5,17 * * * (UTC)</code>
            </div>

            <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Cơ chế chạy song song:</span>
              <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                3 Workers đồng thời (ThreadPoolExecutor)
              </p>
              <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>Đã tối ưu bộ nhớ RAM, bảo vệ hạ tầng 100%</span>
            </div>
          </div>
        </div>

        {/* Card 2: Telegram Notifications */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Send size={18} color="#0284c7" /> Cảnh Báo Real-Time (Telegram Bot)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ padding: '0.85rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <span style={{ fontSize: '0.75rem', color: '#0369a1', display: 'block', fontWeight: 600 }}>Trạng thái Bot:</span>
              <p style={{ fontWeight: 700, color: '#0c4a6e', fontSize: '0.9rem' }}>
                ✅ Đã kết nối & Verified
              </p>
              <span style={{ fontSize: '0.75rem', color: '#0284c7' }}>Chat ID: 6204378947</span>
            </div>

            <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Nội dung thông báo:</span>
              <p style={{ fontSize: '0.825rem', color: '#334155', lineHeight: 1.5 }}>
                • Cảnh báo bắt đầu pipeline cào dữ liệu<br />
                • Báo cáo tiến độ từng website (Success/Failed)<br />
                • Báo cáo tổng hợp số lượng việc làm và tỷ lệ khử trùng lặp
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
