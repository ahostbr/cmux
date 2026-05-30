import { useState } from "react";

interface Watcher {
  id: string;
  name: string;
  pane_id: number;
  window_handle: number;
  pattern: string;
  action: string;
  trigger_action_id: string | null;
  enabled: boolean;
  match_count: number;
  last_match: string | null;
}

interface Props {
  watchers: Watcher[];
  panes: { paneId: number; windowHandle: number; label: string }[];
  onAdd: (watcher: {
    name: string;
    pane_id: number;
    window_handle: number;
    pattern: string;
    action: string;
    trigger_action_id?: string;
  }) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}

export type { Watcher };

export function WatcherPanel({ watchers, panes, onAdd, onDelete, onToggle }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    paneKey: "",
    pattern: "",
    action: "notify" as string,
  });

  const handleAdd = async () => {
    if (!form.name || !form.pattern || !form.paneKey) return;
    const [wh, pid] = form.paneKey.split("-").map(Number);
    await onAdd({
      name: form.name,
      pane_id: pid,
      window_handle: wh,
      pattern: form.pattern,
      action: form.action,
    });
    setForm({ name: "", paneKey: "", pattern: "", action: "notify" });
    setAdding(false);
  };

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 mb-3 font-rajdhani uppercase"
      >
        <span className="flex items-center gap-2">
          WATCH.DAEMON
          {watchers.some((w) => w.enabled) && (
            <span className="inline-block w-2 h-2 rounded-full bg-cyber-success" />
          )}
        </span>
        <span className="text-cyber-text-dim text-[10px]">{expanded ? "[-]" : "[+]"}</span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {/* Watcher list */}
          {watchers.length === 0 && !adding && (
            <div className="text-[10px] text-cyber-text-dim/50 font-rajdhani tracking-widest uppercase text-center py-4">
              NO WATCHERS ACTIVE
            </div>
          )}

          {watchers.map((w) => (
            <div
              key={w.id}
              className={`p-2 border rounded-sm transition-all ${w.enabled
                  ? "border-cyber-border-highlight bg-cyber-panel"
                  : "border-cyber-border bg-cyber-panel/50 opacity-60"
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-jetbrains text-cyber-text truncate">
                      {w.name}
                    </span>
                    <span className="text-[9px] font-rajdhani text-cyber-text-dim tracking-widest uppercase">
                      [{w.action}]
                    </span>
                  </div>
                  <div className="text-[9px] font-jetbrains text-cyber-accent/60 truncate mt-0.5">
                    /{w.pattern}/
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {w.match_count > 0 && (
                    <span className="text-[9px] font-jetbrains text-cyber-alert bg-cyber-alert/10 px-1.5 py-0.5 rounded-sm">
                      {w.match_count}
                    </span>
                  )}
                  <button
                    onClick={() => onToggle(w.id)}
                    className={`cyber-button px-2 py-0.5 text-[9px] ${w.enabled ? "text-cyber-success" : "text-cyber-text-dim"
                      }`}
                    title={w.enabled ? "Click to disable" : "Click to enable"}
                  >
                    {w.enabled ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => onDelete(w.id)}
                    className="cyber-button px-2 py-0.5 text-[9px] text-cyber-alert hover:!border-cyber-alert"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Add form */}
          {adding ? (
            <div className="border border-cyber-accent/30 rounded-sm bg-cyber-bg p-3 space-y-2">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="WATCHER NAME"
                className="w-full cyber-input px-3 py-1.5 text-xs"
                autoFocus
              />
              <select
                value={form.paneKey}
                onChange={(e) => setForm((f) => ({ ...f, paneKey: e.target.value }))}
                className="w-full cyber-input px-3 py-1.5 text-xs"
              >
                <option value="">SELECT PANE...</option>
                {panes.map((p, i) => (
                  <option key={`${p.windowHandle}-${p.paneId}`} value={`${p.windowHandle}-${p.paneId}`}>
                    [{i + 1}] {p.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.pattern}
                onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
                placeholder="REGEX PATTERN (e.g. ERROR|FAIL)"
                className="w-full cyber-input px-3 py-1.5 text-xs font-jetbrains"
              />
              <select
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                className="w-full cyber-input px-3 py-1.5 text-xs"
              >
                <option value="notify">NOTIFY</option>
                <option value="highlight">HIGHLIGHT</option>
                <option value="trigger">TRIGGER ACTION</option>
              </select>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setAdding(false)}
                  className="cyber-button px-3 py-1 text-[10px] text-cyber-text-dim"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!form.name || !form.pattern || !form.paneKey}
                  className="cyber-button cyber-button-primary px-3 py-1 text-[10px] disabled:opacity-30"
                >
                  CREATE
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full cyber-button px-3 py-1.5 text-[10px] font-rajdhani tracking-widest uppercase text-cyber-accent border-dashed"
            >
              + ADD WATCHER
            </button>
          )}
        </div>
      )}
    </div>
  );
}
