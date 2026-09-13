# Jobs Hunter - Serverless Data Pipeline & Analytics Dashboard

Kiến trúc 3 tầng: **Extract (GitHub Actions)** ➔ **Storage (Supabase)** ➔ **Serving (Next.js & Vercel)**.

## 1. Kiến trúc hệ thống

```
[Web/API Sources]
       │
       ▼ (Cron / GitHub Actions)
[Tầng 1: Crawler (Python)]
       │ (REST API Upsert - Service Role)
       ▼
[Tầng 2: Supabase (PostgreSQL)]
       │ (REST API Read-only - Anon Key)
       ▼
[Tầng 3: Next.js Dashboard (Vercel)]
```

## 2. Cấu trúc thư mục

- `.github/workflows/`: Chứa các script kích hoạt cronjob cào dữ liệu định kỳ trên GitHub Actions.
- `crawler/`: Mã nguồn Python thu thập, phân tích và chuẩn hóa tin tuyển dụng.
- `supabase/`: Migrations SQL tạo bảng, views thống kê và chính sách RLS.
- `frontend/`: Ứng dụng Next.js trực quan hóa dữ liệu với SWR và UI Dashboard.

## 3. Cấu hình biến môi trường

1. **Crawler (`.env.crawler.example`)**:
   - `SUPABASE_URL`: Đường dẫn dự án Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: Key bí mật có quyền ghi đè DB (chỉ đặt trong GitHub Actions Secrets).

2. **Frontend (`.env.frontend.example`)**:
   - `NEXT_PUBLIC_SUPABASE_URL`: Đường dẫn dự án Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public key có quyền đọc (Read-only).
