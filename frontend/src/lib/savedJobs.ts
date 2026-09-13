import { SavedJobItem, UnifiedJob, ApplicationStatus } from '@/types/job';

const STORAGE_KEY = 'jobs_hunter_saved_jobs_v1';

export function getSavedJobs(): SavedJobItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load saved jobs:', e);
    return [];
  }
}

export function saveJob(job: UnifiedJob, status: ApplicationStatus = 'saved', notes = ''): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const list = getSavedJobs();
    const existingIndex = list.findIndex((item) => item.job.job_url === job.job_url);
    if (existingIndex >= 0) {
      list[existingIndex].status = status;
      if (notes) list[existingIndex].notes = notes;
    } else {
      list.unshift({
        job,
        status,
        savedAt: new Date().toISOString(),
        notes,
      });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('savedJobsUpdated'));
    return true;
  } catch (e) {
    console.error('Failed to save job:', e);
    return false;
  }
}

export function removeSavedJob(job_url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const list = getSavedJobs();
    const filtered = list.filter((item) => item.job.job_url !== job_url);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new Event('savedJobsUpdated'));
    return true;
  } catch (e) {
    console.error('Failed to remove saved job:', e);
    return false;
  }
}

export function updateJobStatus(job_url: string, status: ApplicationStatus): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const list = getSavedJobs();
    const target = list.find((item) => item.job.job_url === job_url);
    if (target) {
      target.status = status;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event('savedJobsUpdated'));
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to update job status:', e);
    return false;
  }
}

export function isJobSaved(job_url: string): boolean {
  if (typeof window === 'undefined') return false;
  const list = getSavedJobs();
  return list.some((item) => item.job.job_url === job_url);
}
