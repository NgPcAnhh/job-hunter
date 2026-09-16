'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ProvinceStat } from '@/types/job';

interface VietnamLeafletMapProps {
  provinces?: ProvinceStat[];
  selectedRegion?: 'all' | 'north' | 'central' | 'south';
}

interface GeoPoint {
  id: string;
  name: string;
  aliases: string[];
  region: 'north' | 'central' | 'south';
  lat: number;
  lng: number;
  isKeyHub?: boolean;
}

// Baseline database snapshot (4,499 real jobs) ensuring numbers are never blank
const BASELINE_STATS: Record<
  string,
  { jobCount: number; companyCount: number; percentage: number }
> = {
  'hà nội': { jobCount: 1442, companyCount: 830, percentage: 32.1 },
  'hồ chí minh': { jobCount: 1143, companyCount: 759, percentage: 25.4 },
  'đà nẵng': { jobCount: 63, companyCount: 44, percentage: 1.4 },
  'hải phòng': { jobCount: 120, companyCount: 79, percentage: 2.7 },
  'bắc ninh': { jobCount: 101, companyCount: 70, percentage: 2.2 },
  'đồng nai': { jobCount: 86, companyCount: 63, percentage: 1.9 },
  'hưng yên': { jobCount: 82, companyCount: 56, percentage: 1.8 },
  'bình dương': { jobCount: 71, companyCount: 34, percentage: 1.6 },
  'hải dương': { jobCount: 51, companyCount: 24, percentage: 1.1 },
  'bà rịa - vũng tàu': { jobCount: 28, companyCount: 21, percentage: 0.6 },
  'cà mau': { jobCount: 24, companyCount: 5, percentage: 0.5 },
  'thái nguyên': { jobCount: 22, companyCount: 15, percentage: 0.5 },
  'long an': { jobCount: 22, companyCount: 18, percentage: 0.5 },
  'khánh hòa': { jobCount: 21, companyCount: 17, percentage: 0.5 },
  'bắc giang': { jobCount: 20, companyCount: 9, percentage: 0.4 },
  'nghệ an': { jobCount: 18, companyCount: 15, percentage: 0.4 },
  'quảng ninh': { jobCount: 16, companyCount: 14, percentage: 0.4 },
  'cần thơ': { jobCount: 14, companyCount: 10, percentage: 0.3 },
  'kiên giang': { jobCount: 14, companyCount: 7, percentage: 0.3 },
  'tây ninh': { jobCount: 14, companyCount: 10, percentage: 0.3 },
  'hà nam': { jobCount: 12, companyCount: 10, percentage: 0.3 },
  'lâm đồng': { jobCount: 12, companyCount: 8, percentage: 0.3 },
  'bến tre': { jobCount: 11, companyCount: 4, percentage: 0.2 },
  'thanh hóa': { jobCount: 11, companyCount: 9, percentage: 0.2 },
  'tiền giang': { jobCount: 10, companyCount: 6, percentage: 0.2 },
  'quảng nam': { jobCount: 9, companyCount: 5, percentage: 0.2 },
  'thừa thiên huế': { jobCount: 7, companyCount: 4, percentage: 0.2 },
  'quảng ngãi': { jobCount: 7, companyCount: 6, percentage: 0.2 },
  'vĩnh phúc': { jobCount: 5, companyCount: 5, percentage: 0.1 },
  'thái bình': { jobCount: 5, companyCount: 5, percentage: 0.1 },
  'bình định': { jobCount: 2, companyCount: 2, percentage: 0.0 },
  'nam định': { jobCount: 1, companyCount: 1, percentage: 0.0 },
  'bình phước': { jobCount: 1, companyCount: 1, percentage: 0.0 },
};

