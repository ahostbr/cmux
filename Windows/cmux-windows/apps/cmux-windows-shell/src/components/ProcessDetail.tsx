import { useState } from "react";
import type { ProcessInfo } from "../hooks/useProcessMap";

interface Props {
  process: ProcessInfo;
  onClose: () => void;
}

export function ProcessDetail({ process, onClose }: Props) {
  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-72 cyber-panel bg-cyber-bg border border-cyber-border rounded-sm shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cyber-border-highlight">
        <span className="text-[10px] font-rajdhani font-bold text-cyber-accent tracking-widest uppercase">
          PROC.DETAIL
        </span>
        <button
          onClick={onClose}
          className="text-cyber-text-dim hover:text-cyber-accent text-xs transition-colors"
        >
          [X]
        </button>
      </div>
      <div className="p-3 space-y-2 text-[10px] font-jetbrains">
        <Row label="PROCESS" value={process.name} accent />
        <Row label="PID" value={String(process.pid)} />
        <Row label="COMMAND" value={process.cmdline} mono />
        <Row label="CWD" value={process.cwd} mono />
        <Row label="STATUS" value="RUNNING" success />

        <div className="border-t border-cyber-border-highlight pt-2 mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-cyber-text-dim font-rajdhani tracking-widest uppercase">CPU</span>
            <span
              className={
                process.cpu_percent > 50
                  ? "text-cyber-alert font-bold"
                  : process.cpu_percent > 15
                    ? "text-cyber-alert/70"
                    : "text-cyber-success"
              }
            >
              {process.cpu_percent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-2 bg-cyber-border rounded-sm overflow-hidden">
            <div
              className={`h-full rounded-sm transition-all duration-300 ${process.cpu_percent > 50
                  ? "bg-cyber-alert"
                  : process.cpu_percent > 15
                    ? "bg-cyber-alert/60"
                    : "bg-cyber-accent/60"
                }`}
              style={{ width: `${Math.min(process.cpu_percent, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-cyber-text-dim font-rajdhani tracking-widest uppercase">MEMORY</span>
          <span className={process.memory_mb > 500 ? "text-cyber-alert" : "text-cyber-success"}>
            {process.memory_mb.toFixed(1)} MB
          </span>
        </div>

        {!process.matched && (
          <div className="text-[9px] text-cyber-alert/60 font-rajdhani tracking-widest uppercase border-t border-cyber-border-highlight pt-2">
            ⚠ APPROXIMATE MATCH — PANE/SHELL COUNT MISMATCH
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  success,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  success?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-cyber-text-dim font-rajdhani tracking-widest uppercase shrink-0 w-16">
        {label}
      </span>
      <span
        className={`truncate ${accent
            ? "text-cyber-accent cyber-glow-text font-bold"
            : success
              ? "text-cyber-success"
              : mono
                ? "text-cyber-text/80"
                : "text-cyber-text"
          }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Wrapper that handles click-to-toggle behavior */
export function ProcessDetailToggle({
  process,
  children,
}: {
  process: ProcessInfo | undefined;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!process) return <>{children}</>;

  return (
    <div className="relative">
      <div onDoubleClick={() => setOpen(!open)}>
        {children}
      </div>
      {open && <ProcessDetail process={process} onClose={() => setOpen(false)} />}
    </div>
  );
}
