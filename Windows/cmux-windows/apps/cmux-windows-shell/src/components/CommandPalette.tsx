import { useRef, useEffect } from "react";
import type { ActionDef } from "../types/actions";
import type { ExecuteRequest } from "../types/actions";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { ActionArgForm } from "./ActionArgForm";

interface Props {
  actions: ActionDef[];
  categories: { name: string; count: number }[];
  windowHandle: number | null;
  paneId: number | null;
  onExecute: (req: ExecuteRequest) => Promise<unknown>;
  onAfterExecute?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const METHOD_BADGE: Record<string, { label: string; className: string }> = {
  shortcut: { label: "key", className: "bg-cyber-success/10 border border-cyber-success/30 text-cyber-success rounded-sm tracking-wider uppercase font-rajdhani" },
  cli: { label: "cli", className: "bg-cyber-accent/10 border border-cyber-accent/30 text-cyber-accent rounded-sm tracking-wider uppercase font-rajdhani" },
  palette: { label: "palette", className: "bg-cyber-alert/10 border border-cyber-alert/30 text-cyber-alert rounded-sm tracking-wider uppercase font-rajdhani" },
};

const CATEGORY_ICONS: Record<string, string> = {
  pane: "[ ]",
  tab: "[=]",
  focus: "-->",
  window: "[#]",
  clipboard: "cp",
  scroll: "||",
  font: "Aa",
  selection: "...",
  appearance: "~",
  advanced: ">_",
};

export function CommandPalette({
  actions,
  categories,
  windowHandle,
  paneId,
  onExecute,
  onAfterExecute,
  open: externalOpen,
  onOpenChange,
}: Props) {
  const {
    open,
    setOpen,
    query,
    setQuery,
    category,
    setCategory,
    selectedIndex,
    setSelectedIndex,
    filtered,
    moveSelection,
    pendingAction,
    setPendingAction,
  } = useCommandPalette(actions, externalOpen, onOpenChange);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (open && !pendingAction) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, pendingAction]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = (action: ActionDef) => {
    if (action.args.length > 0) {
      setPendingAction(action);
      return;
    }
    executeAndClose(action.id);
  };

