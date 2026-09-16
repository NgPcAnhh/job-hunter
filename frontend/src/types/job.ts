export type JobSource =
  | 'careerlink'
  | 'careerviet'
  | 'topcv'
  | 'vieclam24h'
  | 'vietnamworks'
  | 'jobsgo'
  | 'joboko';

export interface ExtraInfo {
  duplicate_sources?: string[];
  synced_at?: string;
  raw_crawled_at?: string;
  [key: string]: any;
}

export interface UnifiedJob {
  job_url: string;
  source: string;
  job_title: string;
  company_name: string;
  company_url?: string | null;
  company_logo?: string | null;
  salary?: string | null;
  experience?: string | null;
  level?: string | null;
  work_type?: string | null;
  education?: string | null;
  industry?: string | null;
  location_short?: string | null;
  workplace_detail?: string | null;
  working_time?: string | null;
  posted_date?: string | null;
  deadline?: string | null;
  keyword?: string | null;
  job_description?: string | null;
  job_requirements?: string | null;
  benefits?: string | null;
  extra_info?: ExtraInfo | null;
  created_at?: string;
  match_score?: number; // Similarity percentage (0 - 100)
}

export type JobItem = UnifiedJob;

export interface JobFilterState {
  q: string;
  source: string;
  location: string;
  level: string;
  experience: string;
  workType: string;
  sortBy: 'latest' | 'deadline' | 'title' | 'similarity';
  page: number;
  limit: number;
}

export interface JobsApiResponse {
  jobs: UnifiedJob[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filtersAvailable: {
    sources: { source: string; count: number }[];
    locations: { location: string; count: number }[];
    levels: { level: string; count: number }[];
  };
}

export interface SourceStat {
  source: string;
  rawCount: number;
  unifiedCount: number;
}

export interface LocationStat {
  location: string;
  count: number;
}

export interface ProvinceStat {
  province: string;
  jobCount: number;
  companyCount: number;
  percentage: number;
}

export interface StatsApiResponse {
  totalUnified: number;
  totalRawJobs?: number;
  totalDuplicatesDetected: number;
  totalCompanies?: number;
  sources: SourceStat[];
  topLocations: LocationStat[];
  provinces?: ProvinceStat[];
  topHiringCompanies?: {
    company_name: string;
    job_count: number;
    logo?: string | null;
    sample_salary?: string | null;
    locations?: string[];
  }[];
  latestJobs: UnifiedJob[];
  lastCrawledAt?: string;
}

export interface SkillStat {
  skill: string;
  job_count: number;
}

export interface SalaryStat {
  level: string;
  avg_salary: number;
  min_salary: number;
  max_salary: number;
  count: number;
}

export interface TechTrendItem {
  name: string;
  category: 'Language' | 'Framework' | 'Database/Cloud' | 'Tool';
  count: number;
  sharePercent: number;
  avgSalaryEstimate: string;
  badge: 'Hot 🔥' | 'Tăng trưởng ↗️' | 'Phổ biến ⚡';
}

export interface SalaryLevelStat {
  level: string;
  range: string;
  avgVnd: number;
  count: number;
  description: string;
}

export interface SalaryCityStat {
  city: string;
  avgVnd: number;
  range: string;
  jobCount: number;
}

export interface RoleTechStat {
  name: string;
  avg: number;
  range: string;
}

export interface SalaryRoleStat {
  key: string;
  name: string;
  shortName: string;
  avgVnd: number;
  minVnd: number;
  maxVnd: number;
  range: string;
  jobCount: number;
  techs: RoleTechStat[];
}

export interface PipelineSpiderStatus {
  source: string;
  displayName: string;
  status: 'ACTIVE' | 'IDLE' | 'WARNING';
  rawTable: string;
  rawCount: number;
  unifiedCount: number;
  dedupRatio: number;
  lastRun: string;
  engine: 'requests' | 'curl_cffi' | 'playwright';
}

export interface PipelineMonitorData {
  totalRawScraped: number;
  totalUnifiedSaved: number;
  totalDuplicatesMerged: number;
  overallDedupPercent: number;
  spiders: PipelineSpiderStatus[];
  cronSchedule: {
    expression: string;
    scheduleDescription: string;
    parallelWorkers: number;
    alertChannel: string;
  };
}

export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'offered' | 'rejected';

export interface SavedJobItem {
  job: UnifiedJob;
  status: ApplicationStatus;
  savedAt: string;
  notes?: string;
}

export interface CompanyOverviewItem {
  company_name: string;
  company_logo?: string | null;
  company_url?: string | null;
  job_count: number;
  locations: string[];
  sample_titles: string[];
  sample_salary?: string | null;
  industry_sector?: string;
}

export interface IndustrySectorItem {
  sector: string;
  count: number;
  percentage: number;
  topCompanies: string[];
}

