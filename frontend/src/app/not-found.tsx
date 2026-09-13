import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
      <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>404 - Không Tìm Thấy Trang</h2>
      <p style={{ color: '#64748b', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
        Trang bạn đang tìm kiếm không tồn tại hoặc đã được chuyển vị trí.
      </p>
      <Link href="/" className="btn btn-primary">
        Về Trang Chủ
      </Link>
    </div>
  );
}