  const executeAndClose = async (
    actionId: string,
    args?: Record<string, string | number>
  ) => {
    await onExecute({
      action_id: actionId,
      window: windowHandle || 0,
      pane_id: paneId,
      args,
    });
    setOpen(false);
    onAfterExecute?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex]);
    }
  };

  if (!open) return null;

  // Group filtered actions by category
  const grouped = new Map<string, ActionDef[]>();
  for (const a of filtered) {
    const list = grouped.get(a.category) || [];
    list.push(a);
    grouped.set(a.category, list);
  }

  // Build flat list with category headers for rendering
  let flatIndex = 0;
  const rows: Array<
    | { type: "header"; category: string }
    | { type: "action"; action: ActionDef; index: number }
  > = [];
  for (const [cat, acts] of grouped) {
    rows.push({ type: "header", category: cat });
    for (const a of acts) {
      rows.push({ type: "action", action: a, index: flatIndex++ });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-xl cyber-panel overflow-hidden border border-cyber-border shadow-2xl flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {pendingAction ? (
          <ActionArgForm
            action={pendingAction}
            onSubmit={(args) => executeAndClose(pendingAction.id, args)}
            onCancel={() => setPendingAction(null)}
          />
        ) : (
          <>
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-cyber-border bg-cyber-panel relative overflow-hidden group">
              <span className="cyber-glow-text text-cyber-accent text-lg font-rajdhani font-bold">&gt;_</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="SEARCH ACTIONS..."
                className="flex-1 bg-transparent text-sm text-cyber-text font-jetbrains focus:outline-none placeholder-cyber-text-dim/50 tracking-wider"
              />
              <kbd className="text-[10px] text-cyber-accent-dim bg-cyber-accent/10 border border-cyber-accent/20 px-1.5 py-0.5 rounded-sm font-jetbrains">
                ESC
              </kbd>
            </div>

            {/* Category pills */}
            <div className="flex gap-2 px-4 py-2 bg-cyber-bg border-b border-cyber-border overflow-x-auto cyber-scrollbar">
              <button
                onClick={() => setCategory(null)}
                className={`px-3 py-1 text-[10px] rounded-sm whitespace-nowrap font-rajdhani tracking-widest uppercase transition-all ${!category
                  ? "bg-cyber-accent text-cyber-bg font-bold border border-cyber-accent"
                  : "bg-cyber-panel text-cyber-text-dim hover:text-cyber-accent border border-cyber-border hover:border-cyber-border-highlight"
                  }`}
              >
                SYS.ALL ({actions.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() =>
                    setCategory(category === cat.name ? null : cat.name)
                  }
                  className={`px-3 py-1 text-[10px] rounded-sm whitespace-nowrap font-rajdhani tracking-widest uppercase transition-all ${category === cat.name
                    ? "bg-cyber-accent text-cyber-bg font-bold border border-cyber-accent"
                    : "bg-cyber-panel text-cyber-text-dim hover:text-cyber-accent border border-cyber-border hover:border-cyber-border-highlight"
                    }`}
                >
                  {cat.name} ({cat.count})
                </button>
              ))}
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="overflow-y-auto cyber-scrollbar bg-cyber-bg flex-1"
              role="listbox"
            >
              {rows.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-cyber-text-dim font-rajdhani tracking-widest uppercase">
                  NO ACTIONS LOCATED
                </div>
              )}
              {rows.map((row) => {
                if (row.type === "header") {
                  return (
                    <div
                      key={`h-${row.category}`}
                      className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-cyber-text-dim bg-cyber-panel border-y border-cyber-border-highlight sticky top-0 font-rajdhani z-10"
                    >
                      <span className="font-jetbrains mr-2 text-cyber-accent opacity-60">
                        {CATEGORY_ICONS[row.category] || "??"}
                      </span>
                      {row.category}
                    </div>
                  );
                }
                const { action, index } = row;
                const isSelected = index === selectedIndex;
                const badge = METHOD_BADGE[action.method];
                return (
                  <button
                    key={action.id}
                    role="option"
                    aria-selected={isSelected}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 text-sm transition-all cursor-pointer font-jetbrains ${isSelected
                      ? "bg-cyber-accent text-cyber-bg"
                      : "text-cyber-text hover:bg-cyber-panel cyber-panel-hover"
                      }`}
                    onClick={() => handleSelect(action)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <span className="flex-1 truncate tracking-wide">{action.name}</span>
                    {action.args.length > 0 && (
                      <span className="text-[10px] text-cyber-text-dim font-rajdhani tracking-widest uppercase">
                        {action.args.length} ARG
                        {action.args.length > 1 ? "S" : ""}
                      </span>
                    )}
                    {action.shortcut && (
                      <kbd className="text-[10px] font-jetbrains text-cyber-text-dim bg-cyber-panel border border-cyber-border px-1.5 py-0.5 rounded-sm">
                        {action.shortcut}
                      </kbd>
                    )}
                    {badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-sm ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-cyber-border-highlight bg-cyber-panel flex items-center gap-4 text-[10px] font-rajdhani tracking-widest text-cyber-text-dim uppercase">
              <span>
                <kbd className="border border-cyber-border px-1.5 rounded-sm text-cyber-text mr-1">↑↓</kbd> NAVIGATE
              </span>
              <span>
                <kbd className="border border-cyber-border px-1.5 rounded-sm text-cyber-text mr-1">↵</kbd> EXECUTE
              </span>
              <span>
                <kbd className="border border-cyber-border px-1.5 rounded-sm text-cyber-text mr-1">ESC</kbd> CLOSE
              </span>
              <span className="ml-auto text-cyber-accent text-[11px] font-bold">{filtered.length} ACTIONS</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
