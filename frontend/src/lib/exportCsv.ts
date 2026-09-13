import { UnifiedJob } from '@/types/job';

export function exportJobsToCsv(jobs: UnifiedJob[], filename = 'danh_sach_viec_lam_it.csv') {
  if (!jobs || jobs.length === 0) {
    alert('Không có dữ liệu việc làm để xuất file.');
    return;
  }

  const headers = [
    'Chức Danh Công Việc',
    'Tên Công Ty',
    'Mức Lương',
    'Khu Vực',
    'Kinh Nghiệm',
    'Cấp Bậc',
    'Hình Thức Làm Việc',
    'Nguồn Tuyển Dụng',
    'Hạn Nộp Hồ Sơ',
    'Ngày Đăng',
    'Địa Điểm Chi Tiết',
    'Đường Dẫn Ứng Tuyển Gốc',
  ];

  const escapeCsv = (str: string | null | undefined) => {
    if (!str) return '""';
    const clean = str.replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return `"${clean}"`;
  };

  const rows = jobs.map((j) => [
    escapeCsv(j.job_title),
    escapeCsv(j.company_name),
    escapeCsv(j.salary || 'Thương lượng'),
    escapeCsv(j.location_short || 'Chưa rõ'),
    escapeCsv(j.experience || 'Không yêu cầu'),
    escapeCsv(j.level || 'Chưa xác định'),
    escapeCsv(j.work_type || 'Toàn thời gian'),
    escapeCsv(j.source?.toUpperCase()),
    escapeCsv(j.deadline || 'Hết hạn theo quy định'),
    escapeCsv(j.posted_date || ''),
    escapeCsv(j.workplace_detail || ''),
    escapeCsv(j.job_url),
  ]);

  // \uFEFF là UTF-8 BOM để Excel tự động nhận diện font tiếng Việt có dấu
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
