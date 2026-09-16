'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProvinceStat } from '@/types/job';
import {
  MapPin,
  Briefcase,
  Building2,
  TrendingUp,
  ExternalLink,
  Info,
  Sparkles,
  Compass,
} from 'lucide-react';

interface VietnamJobMapProps {
  provinces?: ProvinceStat[];
  totalUnified?: number;
}

interface ProvinceNode {
  id: string;
  name: string;
  region: 'north' | 'central' | 'south';
  x: number; // percentage in SVG viewBox 0..400
  y: number; // percentage in SVG viewBox 0..800
  labelPosition?: 'left' | 'right' | 'top' | 'bottom';
  isKeyHub?: boolean;
}

const PROVINCE_NODES: ProvinceNode[] = [
  // Miền Bắc
  { id: 'hanoi', name: 'Hà Nội', region: 'north', x: 185, y: 145, isKeyHub: true, labelPosition: 'left' },
  { id: 'haiphong', name: 'Hải Phòng', region: 'north', x: 235, y: 155, labelPosition: 'right' },
  { id: 'quangninh', name: 'Quảng Ninh', region: 'north', x: 260, y: 130, labelPosition: 'right' },
  { id: 'bacninh', name: 'Bắc Ninh', region: 'north', x: 205, y: 130, labelPosition: 'top' },
  { id: 'hungyen', name: 'Hưng Yên', region: 'north', x: 205, y: 165, labelPosition: 'right' },
  { id: 'haiduong', name: 'Hải Dương', region: 'north', x: 220, y: 145, labelPosition: 'right' },
  { id: 'vinhphuc', name: 'Vĩnh Phúc', region: 'north', x: 165, y: 125, labelPosition: 'left' },
  { id: 'thainguyen', name: 'Thái Nguyên', region: 'north', x: 185, y: 105, labelPosition: 'top' },
  { id: 'bacgiang', name: 'Bắc Giang', region: 'north', x: 220, y: 120, labelPosition: 'right' },
  { id: 'namdinh', name: 'Nam Định', region: 'north', x: 200, y: 190, labelPosition: 'right' },
  { id: 'thanhhoa', name: 'Thanh Hóa', region: 'north', x: 165, y: 225, labelPosition: 'left' },
  { id: 'nghean', name: 'Nghệ An', region: 'north', x: 150, y: 270, labelPosition: 'left' },

  // Miền Trung
  { id: 'danang', name: 'Đà Nẵng', region: 'central', x: 275, y: 410, isKeyHub: true, labelPosition: 'right' },
  { id: 'thuathienhue', name: 'Thừa Thiên Huế', region: 'central', x: 235, y: 375, labelPosition: 'left' },
  { id: 'quangnam', name: 'Quảng Nam', region: 'central', x: 265, y: 445, labelPosition: 'right' },
  { id: 'quangngai', name: 'Quảng Ngãi', region: 'central', x: 285, y: 475, labelPosition: 'right' },
  { id: 'binhdinh', name: 'Bình Định', region: 'central', x: 295, y: 520, labelPosition: 'right' },
  { id: 'khanhhoa', name: 'Khánh Hòa', region: 'central', x: 305, y: 610, labelPosition: 'right' },
  { id: 'lamdong', name: 'Lâm Đồng', region: 'central', x: 260, y: 645, labelPosition: 'left' },

  // Miền Nam
  { id: 'hochiminh', name: 'Hồ Chí Minh', region: 'south', x: 205, y: 700, isKeyHub: true, labelPosition: 'right' },
  { id: 'binhduong', name: 'Bình Dương', region: 'south', x: 215, y: 670, labelPosition: 'left' },
  { id: 'dongnai', name: 'Đồng Nai', region: 'south', x: 240, y: 685, labelPosition: 'right' },
  { id: 'bariavungtau', name: 'Bà Rịa - Vũng Tàu', region: 'south', x: 245, y: 725, labelPosition: 'right' },
  { id: 'longan', name: 'Long An', region: 'south', x: 175, y: 715, labelPosition: 'left' },
  { id: 'tiengiang', name: 'Tiền Giang', region: 'south', x: 170, y: 740, labelPosition: 'left' },
  { id: 'cantho', name: 'Cần Thơ', region: 'south', x: 150, y: 760, labelPosition: 'left' },
  { id: 'kiengiang', name: 'Kiên Giang', region: 'south', x: 105, y: 765, labelPosition: 'left' },
  { id: 'camau', name: 'Cà Mau', region: 'south', x: 120, y: 815, labelPosition: 'bottom' },
];

