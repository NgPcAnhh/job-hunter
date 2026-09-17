'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ProvinceStat } from '@/types/job';
import {
  Compass,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

// Dynamic import Leaflet component with SSR disabled
const VietnamLeafletMap = dynamic(() => import('./VietnamLeafletMap'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '560px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        gap: '0.75rem',
      }}
    >
      <div
        className="animate-spin"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '3px solid #e2e8f0',
          borderTopColor: '#ea580c',
        }}
      />
      <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
        Đang tải bản đồ tương tác Việt Nam...
      </span>
    </div>
  ),
});

interface VietnamJobMapProps {
  provinces?: ProvinceStat[];
  totalUnified?: number;
}

export default function VietnamJobMap({
  provinces = [],
  totalUnified = 0,
}: VietnamJobMapProps) {
  const router = useRouter();
  const [selectedRegion, setSelectedRegion] = useState<
    'all' | 'north' | 'central' | 'south'
  >('all');

  const statMap = React.useMemo(() => {
    const map = new Map<string, ProvinceStat>();
    provinces.forEach((p) => {
      map.set(p.province.toLowerCase(), p);
    });
    return map;
  }, [provinces]);

  const getStat = (name: string): ProvinceStat => {
    return (
      statMap.get(name.toLowerCase()) || {
        province: name,
        jobCount: 0,
        companyCount: 0,
        percentage: 0,
      }
    );
  };

  const hnStat = getStat('Hà Nội');
  const dnStat = getStat('Đà Nẵng');
  const hcmStat = getStat('Hồ Chí Minh');

  const handleProvinceClick = (name: string) => {
    router.push(`/jobs?location=${encodeURIComponent(name)}`);
  };

  return (
    <div
      className="analytics-card"
      style={{
        padding: '1.75rem',
        position: 'relative',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
            }}
          >
            <span
              className="badge badge-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Compass size={13} /> Bản Đồ Địa Lý Việc Làm Tương Tác
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                color: '#64748b',
                fontWeight: 600,
              }}
            >
              Zoom In / Out • Di chuột xem chi tiết
            </span>
          </div>
          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            Mật Độ Phân Bổ Việc Làm & Doanh Nghiệp IT Việt Nam
          </h2>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '2px' }}>
            Bản đồ địa lý tương tác: 3 trung tâm đầu não và các vệ tinh công nghệ toàn quốc
          </p>
        </div>

        {/* Region Filter Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            background: '#f1f5f9',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          {[
            { id: 'all', label: 'Toàn quốc' },
            { id: 'north', label: 'Miền Bắc' },
            { id: 'central', label: 'Miền Trung' },
            { id: 'south', label: 'Miền Nam' },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRegion(r.id as any)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.775rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: selectedRegion === r.id ? '#ea580c' : 'transparent',
                color: selectedRegion === r.id ? '#ffffff' : '#475569',
                transition: 'all 0.15s ease',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Map Content Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left: Real Leaflet Interactive Map */}
        <div
          style={{
            height: '560px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
          }}
        >
          <VietnamLeafletMap
            provinces={provinces}
            selectedRegion={selectedRegion}
          />
        </div>

        {/* Right: Province Rankings & Regional Overview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* 3 Core Hubs Comparison Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}
          >
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Sparkles size={16} color="#ea580c" /> 3 Đại Đô Thị Công Nghệ Trọng Điểm
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* HN */}
              <div
                onClick={() => handleProvinceClick('Hà Nội')}
                style={{
                  padding: '0.65rem 0.85rem',
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#c2410c' }}>
                    🏛️ Hà Nội
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                    {hnStat.companyCount.toLocaleString()} doanh nghiệp IT
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ea580c' }}>
                    {hnStat.jobCount.toLocaleString()} jobs
                  </div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#c2410c' }}>
                    {hnStat.percentage}% thị phần
                  </div>
                </div>
              </div>

              {/* HCM */}
              <div
                onClick={() => handleProvinceClick('Hồ Chí Minh')}
                style={{
                  padding: '0.65rem 0.85rem',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#166534' }}>
                    🚀 TP. Hồ Chí Minh
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                    {hcmStat.companyCount.toLocaleString()} doanh nghiệp IT
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#16a34a' }}>
                    {hcmStat.jobCount.toLocaleString()} jobs
                  </div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#166534' }}>
                    {hcmStat.percentage}% thị phần
                  </div>
                </div>
              </div>

              {/* Da Nang */}
              <div
                onClick={() => handleProvinceClick('Đà Nẵng')}
                style={{
                  padding: '0.65rem 0.85rem',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0369a1' }}>
                    🌴 Đà Nẵng
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                    {dnStat.companyCount.toLocaleString()} doanh nghiệp IT
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0284c7' }}>
                    {dnStat.jobCount.toLocaleString()} jobs
                  </div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0369a1' }}>
                    {dnStat.percentage}% thị phần
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Other Emerging Tech Provinces Ranking */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}
          >
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <TrendingUp size={16} color="#0284c7" /> Các Tỉnh Thành Vệ Tinh Nổi Bật
            </h3>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            >
              {provinces
                .filter(
                  (p) =>
                    ![
                      'Hà Nội',
                      'Hồ Chí Minh',
                      'Đà Nẵng',
                      'Toàn quốc / Remote',
                      'Khác / Chưa rõ',
                    ].includes(p.province)
                )
                .slice(0, 6)
                .map((p, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleProvinceClick(p.province)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#fdba74';
                      e.currentTarget.style.background = '#fff7ed';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          color: '#64748b',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                        }}
                      >
                        #{idx + 4}
                      </span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.province}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{ color: '#475569', fontSize: '0.75rem' }}>
                        {p.companyCount} cty
                      </span>
                      <span style={{ color: '#ea580c', fontWeight: 800 }}>
                        {p.jobCount} jobs
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
