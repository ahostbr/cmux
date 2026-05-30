import { useCallback, useEffect, useState } from 'react';
import type { JobRun, ScheduledJob, SchedulerSettings } from '../types/scheduler';
import { liteWinTerminalClient } from '../api/client';

export function useScheduler() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [history, setHistory] = useState<JobRun[]>([]);
  const [settings, setSettings] = useState<SchedulerSettings>({
    enabled: true,
    max_concurrent_jobs: 3,
    history_retention_days: 30,
    poll_interval_ms: 1000,
  });

  const fetchJobs = useCallback(async () => {
    try {
      const data = await liteWinTerminalClient.scheduler.listJobs();
      setJobs(data.jobs ?? []);
    } catch {
      // ignore
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await liteWinTerminalClient.scheduler.getSettings();
      setSettings(data);
    } catch {
      // ignore
    }
  }, []);

  const createJob = useCallback(async (params: Record<string, unknown>) => {
    const data = await liteWinTerminalClient.scheduler.createJob(params as never);
    if (data.ok) await fetchJobs();
    return data;
  }, [fetchJobs]);

  const updateJob = useCallback(async (id: string, params: Record<string, unknown>) => {
    const data = await liteWinTerminalClient.scheduler.updateJob(id, params);
    if (data.ok) await fetchJobs();
    return data;
  }, [fetchJobs]);

  const deleteJob = useCallback(async (id: string) => {
    await liteWinTerminalClient.scheduler.deleteJob(id);
    await fetchJobs();
  }, [fetchJobs]);

  const runJobNow = useCallback(async (id: string) => {
    const data = await liteWinTerminalClient.scheduler.runJob(id);
    await fetchJobs();
    return data;
  }, [fetchJobs]);

  const pauseJob = useCallback(async (id: string) => {
    await liteWinTerminalClient.scheduler.pauseJob(id);
    await fetchJobs();
  }, [fetchJobs]);

  const resumeJob = useCallback(async (id: string) => {
    await liteWinTerminalClient.scheduler.resumeJob(id);
    await fetchJobs();
  }, [fetchJobs]);

  const cancelJob = useCallback(async (id: string) => {
    await liteWinTerminalClient.scheduler.cancelJob(id);
    await fetchJobs();
  }, [fetchJobs]);

  const loadHistory = useCallback(async (jobId?: string, limit?: number) => {
    try {
      const data = jobId
        ? await liteWinTerminalClient.scheduler.getHistory(jobId, limit)
        : await liteWinTerminalClient.scheduler.listHistory(limit);
      setHistory(data.history ?? []);
    } catch {
      // ignore
    }
  }, []);

  const updateSettings = useCallback(async (params: Partial<SchedulerSettings>) => {
    const data = await liteWinTerminalClient.scheduler.updateSettings(params);
    setSettings(data);
    return data;
  }, []);

  useEffect(() => {
    void fetchJobs();
    void fetchSettings();
    const interval = window.setInterval(() => {
      void fetchJobs();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [fetchJobs, fetchSettings]);

  return {
    jobs,
    history,
    settings,
    fetchJobs,
    createJob,
    updateJob,
    deleteJob,
    runJobNow,
    pauseJob,
    resumeJob,
    cancelJob,
    loadHistory,
    updateSettings,
  };
}