const VIETNAM_GEO_NODES: GeoPoint[] = [
  // Miền Bắc
  { id: 'hanoi', name: 'Hà Nội', aliases: ['ha noi', 'tp hà nội', 'tp hanoi'], region: 'north', lat: 21.0285, lng: 105.8542, isKeyHub: true },
  { id: 'haiphong', name: 'Hải Phòng', aliases: ['hai phong', 'tp hải phòng'], region: 'north', lat: 20.8449, lng: 106.6881 },
  { id: 'quangninh', name: 'Quảng Ninh', aliases: ['quang ninh', 'hạ long'], region: 'north', lat: 20.9599, lng: 107.0425 },
  { id: 'bacninh', name: 'Bắc Ninh', aliases: ['bac ninh'], region: 'north', lat: 21.1861, lng: 106.0763 },
  { id: 'hungyen', name: 'Hưng Yên', aliases: ['hung yen'], region: 'north', lat: 20.6464, lng: 106.0511 },
  { id: 'haiduong', name: 'Hải Dương', aliases: ['hai duong'], region: 'north', lat: 20.9373, lng: 106.3146 },
  { id: 'vinhphuc', name: 'Vĩnh Phúc', aliases: ['vinh phuc'], region: 'north', lat: 21.3089, lng: 105.6049 },
  { id: 'thainguyen', name: 'Thái Nguyên', aliases: ['thai nguyen'], region: 'north', lat: 21.5928, lng: 105.8442 },
  { id: 'bacgiang', name: 'Bắc Giang', aliases: ['bac giang'], region: 'north', lat: 21.2731, lng: 106.1946 },
  { id: 'phutho', name: 'Phú Thọ', aliases: ['phu tho', 'việt trì'], region: 'north', lat: 21.3228, lng: 105.228 },
  { id: 'hanam', name: 'Hà Nam', aliases: ['ha nam', 'phủ lý'], region: 'north', lat: 20.545, lng: 105.912 },
  { id: 'namdinh', name: 'Nam Định', aliases: ['nam dinh'], region: 'north', lat: 20.4344, lng: 106.1773 },
  { id: 'thaibinh', name: 'Thái Bình', aliases: ['thai binh'], region: 'north', lat: 20.4463, lng: 106.3366 },
  { id: 'thanhhoa', name: 'Thanh Hóa', aliases: ['thanh hoa'], region: 'north', lat: 19.8067, lng: 105.7852 },
  { id: 'nghean', name: 'Nghệ An', aliases: ['nghe an', 'vinh'], region: 'north', lat: 18.6734, lng: 105.6813 },
  { id: 'hatinh', name: 'Hà Tĩnh', aliases: ['ha tinh'], region: 'north', lat: 18.3429, lng: 105.9059 },

  // Miền Trung
  { id: 'danang', name: 'Đà Nẵng', aliases: ['da nang', 'tp đà nẵng', 'tp danang'], region: 'central', lat: 16.0544, lng: 108.2022, isKeyHub: true },
  { id: 'thuathienhue', name: 'Thừa Thiên Huế', aliases: ['thua thien hue', 'huế', 'hue'], region: 'central', lat: 16.4637, lng: 107.5909 },
  { id: 'quangtri', name: 'Quảng Trị', aliases: ['quang tri'], region: 'central', lat: 16.8163, lng: 107.1001 },
  { id: 'quangbinh', name: 'Quảng Bình', aliases: ['quang binh', 'đồng hới'], region: 'central', lat: 17.469, lng: 106.6225 },
  { id: 'quangnam', name: 'Quảng Nam', aliases: ['quang nam', 'hội an', 'tam kỳ'], region: 'central', lat: 15.5651, lng: 108.4815 },
  { id: 'quangngai', name: 'Quảng Ngãi', aliases: ['quang ngai'], region: 'central', lat: 15.1205, lng: 108.7923 },
  { id: 'binhdinh', name: 'Bình Định', aliases: ['binh dinh', 'quy nhơn'], region: 'central', lat: 13.782, lng: 109.2197 },
  { id: 'phuyen', name: 'Phú Yên', aliases: ['phu yen', 'tuy hòa'], region: 'central', lat: 13.0882, lng: 109.3075 },
  { id: 'khanhhoa', name: 'Khánh Hòa', aliases: ['khanh hoa', 'nha trang'], region: 'central', lat: 12.2388, lng: 109.1967 },
  { id: 'daklak', name: 'Đắk Lắk', aliases: ['dak lak', 'đắc lắc', 'buôn ma thuột'], region: 'central', lat: 12.6667, lng: 108.0383 },
  { id: 'gialai', name: 'Gia Lai', aliases: ['gia lai', 'pleiku'], region: 'central', lat: 13.9833, lng: 108.0 },
  { id: 'lamdong', name: 'Lâm Đồng', aliases: ['lam dong', 'đà lạt'], region: 'central', lat: 11.9404, lng: 108.4583 },
  { id: 'binhthuan', name: 'Bình Thuận', aliases: ['binh thuan', 'phan thiết'], region: 'central', lat: 10.9273, lng: 108.1022 },

  // Miền Nam
  { id: 'hochiminh', name: 'Hồ Chí Minh', aliases: ['ho chi minh', 'tp. hồ chí minh', 'tp hồ chí minh', 'tp hcm', 'hcm', 'sài gòn', 'saigon'], region: 'south', lat: 10.8231, lng: 106.6297, isKeyHub: true },
  { id: 'binhduong', name: 'Bình Dương', aliases: ['binh duong', 'thủ dầu một'], region: 'south', lat: 11.1606, lng: 106.657 },
  { id: 'dongnai', name: 'Đồng Nai', aliases: ['dong nai', 'biên hòa'], region: 'south', lat: 10.9575, lng: 106.8426 },
  { id: 'bariavungtau', name: 'Bà Rịa - Vũng Tàu', aliases: ['ba ria vung tau', 'vũng tàu', 'bà rịa vũng tàu'], region: 'south', lat: 10.4966, lng: 107.1685 },
  { id: 'tayninh', name: 'Tây Ninh', aliases: ['tay ninh'], region: 'south', lat: 11.31, lng: 106.098 },
  { id: 'binhphuoc', name: 'Bình Phước', aliases: ['binh phuoc', 'đồng xoài'], region: 'south', lat: 11.533, lng: 106.883 },
  { id: 'longan', name: 'Long An', aliases: ['long an', 'tân an'], region: 'south', lat: 10.5361, lng: 106.4116 },
  { id: 'tiengiang', name: 'Tiền Giang', aliases: ['tien giang', 'mỹ tho'], region: 'south', lat: 10.36, lng: 106.36 },
  { id: 'bentre', name: 'Bến Tre', aliases: ['ben tre'], region: 'south', lat: 10.243, lng: 106.375 },
  { id: 'cantho', name: 'Cần Thơ', aliases: ['can tho', 'tp cần thơ'], region: 'south', lat: 10.0452, lng: 105.7469 },
  { id: 'dongthap', name: 'Đồng Tháp', aliases: ['dong thap', 'cao lãnh'], region: 'south', lat: 10.4578, lng: 105.6331 },
  { id: 'angiang', name: 'An Giang', aliases: ['an giang', 'long xuyên'], region: 'south', lat: 10.3759, lng: 105.4185 },
  { id: 'kiengiang', name: 'Kiên Giang', aliases: ['kien giang', 'rạch giá', 'phú quốc'], region: 'south', lat: 10.0125, lng: 105.0809 },
  { id: 'camau', name: 'Cà Mau', aliases: ['ca mau'], region: 'south', lat: 9.1769, lng: 105.1524 },
];

