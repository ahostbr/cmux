import type { JobRun } from "../../types/scheduler";

interface Props {
  jobId: string;
  jobName: string;
  history: JobRun[];
  onClose: () => void;
}

const STATUS_ICON: Record<string, string> = {
  completed: "\u2713",
  failed: "\u2717",
  running: "\u25CB",
  cancelled: "\u25A0",
};

const STATUS_COLOR: Record<string, string> = {
  completed: "text-cyber-accent",
  failed: "text-cyber-alert",
  running: "text-blue-400",
  cancelled: "text-yellow-400",
};

function formatDuration(start: string, end?: string): string {
  if (!end) return "running...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function JobHistoryPanel({ jobName, history, onClose }: Props) {
  const completed = history.filter((r) => r.status === "completed").length;
  const failed = history.filter((r) => r.status === "failed").length;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md cyber-panel border-l border-cyber-border z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-cyber-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-rajdhani uppercase tracking-widest text-cyber-accent">
              Run History
            </h3>
            <p className="text-[10px] text-cyber-text-dim font-jetbrains">{jobName}</p>
          </div>
          <button onClick={onClose} className="text-cyber-text-dim hover:text-cyber-text text-lg">
            x
          </button>
        </div>

        {/* Run list */}
        <div className="flex-1 overflow-auto cyber-scrollbar p-3 space-y-2">
          {history.length === 0 ? (
            <p className="text-center text-cyber-text-dim text-xs mt-8">No runs yet</p>
          ) : (
            history.map((run) => (
              <div key={run.id} className="border border-cyber-border p-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${STATUS_COLOR[run.status] ?? "text-cyber-text-dim"}`}>
                    {STATUS_ICON[run.status] ?? "?"}
                  </span>
                  <span className="text-[10px] text-cyber-text font-jetbrains flex-1">
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                  <span className="text-[8px] font-rajdhani uppercase tracking-widest px-1.5 py-0.5 border border-cyber-border text-cyber-text-dim">
                    {run.triggered_by}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-[9px] text-cyber-text-dim font-jetbrains">
                  <span>{formatDuration(run.started_at, run.completed_at)}</span>
                  {run.steps_run != null && (
                    <span>steps: {run.steps_run}/{run.steps_total}</span>
                  )}
                </div>
                {run.error && (
                  <pre className="mt-1 p-1.5 text-[9px] bg-cyber-alert/10 border border-cyber-alert/30 text-cyber-alert overflow-auto max-h-20">
                    {run.error}
                  </pre>
                )}
                {run.output && !run.error && (
                  <pre className="mt-1 p-1.5 text-[9px] bg-cyber-accent/5 border border-cyber-border text-cyber-text-dim overflow-auto max-h-20">
                    {run.output.slice(0, 500)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-cyber-border flex gap-3 text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim">
          <span className="text-cyber-accent">{completed} passed</span>
          <span className="text-cyber-alert">{failed} failed</span>
          <span>{history.length} total</span>
        </div>
      </div>
    </>
  );
}
