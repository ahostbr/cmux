import { useState } from "react";
import type { SchedulerSettings as Settings } from "../../types/scheduler";

interface Props {
  settings: Settings;
  onSave: (params: Partial<Settings>) => void;
  onClose: () => void;
}

export function SchedulerSettings({ settings, onSave, onClose }: Props) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [maxConcurrent, setMaxConcurrent] = useState(settings.max_concurrent_jobs);
  const [retention, setRetention] = useState(settings.history_retention_days);
  const [pollInterval, setPollInterval] = useState(settings.poll_interval_ms);

  const handleSave = () => {
    onSave({
      enabled,
      max_concurrent_jobs: maxConcurrent,
      history_retention_days: retention,
      poll_interval_ms: pollInterval,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm cyber-panel border border-cyber-border p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-rajdhani uppercase tracking-widest text-cyber-accent mb-4">
          Scheduler Settings
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim">
              Enable Scheduler
            </span>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`px-3 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border ${
                enabled
                  ? "border-cyber-accent text-cyber-accent"
                  : "border-cyber-border text-cyber-text-dim"
              }`}
            >
              {enabled ? "ON" : "OFF"}
            </button>
          </div>

          <div>
            <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-1">
              Max Concurrent Jobs
            </label>
            <input
              type="number"
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              min={1}
              max={10}
              className="cyber-input w-full text-xs p-2"
            />
          </div>

          <div>
            <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-1">
              History Retention (days)
            </label>
            <input
              type="number"
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
              min={0}
              className="cyber-input w-full text-xs p-2"
            />
            <p className="text-[9px] text-cyber-text-dim mt-0.5">0 = keep all history</p>
          </div>

          <div>
            <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-1">
              Poll Interval (ms)
            </label>
            <input
              type="number"
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
              min={250}
              max={10000}
              step={250}
              className="cyber-input w-full text-xs p-2"
            />
            <p className="text-[9px] text-cyber-text-dim mt-0.5">Terminal buffer refresh rate (250–10000ms)</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-cyber-border">
          <button onClick={onClose} className="cyber-button text-[10px] px-3 py-1.5 text-cyber-text-dim">
            Cancel
          </button>
          <button onClick={handleSave} className="cyber-button cyber-button-primary text-[10px] px-4 py-1.5">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