export default function VietnamLeafletMap({
  provinces = [],
  selectedRegion = 'all',
}: VietnamLeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Fast lookup map with alias matching & baseline fallback
  const statLookup = useMemo(() => {
    const lookup = new Map<
      string,
      { jobCount: number; companyCount: number; percentage: number }
    >();

    // 1. Fill baseline numbers
    Object.entries(BASELINE_STATS).forEach(([key, val]) => {
      lookup.set(key.toLowerCase(), val);
    });

    // 2. Overlay live fetched stats
    if (provinces && provinces.length > 0) {
      provinces.forEach((p) => {
        if (!p.province) return;
        const normalized = p.province.toLowerCase().trim();
        const stat = {
          jobCount: p.jobCount,
          companyCount: p.companyCount,
          percentage: p.percentage,
        };
        lookup.set(normalized, stat);

        if (normalized.includes('hà nội')) lookup.set('ha noi', stat);
        if (normalized.includes('hồ chí minh') || normalized.includes('hcm')) {
          lookup.set('hồ chí minh', stat);
          lookup.set('ho chi minh', stat);
          lookup.set('tp. hồ chí minh', stat);
        }
        if (normalized.includes('đà nẵng')) lookup.set('da nang', stat);
        if (normalized.includes('huế')) lookup.set('thừa thiên huế', stat);
        if (normalized.includes('vũng tàu')) lookup.set('bà rịa - vũng tàu', stat);
      });
    }

    return lookup;
  }, [provinces]);

  const getStat = (
    node: GeoPoint
  ): { jobCount: number; companyCount: number; percentage: number } => {
    const key = node.name.toLowerCase();
    if (statLookup.has(key)) return statLookup.get(key)!;

    for (const alias of node.aliases) {
      if (statLookup.has(alias)) return statLookup.get(alias)!;
    }

    return { jobCount: 0, companyCount: 0, percentage: 0 };
  };

  // Initialize Map (ESRI World Street Map - 100% Free, NO Watermark, NO API Key)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Center on Vietnam
    const map = L.map(mapContainerRef.current, {
      center: [16.0, 107.2],
      zoom: 6,
      minZoom: 5,
      maxZoom: 15,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // ESRI World Street Map: Clean, high-definition, 100% FREE, ZERO WATERMARK, NO API KEY
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 18,
        attribution:
          'Bản đồ &copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> &mdash; 100% Miễn Phí (Không cần API Key)',
      }
    ).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    // Invalidate size to guarantee complete rendering
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render & Update Markers with Dynamic Node Sizing Proportional to Job Count
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const filtered =
      selectedRegion === 'all'
        ? VIETNAM_GEO_NODES
        : VIETNAM_GEO_NODES.filter((n) => n.region === selectedRegion);

    filtered.forEach((node) => {
      const stat = getStat(node);
      const isHub = node.isKeyHub;
      const count = stat.jobCount;

      // Color scheme
      let hubColor = '#ea580c';
      let hubBadgeClass = 'hub-hanoi';
      if (node.id === 'danang') {
        hubColor = '#0284c7';
        hubBadgeClass = 'hub-danang';
      } else if (node.id === 'hochiminh') {
        hubColor = '#16a34a';
        hubBadgeClass = 'hub-hcm';
      }

      // Proportional Node Sizing: Kích thước node to hay nhỏ tương ứng với số lượng job
      let dotSize = 8;
      let dotColor = '#94a3b8';

      if (count >= 1000) {
        dotSize = 34;
        dotColor = hubColor;
      } else if (count >= 100) {
        dotSize = 24;
        dotColor = '#ea580c';
      } else if (count >= 50) {
        dotSize = 18;
        dotColor = '#f97316';
      } else if (count >= 20) {
        dotSize = 14;
        dotColor = '#0284c7';
      } else if (count >= 10) {
        dotSize = 11;
        dotColor = '#0284c7';
      } else if (count > 0) {
        dotSize = 9;
        dotColor = '#38bdf8';
      } else {
        dotSize = 6;
        dotColor = '#94a3b8';
      }

      let iconHtml = '';
      let iconSize: [number, number] = [dotSize, dotSize];
      let iconAnchor: [number, number] = [dotSize / 2, dotSize / 2];

      if (isHub) {
        // Hubs have outer pulsating radar ring
        const outerSize = Math.max(38, dotSize + 12);
        iconSize = [outerSize, outerSize];
        iconAnchor = [outerSize / 2, outerSize / 2];
        iconHtml = `
          <div class="leaflet-hub-marker ${hubBadgeClass}" style="width: ${outerSize}px; height: ${outerSize}px;">
            <span class="hub-pulse" style="width: ${outerSize}px; height: ${outerSize}px; background-color: ${hubColor};"></span>
            <span class="hub-dot" style="width: ${dotSize - 12}px; height: ${dotSize - 12}px; background-color: ${hubColor};"></span>
          </div>
        `;
      } else {
        iconHtml = `
          <div class="leaflet-province-dot" style="
            width: ${dotSize}px;
            height: ${dotSize}px;
            background-color: ${dotColor};
            border: 2px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            transition: transform 0.15s ease;
          "></div>
        `;
      }

      const customIcon = L.divIcon({
        className: 'custom-map-icon',
        html: iconHtml,
        iconSize,
        iconAnchor,
      });

      const marker = L.marker([node.lat, node.lng], { icon: customIcon });

      // DO NOT navigate away when clicking markers!
      // Simply center on province gently and show tooltip
      marker.on('click', () => {
        map.flyTo([node.lat, node.lng], Math.max(map.getZoom(), 8), {
          duration: 0.6,
        });
      });

      // Permanent tooltips for HN, DN, HCM
      if (isHub) {
        const tooltipContent = `
          <div class="permanent-hub-card ${hubBadgeClass}" style="
            border-left: 4px solid ${hubColor};
            padding: 4px 6px;
            user-select: none;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 3px;">
              <strong style="font-size: 13px; color: ${hubColor}; font-weight: 800;">
                ${node.id === 'hanoi' ? '🏛️' : node.id === 'danang' ? '🌴' : '🚀'} ${node.name}
              </strong>
              <span style="font-size: 11px; font-weight: 700; color: ${hubColor}; background: #ffffff; padding: 1px 6px; border-radius: 4px; border: 1px solid ${hubColor}40;">
                ${stat.percentage}%
              </span>
            </div>
            <div style="font-size: 12px; font-weight: 800; color: #0f172a;">
              💼 ${stat.jobCount.toLocaleString()} <span style="font-size: 11px; color: #64748b; font-weight: 500;">việc làm</span>
            </div>
            <div style="font-size: 11px; font-weight: 600; color: #334155;">
              🏢 ${stat.companyCount.toLocaleString()} <span style="font-size: 10.5px; color: #64748b; font-weight: 500;">công ty</span>
            </div>
          </div>
        `;

        marker.bindTooltip(tooltipContent, {
          permanent: true,
          direction: node.id === 'danang' ? 'right' : 'left',
          offset: node.id === 'danang' ? [16, 0] : [-16, 0],
          className: 'leaflet-permanent-tooltip',
        });
      } else {
        // Hover tooltip for other provinces
        const hoverContent = `
          <div style="font-family: inherit; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 3px;">
            <div style="font-weight: 800; font-size: 13px; color: #ea580c; margin-bottom: 3px;">📍 ${node.name}</div>
            <div>💼 Việc làm: <strong>${stat.jobCount.toLocaleString()}</strong> (${stat.percentage}%)</div>
            <div>🏢 Công ty: <strong>${stat.companyCount.toLocaleString()}</strong></div>
            <div style="font-size: 10.5px; color: #64748b; margin-top: 3px; border-top: 1px solid #e2e8f0; padding-top: 2px;">
              Mật độ việc: <span style="color: ${dotColor}; font-weight: 700;">${count >= 100 ? 'Rất cao 🔥' : count >= 50 ? 'Khá cao ⚡' : count >= 20 ? 'Trung bình' : 'Ít'}</span>
            </div>
          </div>
        `;

        marker.bindTooltip(hoverContent, {
          permanent: false,
          sticky: true,
          direction: 'top',
          offset: [0, -dotSize / 2 - 2],
          className: 'leaflet-hover-tooltip',
        });
      }

      marker.addTo(layerGroup);
    });

    // Auto-adjust view when filtering region
    if (selectedRegion === 'north') {
      map.flyTo([21.0, 105.8], 7, { duration: 0.8 });
    } else if (selectedRegion === 'central') {
      map.flyTo([15.8, 108.2], 7, { duration: 0.8 });
    } else if (selectedRegion === 'south') {
      map.flyTo([10.5, 106.6], 7, { duration: 0.8 });
    } else {
      map.flyTo([16.0, 107.2], 6, { duration: 0.8 });
    }
  }, [statLookup, selectedRegion]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '580px',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Visual Density Size Legend Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(6px)',
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          fontSize: '11px',
          color: '#334155',
          fontWeight: 600,
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '11.5px' }}>
          Mật độ việc làm (Kích cỡ node):
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: '#ea580c',
                display: 'inline-block',
              }}
            />
            &gt; 1.000 (Hub lớn)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#f97316',
                display: 'inline-block',
              }}
            />
            &gt; 50
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#0284c7',
                display: 'inline-block',
              }}
            />
            &gt; 10
          </span>
        </div>
      </div>

      {/* 100% Free Map Notice */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(4px)',
          padding: '4px 10px',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          fontSize: '11px',
          color: '#475569',
          fontWeight: 600,
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ color: '#16a34a', fontWeight: 700 }}>
          ● 100% Miễn Phí (Không cần API Key)
        </span>
        <span>•</span>
        <span>Cuộn chuột hoặc bấm +/- để zoom</span>
      </div>

      {/* Embedded CSS */}
      <style jsx global>{`
        .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          background: #f8fafc !important;
          outline: none;
          font-family: inherit !important;
        }

        .leaflet-tile-pane {
          opacity: 1 !important;
        }

        .custom-map-icon {
          background: transparent;
          border: none;
        }

        .leaflet-hub-marker {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .leaflet-hub-marker .hub-pulse {
          position: absolute;
          border-radius: 50%;
          opacity: 0.45;
          animation: mapPulse 2s infinite ease-in-out;
        }

        .leaflet-hub-marker .hub-dot {
          position: relative;
          border-radius: 50%;
          border: 2.5px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
          z-index: 2;
        }

        @keyframes mapPulse {
          0% {
            transform: scale(0.6);
            opacity: 0.8;
          }
          70% {
            transform: scale(1.5);
            opacity: 0;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        .leaflet-permanent-tooltip {
          background: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 10px !important;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.15) !important;
          padding: 6px 10px !important;
          pointer-events: auto !important;
          transition: transform 0.15s ease !important;
        }

        .leaflet-permanent-tooltip:hover {
          transform: scale(1.05) !important;
        }

        .leaflet-permanent-tooltip::before {
          border-right-color: #ffffff !important;
          border-left-color: #ffffff !important;
        }

        .leaflet-hover-tooltip {
          background: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 8px !important;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18) !important;
          padding: 6px 10px !important;
        }
      `}</style>
    </div>
  );
}
