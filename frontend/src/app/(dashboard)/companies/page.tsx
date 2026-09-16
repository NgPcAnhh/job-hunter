'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { CompanyOverviewItem, IndustrySectorItem } from '@/types/job';
import {
  Building2,
  Search,
  MapPin,
  Briefcase,
  Layers,
  ChevronRight,
  TrendingUp,
  ExternalLink,
  Users,
  Filter,
} from 'lucide-react';

export default function CompaniesDashboardPage() {
  const [companies, setCompanies] = useState<CompanyOverviewItem[]>([]);
  const [sectors, setSectors] = useState<IndustrySectorItem[]>([]);
  const [totalCompanies, setTotalCompanies] = useState<number>(0);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('all');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch('/api/analytics/companies');
        if (!res.ok) throw new Error('Failed to load companies analytics');
        const data = await res.json();
        setCompanies(data.companies || []);
        setSectors(data.sectors || []);
        setTotalCompanies(data.totalCompanies || 0);
        setTotalJobs(data.totalJobs || 0);
      } catch (err) {
        console.error('Error fetching companies:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter companies
  const filteredCompanies = useMemo(() => {
    return companies.filter((comp) => {
      const matchSearch =
        !searchTerm ||
        comp.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.sample_titles.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchSector = selectedSector === 'all' || comp.industry_sector === selectedSector;
      return matchSearch && matchSector;
    });
  }, [companies, searchTerm, selectedSector]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Top Banner */}
      <div className="analytics-card" style={{ padding: '1.5rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-primary">Landscape Doanh Nghiệp</span>
              <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Thị trường tuyển dụng IT</span>
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              Bản Đồ Nhà Tuyển Dụng & Phân Khúc Ngành Nghề
            </h1>
            <p style={{ color: '#334155', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Khám phá tổng thể các doanh nghiệp đang mở nhiều vị trí nhất, cấu trúc lĩnh vực (Fintech, Outsourcing, E-commerce, Game...) và địa bàn tuyển dụng trọng điểm.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: '#f8fafc', padding: '0.75rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Tổng doanh nghiệp</span>
              <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#c2410c' }}>
                {totalCompanies.toLocaleString('vi-VN')}
              </p>
            </div>
            <div style={{ background: '#f8fafc', padding: '0.75rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Tin tuyển dụng hoạt động</span>
              <p style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                {totalJobs.toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sector Breakdown Overview */}
      <div className="analytics-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Layers size={18} color="#ea580c" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
            Phân Bố Việc Làm Theo Phân Khúc Doanh Nghiệp
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {sectors.map((sec) => (
            <div
              key={sec.sector}
              onClick={() => setSelectedSector(selectedSector === sec.sector ? 'all' : sec.sector)}
              style={{
                background: selectedSector === sec.sector ? '#fff7ed' : '#ffffff',
                border: selectedSector === sec.sector ? '1.5px solid #ea580c' : '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                  {sec.sector}
                </span>
                <span
                  style={{
                    background: '#f1f5f9',
                    color: '#1e293b',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {sec.count} jobs ({sec.percentage}%)
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ background: '#e2e8f0', height: '6px', borderRadius: '3px', margin: '0.65rem 0', overflow: 'hidden' }}>
                <div
                  style={{
                    background: 'var(--accent-gradient)',
                    height: '100%',
                    width: `${Math.min(100, Math.max(8, sec.percentage))}%`,
                    borderRadius: '3px',
                  }}
                />
              </div>

              <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                Doanh nghiệp tiêu biểu:{' '}
                <span style={{ fontWeight: 700, color: '#0f172a' }}>
                  {sec.topCompanies.join(', ') || 'Đang cập nhật'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="analytics-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="filter-select"
              placeholder="Tìm theo tên công ty hoặc vị trí tuyển..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: '12px',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Filter size={15} color="#475569" />
            <select
              className="filter-select"
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              style={{ minWidth: '180px', border: '1px solid var(--border-medium)', borderRadius: '8px', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
            >
              <option value="all">Tất cả ngành nghề</option>
              {sectors.map((s) => (
                <option key={s.sector} value={s.sector}>
                  {s.sector} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {(searchTerm || selectedSector !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedSector('all');
              }}
              style={{
                background: '#f8fafc',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '0.45rem 0.8rem',
                fontSize: '0.8rem',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Xóa bộ lọc
            </button>
          )}

          <span style={{ fontSize: '0.85rem', color: '#475569', marginLeft: 'auto', fontWeight: 500 }}>
            Hiển thị <strong style={{ color: '#0f172a' }}>{filteredCompanies.length}</strong> doanh nghiệp
          </span>
        </div>
      </div>

      {/* Companies Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
          Đang tải dữ liệu bản đồ doanh nghiệp...
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="analytics-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#475569', fontWeight: 600 }}>Không tìm thấy doanh nghiệp phù hợp với từ khóa.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {filteredCompanies.map((comp) => (
            <div
              key={comp.company_name}
              className="analytics-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '1.25rem',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div>
                {/* Header: Logo + Name + Sector */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  {comp.company_logo ? (
                    <img
                      src={comp.company_logo}
                      alt={comp.company_name}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '10px',
                        objectFit: 'contain',
                        background: 'white',
                        border: '1px solid var(--border-medium)',
                        padding: '3px',
                        flexShrink: 0,
                      }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '10px',
                        background: 'var(--accent-gradient)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '1.15rem',
                        flexShrink: 0,
                        boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
                      }}
                    >
                      {comp.company_name?.charAt(0)?.toUpperCase() || 'C'}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: '#c2410c',
                        background: '#fff7ed',
                        border: '1px solid #fdba74',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        display: 'inline-block',
                        marginBottom: '0.2rem',
                      }}
                    >
                      {comp.industry_sector}
                    </span>
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={comp.company_name}
                    >
                      {comp.company_name}
                    </h3>
                  </div>
                </div>

                {/* Locations & Open Positions */}
                <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: '#334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MapPin size={14} color="#ea580c" />
                    <span>{comp.locations.join(', ') || 'Toàn quốc'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Briefcase size={14} color="#64748b" />
                    <span>
                      Đang tuyển: <strong style={{ color: '#c2410c' }}>{comp.job_count}</strong> vị trí
                    </span>
                  </div>
                </div>

                {/* Sample Positions */}
                <div style={{ marginTop: '0.75rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                    VỊ TRÍ NỔI BẬT:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {comp.sample_titles.map((title, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.78rem',
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: 500,
                        }}
                        title={title}
                      >
                        • {title}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Link to Jobs Filter */}
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                <Link
                  href={`/jobs?q=${encodeURIComponent(comp.company_name)}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#c2410c',
                    textDecoration: 'none',
                  }}
                >
                  <span>Xem {comp.job_count} việc làm đang tuyển</span>
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
