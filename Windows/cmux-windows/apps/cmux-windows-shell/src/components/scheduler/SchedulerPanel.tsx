import { useState } from "react";
import { useScheduler } from "../../hooks/useScheduler";
import { JobCard } from "./JobCard";
import { JobEditor } from "./JobEditor";
import { JobHistoryPanel } from "./JobHistoryPanel";
import { SchedulerSettings } from "./SchedulerSettings";
import type { ScheduledJob, SchedulerSettings as SchedulerSettingsType } from "../../types/scheduler";

interface Props {
  onSettingsChange?: (settings: Partial<SchedulerSettingsType>) => void;
}

export function SchedulerPanel({ onSettingsChange }: Props) {
  const {
    jobs, history, settings, createJob, updateJob, deleteJob,
    runJobNow, pauseJob, resumeJob, loadHistory, updateSettings,
  } = useScheduler();

  const [view, setView] = useState<"list" | "calendar">("list");
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const [historyJobId, setHistoryJobId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const activeCount = jobs.filter((j) => j.enabled && j.status === "idle").length;
  const runningCount = jobs.filter((j) => j.status === "running").length;
  const pausedCount = jobs.filter((j) => j.status === "paused").length;

  const handleSaveJob = async (params: Record<string, unknown>) => {
    if (editingJob) {
      await updateJob(editingJob.id, params);
    } else {
      await createJob(params);
    }
    setEditingJob(null);
    setCreatingJob(false);
  };

  const handleShowHistory = (jobId: string) => {
    setHistoryJobId(jobId);
    loadHistory(jobId);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          <span className="px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border border-cyber-accent text-cyber-accent">
            {activeCount} Active
          </span>
          {runningCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border border-blue-400 text-blue-400">
              {runningCount} Running
            </span>
          )}
          {pausedCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border border-yellow-400 text-yellow-400">
              {pausedCount} Paused
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex gap-1">
          <button
            onClick={() => setView("list")}
            className={`px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border ${
              view === "list"
                ? "border-cyber-accent text-cyber-accent bg-cyber-accent/10"
                : "border-cyber-border text-cyber-text-dim"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border ${
              view === "calendar"
                ? "border-cyber-accent text-cyber-accent bg-cyber-accent/10"
                : "border-cyber-border text-cyber-text-dim"
            }`}
          >
            Calendar
          </button>
        </div>

        <button
          onClick={() => { setCreatingJob(true); setEditingJob(null); }}
          className="cyber-button cyber-button-primary text-[10px] px-3 py-1"
        >
          + New Job
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="cyber-button text-[10px] px-2 py-1 border border-cyber-border text-cyber-text-dim hover:border-cyber-border-highlight"
        >
          Settings
        </button>
      </div>

      {/* Content */}
      {jobs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-cyber-text-dim text-sm font-rajdhani uppercase tracking-widest mb-3">
              No Scheduled Jobs
            </p>
            <button
              onClick={() => setCreatingJob(true)}
              className="cyber-button cyber-button-primary text-xs px-4 py-2"
            >
              Create Your First Job
            </button>
          </div>
        </div>
      ) : view === "list" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-auto cyber-scrollbar flex-1">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onEdit={() => setEditingJob(job)}
              onDelete={() => deleteJob(job.id)}
              onRun={() => runJobNow(job.id)}
              onPause={() => pauseJob(job.id)}
              onResume={() => resumeJob(job.id)}
              onHistory={() => handleShowHistory(job.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-cyber-text-dim text-sm font-rajdhani uppercase">
          Calendar view — coming soon
        </div>
      )}

      {/* Modals */}
      {(creatingJob || editingJob) && (
        <JobEditor
          job={editingJob}
          onSave={handleSaveJob}
          onCancel={() => { setCreatingJob(false); setEditingJob(null); }}
        />
      )}

      {historyJobId && (
        <JobHistoryPanel
          jobId={historyJobId}
          jobName={jobs.find((j) => j.id === historyJobId)?.name ?? ""}
          history={history}
          onClose={() => setHistoryJobId(null)}
        />
      )}

      {showSettings && (
        <SchedulerSettings
          settings={settings}
          onSave={(s) => { updateSettings(s); onSettingsChange?.(s); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

