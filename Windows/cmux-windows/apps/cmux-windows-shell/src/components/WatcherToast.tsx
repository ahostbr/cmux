import { useEffect, useState } from "react";

export interface WatcherMatchEvent {
  type: "watcher_match";
  watcher_id: string;
  watcher_name: string;
  pane_id: number;
  window_handle: number;
  matched_text: string;
  line: string;
  action: string;
}

interface ToastItem {
  id: number;
  event: WatcherMatchEvent;
  removing: boolean;
}

let nextId = 0;

interface Props {
  events: WatcherMatchEvent[];
}

export function WatcherToasts({ events }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Add new toasts when events arrive
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    const id = ++nextId;
    setToasts((prev) => [...prev.slice(-4), { id, event: latest, removing: false }]);

    // Auto-dismiss after 5s
    const timer = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [events.length]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto cyber-panel bg-cyber-bg border-cyber-alert/60 rounded-sm p-3 max-w-sm transition-all duration-300 ${toast.removing
              ? "opacity-0 translate-x-4"
              : "opacity-100 translate-x-0"
            }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2 h-2 rounded-full bg-cyber-alert animate-pulse" />
            <span className="text-[10px] font-rajdhani font-bold text-cyber-alert tracking-widest uppercase">
              WATCH.MATCH
            </span>
            <span className="text-[9px] font-rajdhani text-cyber-text-dim tracking-wider ml-auto">
              [{toast.event.watcher_name}]
            </span>
          </div>
          <div className="text-xs font-jetbrains text-cyber-text truncate">
            {toast.event.matched_text}
          </div>
          <div className="text-[9px] font-jetbrains text-cyber-text-dim/60 truncate mt-1">
            {toast.event.line}
          </div>
        </div>
      ))}
    </div>
  );
}
