import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { JobItem } from '@/types/job';

async function fetchJobs(): Promise<JobItem[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('is_active', true)
    .order('crawled_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return (data as JobItem[]) || [];
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
