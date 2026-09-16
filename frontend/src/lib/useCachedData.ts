'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const globalMemoryCache = new Map<string, { data: any; timestamp: number }>();

export interface CachedDataResult<T> {
  data: T | null;
  loading: boolean;
  isRevalidating: boolean;
  error: Error | null;
  mutate: (newData?: T) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    ttlMs?: number; // Time in ms before background revalidation is triggered (default 30s)
    persistSession?: boolean; // Save in sessionStorage for instant 0ms reload (default true)
  } = {}
): CachedDataResult<T> {
  const { ttlMs = 30000, persistSession = true } = options;

  const [data, setData] = useState<T | null>(() => {
    // 1. Check memory cache first
    const mem = globalMemoryCache.get(key);
    if (mem) {
      return mem.data as T;
    }

    // 2. Check sessionStorage
    if (persistSession && typeof window !== 'undefined') {
      try {
        const item = sessionStorage.getItem(`cache_${key}`);
        if (item) {
          const parsed = JSON.parse(item);
          globalMemoryCache.set(key, { data: parsed.data, timestamp: parsed.timestamp });
          return parsed.data as T;
        }
      } catch {
        // Ignore session parse error
      }
    }

    return null;
  });

  const [loading, setLoading] = useState<boolean>(data === null);
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef<boolean>(true);

  const performFetch = useCallback(async (isInitial = false) => {
    if (!isMounted.current) return;
    if (!isInitial) setIsRevalidating(true);

    try {
      const fresh = await fetcher();
      if (!isMounted.current) return;

      const now = Date.now();
      globalMemoryCache.set(key, { data: fresh, timestamp: now });

      if (persistSession && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`cache_${key}`, JSON.stringify({ data: fresh, timestamp: now }));
        } catch {
          // Ignore session storage quota error
        }
      }

      setData(fresh);
      setError(null);
    } catch (err: any) {
      if (isMounted.current) {
        setError(err);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRevalidating(false);
      }
    }
  }, [key, fetcher, persistSession]);

  useEffect(() => {
    isMounted.current = true;

    const cached = globalMemoryCache.get(key);
    const now = Date.now();

    if (!cached || now - cached.timestamp > ttlMs) {
      // Need fetch or background revalidation
      performFetch(data === null);
    } else {
      setLoading(false);
    }

    return () => {
      isMounted.current = false;
    };
  }, [key, performFetch, ttlMs, data]);

  const mutate = useCallback(async (newData?: T) => {
    if (newData !== undefined) {
      setData(newData);
      globalMemoryCache.set(key, { data: newData, timestamp: Date.now() });
    } else {
      await performFetch(false);
    }
  }, [key, performFetch]);

  const refresh = useCallback(async () => {
    await performFetch(false);
  }, [performFetch]);

  return {
    data,
    loading,
    isRevalidating,
    error,
    mutate,
    refresh,
  };
}