export default function VietnamJobMap({ provinces = [], totalUnified = 0 }: VietnamJobMapProps) {
  const router = useRouter();
  const [selectedRegion, setSelectedRegion] = useState<'all' | 'north' | 'central' | 'south'>('all');
  const [hoveredNode, setHoveredNode] = useState<{
    node: ProvinceNode;
    stat: ProvinceStat;
    clientX: number;
    clientY: number;
  } | null>(null);

  // Map province stats by normalized name
  const statMap = useMemo(() => {
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

  // Key Hub stats
  const hnStat = getStat('Hà Nội');
  const dnStat = getStat('Đà Nẵng');
  const hcmStat = getStat('Hồ Chí Minh');

  const filteredNodes = useMemo(() => {
    if (selectedRegion === 'all') return PROVINCE_NODES;
    return PROVINCE_NODES.filter((n) => n.region === selectedRegion);
  }, [selectedRegion]);

  const handleProvinceClick = (name: string) => {
    router.push(`/jobs?location=${encodeURIComponent(name)}`);
  };

  return (
    <div
      className="analytics-card"
      style={{
        padding: '1.75rem',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
      }}
    >
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Compass size={13} /> Bản Đồ Địa Lý Việc Làm
            </span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
              63 Tỉnh Thành Toàn Quốc
            </span>
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Mật Độ Phân Bổ Việc Làm & Doanh Nghiệp IT Việt Nam
          </h2>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '2px' }}>
            Khảo sát thực tế cơ hội nghề nghiệp tại 3 trung tâm đầu não và các vệ tinh công nghệ
          </p>
        </div>

        {/* Region Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'center' }}>
        {/* Left: Vietnam Interactive SVG Map */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '520px',
            margin: '0 auto',
            minHeight: '560px',
            background: 'radial-gradient(circle at 50% 50%, #f8fafc 0%, #f1f5f9 100%)',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Vietnam Regional S-Shape Vector Silhouette */}
          <svg
            viewBox="0 0 400 860"
            style={{ width: '100%', height: 'auto', maxHeight: '540px', filter: 'drop-shadow(0 8px 24px rgba(15, 23, 42, 0.08))' }}
          >
            {/* Vietnam Contour / Silhouette Paths */}
            <defs>
              <linearGradient id="vietnamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fde047" stopOpacity="0.4" />
                <stop offset="35%" stopColor="#fdba74" stopOpacity="0.5" />
                <stop offset="65%" stopColor="#fb923c" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#ea580c" stopOpacity="0.7" />
              </linearGradient>

              <radialGradient id="hubPulseHanoi" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="hubPulseDanang" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="hubPulseHCM" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#16a34a" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Northern Silhouette */}
            <path
              d="M 120 70 C 160 40, 260 40, 280 90 C 290 120, 270 160, 240 180 C 200 200, 150 180, 130 140 Z"
              fill="#e2e8f0"
              stroke="#cbd5e1"
              strokeWidth="2"
              opacity="0.85"
            />

            {/* Coastline S-Curve connecting North to Central and South */}
            <path
              d="M 235 170 
                 C 200 220, 160 250, 145 300 
                 C 140 340, 210 370, 250 395 
                 C 290 420, 280 470, 290 520 
                 C 300 580, 315 620, 285 660 
                 C 260 700, 210 690, 195 725 
                 C 180 760, 140 780, 110 820
                 C 90 800, 120 750, 150 730
                 C 180 710, 210 650, 230 580
                 C 250 510, 220 440, 190 380
                 C 150 330, 115 280, 135 210
                 Z"
              fill="url(#vietnamGrad)"
              stroke="#ea580c"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Hoang Sa & Truong Sa Islands symbols */}
            <g opacity="0.85">
              {/* Hoang Sa */}
              <circle cx="340" cy="380" r="4" fill="#ea580c" />
              <circle cx="350" cy="390" r="3" fill="#ea580c" />
              <text x="330" y="365" fontSize="10" fontWeight="700" fill="#64748b">
                QĐ. Hoàng Sa
              </text>

              {/* Truong Sa */}
              <circle cx="330" cy="620" r="4" fill="#ea580c" />
              <circle cx="345" cy="635" r="3.5" fill="#ea580c" />
              <circle cx="320" cy="645" r="3" fill="#ea580c" />
              <text x="315" y="605" fontSize="10" fontWeight="700" fill="#64748b">
                QĐ. Trường Sa
              </text>
            </g>

            {/* Phu Quoc Island */}
            <circle cx="85" cy="770" r="7" fill="#16a34a" opacity="0.9" />
            <text x="50" y="760" fontSize="9.5" fontWeight="700" fill="#475569">
              Phú Quốc
            </text>

            {/* Radar Pulses for Big 3 Hubs */}
            <circle cx="185" cy="145" r="24" fill="url(#hubPulseHanoi)" className="animate-pulse" />
            <circle cx="275" cy="410" r="20" fill="url(#hubPulseDanang)" className="animate-pulse" />
            <circle cx="205" cy="700" r="28" fill="url(#hubPulseHCM)" className="animate-pulse" />

            {/* Pointer Lines to Permanent Callouts */}
            {/* Hanoi Pointer Line */}
            <path d="M 185 145 L 85 110" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="85" cy="110" r="3" fill="#ea580c" />

            {/* Da Nang Pointer Line */}
            <path d="M 275 410 L 335 440" stroke="#0284c7" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="335" cy="440" r="3" fill="#0284c7" />

            {/* Ho Chi Minh Pointer Line */}
            <path d="M 205 700 L 95 670" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="95" cy="670" r="3" fill="#16a34a" />

            {/* Interactive Province Nodes */}
            {filteredNodes.map((node) => {
              const stat = getStat(node.name);
              const isHub = node.isKeyHub;
              const hasJobs = stat.jobCount > 0;

              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onClick={() => handleProvinceClick(node.name)}
                  onMouseEnter={(e) => {
                    if (!isHub) {
                      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                      setHoveredNode({
                        node,
                        stat,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top - 10,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    if (!isHub) setHoveredNode(null);
                  }}
                >
                  {/* Outer circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isHub ? 8 : hasJobs ? 5.5 : 3.5}
                    fill={isHub ? (node.id === 'hanoi' ? '#ea580c' : node.id === 'danang' ? '#0284c7' : '#16a34a') : hasJobs ? '#ea580c' : '#94a3b8'}
                    stroke="#ffffff"
                    strokeWidth={isHub ? 2.5 : 1.5}
                    opacity={hasJobs ? 1 : 0.6}
                  />

                  {/* Inner dot */}
                  {isHub && <circle cx={node.x} cy={node.y} r={3} fill="#ffffff" />}

                  {/* Province Label */}
                  {!isHub && (
                    <text
                      x={node.labelPosition === 'left' ? node.x - 8 : node.x + 8}
                      y={node.labelPosition === 'top' ? node.y - 6 : node.labelPosition === 'bottom' ? node.y + 12 : node.y + 3}
                      textAnchor={node.labelPosition === 'left' ? 'end' : 'start'}
                      fontSize="9"
                      fontWeight="600"
                      fill={hasJobs ? '#0f172a' : '#64748b'}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* PERMANENT CALLOUT 1: HÀ NỘI (Top Left) */}
          <div
            onClick={() => handleProvinceClick('Hà Nội')}
            style={{
              position: 'absolute',
              top: '25px',
              left: '12px',
              background: '#ffffff',
              border: '2px solid #ea580c',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              boxShadow: '0 8px 24px rgba(234, 88, 12, 0.2)',
              cursor: 'pointer',
              minWidth: '155px',
              zIndex: 10,
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', marginBottom: '2px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#c2410c', display: 'flex', alignItems: 'center', gap: '3px' }}>
                🏛️ Hà Nội
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#fff7ed', color: '#ea580c', padding: '1px 5px', borderRadius: '4px' }}>
                {hnStat.percentage}%
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 700 }}>
              💼 {hnStat.jobCount.toLocaleString()} <span style={{ fontWeight: 500, color: '#64748b' }}>việc làm</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
              🏢 {hnStat.companyCount.toLocaleString()} <span style={{ fontWeight: 500, color: '#64748b' }}>công ty</span>
            </div>
          </div>

          {/* PERMANENT CALLOUT 2: ĐÀ NẴNG (Middle Right) */}
          <div
            onClick={() => handleProvinceClick('Đà Nẵng')}
            style={{
              position: 'absolute',
              top: '255px',
              right: '12px',
              background: '#ffffff',
              border: '2px solid #0284c7',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              boxShadow: '0 8px 24px rgba(2, 132, 199, 0.2)',
              cursor: 'pointer',
              minWidth: '155px',
              zIndex: 10,
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', marginBottom: '2px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '3px' }}>
                🌴 Đà Nẵng
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#f0f9ff', color: '#0284c7', padding: '1px 5px', borderRadius: '4px' }}>
                {dnStat.percentage}%
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 700 }}>
              💼 {dnStat.jobCount.toLocaleString()} <span style={{ fontWeight: 500, color: '#64748b' }}>việc làm</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
              🏢 {dnStat.companyCount.toLocaleString()} <span style={{ fontWeight: 500, color: '#64748b' }}>công ty</span>
            </div>
          </div>

          {/* PERMANENT CALLOUT 3: TP. HỒ CHÍ MINH (Bottom Left) */}
          <div
            onClick={() => handleProvinceClick('Hồ Chí Minh')}
            style={{
              position: 'absolute',
              bottom: '50px',
              left: '12px',
              background: '#ffffff',
              border: '2px solid #16a34a',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              boxShadow: '0 8px 24px rgba(22, 163, 74, 0.2)',
              cursor: 'pointer',
              minWidth: '165px',
              zIndex: 10,
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', marginBottom: '2px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px' }}>
                🚀 TP. Hồ Chí Minh
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', padding: '1px 5px', borderRadius: '4px' }}>
                {hcmStat.percentage}%
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 700 }}>
              💼 {hcmStat.jobCount.toLocaleString()} <span style={{ fontWeight: 500, color: '#64748b' }}>việc làm</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
              🏢 {hcmStat.companyCount.toLocaleString()} <span style={{ fontWeight: 500, color: '#64748b' }}>công ty</span>
            </div>
          </div>

          {/* DYNAMIC HOVER TOOLTIP FOR OTHER PROVINCES */}
          {hoveredNode && !hoveredNode.node.isKeyHub && (
            <div
              style={{
                position: 'fixed',
                left: `${hoveredNode.clientX}px`,
                top: `${hoveredNode.clientY}px`,
                transform: 'translate(-50%, -100%)',
                background: '#0f172a',
                color: '#ffffff',
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.775rem',
                boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
                pointerEvents: 'none',
                zIndex: 9999,
                minWidth: '140px',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#fdba74', marginBottom: '3px' }}>
                📍 {hoveredNode.node.name}
              </div>
              <div>💼 Việc làm: <strong>{hoveredNode.stat.jobCount}</strong> ({hoveredNode.stat.percentage}%)</div>
              <div>🏢 Công ty: <strong>{hoveredNode.stat.companyCount}</strong></div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '3px' }}>
                Nhấp để lọc danh sách việc ➔
              </div>
            </div>
          )}
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
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#c2410c' }}>🏛️ Hà Nội</div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>{hnStat.companyCount} doanh nghiệp IT</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ea580c' }}>{hnStat.jobCount} jobs</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#c2410c' }}>{hnStat.percentage}% thị phần</div>
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
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#166534' }}>🚀 TP. Hồ Chí Minh</div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>{hcmStat.companyCount} doanh nghiệp IT</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#16a34a' }}>{hcmStat.jobCount} jobs</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#166534' }}>{hcmStat.percentage}% thị phần</div>
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
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0369a1' }}>🌴 Đà Nẵng</div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>{dnStat.companyCount} doanh nghiệp IT</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0284c7' }}>{dnStat.jobCount} jobs</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0369a1' }}>{dnStat.percentage}% thị phần</div>
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
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <TrendingUp size={16} color="#0284c7" /> Các Tỉnh Thành Vệ Tinh Nổi Bật
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
              {provinces
                .filter((p) => !['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Toàn quốc / Remote', 'Khác / Chưa rõ'].includes(p.province))
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
                      <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.75rem' }}>#{idx + 4}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.province}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{ color: '#475569', fontSize: '0.75rem' }}>{p.companyCount} cty</span>
                      <span style={{ color: '#ea580c', fontWeight: 800 }}>{p.jobCount} jobs</span>
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
