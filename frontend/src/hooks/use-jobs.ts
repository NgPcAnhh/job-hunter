import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { JobItem } from '@/types/job';

async function fetchJobs(): Promise<JobItem[]> {
  try {
    const res = await fetch('/api/jobs?limit=50');
    if (!res.ok) throw new Error('Failed to fetch jobs');
    const data = await res.json();
    return data.jobs || [];
  } catch {
    const { data, error } = await supabase
      .from('all_jobs_unified')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    return (data as unknown as JobItem[]) || [];
  }
}

export function useJobs() {
  const { data, error, isLoading, mutate } = useSWR<JobItem[]>('jobs-list', fetchJobs, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  return {
    jobs: data || [],
    isLoading,
    isError: error,
    refreshJobs: () => mutate(),
  };
}
