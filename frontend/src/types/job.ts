export interface CompanyItem {
  id?: string;
  name: string;
  slug?: string;
  address?: string;
  city?: string;
  website_url?: string;
  logo_url?: string;
  company_size?: string;
  industry?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface JobItem {
  id?: string;
  source: string;
  source_job_id: string;
  
  // Link bài đăng tuyển dụng gốc & link apply
  job_url: string;
  apply_url?: string;

  // Liên kết công ty
  company_id?: string;
  company?: CompanyItem;
  company_name: string;
  company_address?: string;

  // Chi tiết công việc
  title: string;
  location?: string;
  job_level?: 'Intern' | 'Fresher' | 'Junior' | 'Middle' | 'Senior' | 'Lead/Manager';
  job_type?: string;

  // Lương
  salary_min?: number;
  salary_max?: number;
  salary_currency: string;
  is_salary_negotiable: boolean;
  salary_avg_vnd?: number;

  // Kỹ năng & Mô tả
  skills: string[];
  description_summary?: string;
  description_raw?: string;

  // Vòng đời & Thời gian
  is_active: boolean;
  posted_at?: string;
  crawled_at: string;
  last_seen_at?: string;
}

export interface SkillStat {
  skill: string;
  job_count: number;
}

export interface SalaryStat {
  job_level: string;
  total_jobs: number;
  avg_salary_min: number;
  avg_salary_max: number;
}
