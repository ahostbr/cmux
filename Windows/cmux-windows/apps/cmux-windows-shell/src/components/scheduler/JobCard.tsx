import type { ScheduledJob } from "../../types/scheduler";

interface Props {
  job: ScheduledJob;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onHistory: () => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  schedule: "SCHED",
  watcher: "WATCH",
  event: "EVENT",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "border-cyber-accent text-cyber-accent",
  running: "border-blue-400 text-blue-400",
  paused: "border-yellow-400 text-yellow-400",
};

function formatNextRun(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "overdue";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return d.toLocaleDateString();
}

export function JobCard({ job, onEdit, onDelete, onRun, onPause, onResume, onHistory }: Props) {
  const triggerType = job.trigger.type;
  const scheduleType =
    triggerType === "schedule" ? (job.trigger as { schedule: { type: string } }).schedule.type.toUpperCase() : null;
  const actionLabel = job.action.type === "macro" ? "MACRO" : "ACTION";

  return (
    <div
      className={`cyber-panel border p-3 cursor-pointer hover:border-cyber-border-highlight group ${
        !job.enabled ? "opacity-50" : ""
      } ${STATUS_COLORS[job.status]?.split(" ")[0] ?? "border-cyber-border"}`}
      onClick={onEdit}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-rajdhani uppercase tracking-wider text-cyber-text truncate flex-1">
          {job.name}
        </span>
        <span
          className={`px-1.5 py-0.5 text-[8px] font-rajdhani uppercase tracking-widest border ${
            STATUS_COLORS[job.status] ?? "border-cyber-border text-cyber-text-dim"
          }`}
        >
          {job.status}
        </span>
      </div>

      {/* Badges */}
      <div className="flex gap-1 mb-2 flex-wrap">
        <span className="px-1.5 py-0.5 text-[8px] font-rajdhani uppercase tracking-widest border border-cyber-border text-cyber-text-dim">
          {TRIGGER_LABELS[triggerType] ?? triggerType}
          {scheduleType && `:${scheduleType}`}
        </span>
        {triggerType === "event" && (
          <span className="px-1.5 py-0.5 text-[8px] font-rajdhani uppercase tracking-widest border border-cyan-700 text-cyan-400">
            {(job.trigger as { event: string }).event}
          </span>
        )}
        <span className="px-1.5 py-0.5 text-[8px] font-rajdhani uppercase tracking-widest border border-cyber-border text-cyber-text-dim">
          {actionLabel}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[10px] text-cyber-text-dim font-jetbrains">
        {job.next_run && (
          <span title={`Next: ${job.next_run}`}>next: {formatNextRun(job.next_run)}</span>
        )}
        <span>runs: {job.run_count}</span>
      </div>

      {/* Hover actions */}
      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        {job.status === "paused" ? (
          <button onClick={onResume} className="cyber-button text-[8px] px-2 py-0.5 border border-cyber-accent text-cyber-accent" title="Resume">
            Resume
          </button>
        ) : (
          <>
            <button onClick={onRun} className="cyber-button text-[8px] px-2 py-0.5 border border-cyber-accent text-cyber-accent" title="Run now">
              Run
            </button>
            <button onClick={onPause} className="cyber-button text-[8px] px-2 py-0.5 border border-yellow-400 text-yellow-400" title="Pause">
              Pause
            </button>
          </>
        )}
        <button onClick={onHistory} className="cyber-button text-[8px] px-2 py-0.5 border border-cyber-border text-cyber-text-dim" title="History">
          History
        </button>
        <button onClick={onDelete} className="cyber-button text-[8px] px-2 py-0.5 border border-cyber-alert text-cyber-alert" title="Delete">
          Delete
        </button>
      </div>
    </div>
  );
}
