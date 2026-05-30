import type { ProcessInfo } from "../hooks/useProcessMap";

interface Props {
  process: ProcessInfo | undefined;
  compact?: boolean;
}

function truncateCwd(cwd: string, max = 25): string {
  if (cwd.length <= max) return cwd;
  return "..." + cwd.slice(-(max - 3));
}

export function ProcessBadge({ process, compact }: Props) {
  if (!process) {
    return (
      <span className="text-[9px] font-rajdhani text-cyber-text-dim/40 tracking-widest uppercase">
        NO PROCESS
      </span>
    );
  }

  const cpuHigh = process.cpu_percent > 50;
  const cpuMed = process.cpu_percent > 15;
  const memHigh = process.memory_mb > 500;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-[9px] font-jetbrains">
        <span className="text-cyber-accent/80">{process.name}</span>
        <span className="text-cyber-text-dim/40">|</span>
        <CpuBar percent={process.cpu_percent} />
        <span
          className={`${cpuHigh
              ? "text-cyber-alert"
              : cpuMed
                ? "text-cyber-alert/70"
                : "text-cyber-text-dim"
            }`}
        >
          {process.cpu_percent.toFixed(1)}%
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[10px] font-jetbrains flex-wrap">
      <span className="text-cyber-accent cyber-glow-text font-bold">
        {process.name}
      </span>
      <span className="text-cyber-text-dim/40">|</span>
      <span className="text-cyber-text-dim truncate max-w-[160px]">
        {truncateCwd(process.cwd)}
      </span>
      <span className="text-cyber-text-dim/40">|</span>
      <span className="flex items-center gap-1">
        <span className="text-[9px] text-cyber-text-dim/60 font-rajdhani uppercase">CPU</span>
        <CpuBar percent={process.cpu_percent} />
        <span
          className={
            cpuHigh
              ? "text-cyber-alert font-bold"
              : cpuMed
                ? "text-cyber-alert/70"
                : "text-cyber-text-dim"
          }
        >
          {process.cpu_percent.toFixed(1)}%
        </span>
      </span>
      <span className="text-cyber-text-dim/40">|</span>
      <span className="flex items-center gap-1">
        <span className="text-[9px] text-cyber-text-dim/60 font-rajdhani uppercase">MEM</span>
        <span className={memHigh ? "text-cyber-alert" : "text-cyber-success"}>
          {process.memory_mb.toFixed(0)}MB
        </span>
      </span>
      {!process.matched && (
        <span className="text-[8px] text-cyber-alert/60 font-rajdhani tracking-widest uppercase">
          ~APPROX
        </span>
      )}
    </div>
  );
}

function CpuBar({ percent }: { percent: number }) {
  const clamped = Math.min(percent, 100);
  const high = percent > 50;
  const med = percent > 15;

  return (
    <div className="w-8 h-1.5 bg-cyber-border rounded-sm overflow-hidden">
      <div
        className={`h-full rounded-sm transition-all duration-300 ${high
            ? "bg-cyber-alert"
            : med
              ? "bg-cyber-alert/60"
              : "bg-cyber-accent/60"
          }`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
