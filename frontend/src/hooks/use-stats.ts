import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { SkillStat, SalaryStat } from '@/types/job';

interface StatsData {
  topSkills: SkillStat[];
  salaryByLevel: SalaryStat[];
  totalJobs: number;
}

async function fetchStats(): Promise<StatsData> {
  const [skillsRes, salaryRes, countRes] = await Promise.all([
    supabase.from('v_top_skills').select('*').limit(10),
    supabase.from('v_salary_by_level').select('*'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  return {
    topSkills: (skillsRes.data as SkillStat[]) || [],
    salaryByLevel: (salaryRes.data as SalaryStat[]) || [],
    totalJobs: countRes.count || 0,
  };
}

export function useStats() {
  const { data, error, isLoading, mutate } = useSWR<StatsData>('dashboard-stats', fetchStats, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  return {
    stats: data,
    isLoading,
    isError: error,
    refreshStats: () => mutate(),
  };
}
