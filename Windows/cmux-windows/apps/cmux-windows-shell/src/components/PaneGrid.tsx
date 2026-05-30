import { useMemo } from "react";
import type { WtWindow, WtPane } from "../hooks/useWtSocket";

interface Props {
  windows: WtWindow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  processMap: Map<string, { name: string; cwd: string }>;
}

interface GridCell {
  key: string;
  pane: WtPane;
  windowHandle: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function PaneGrid({ windows, selectedKey, onSelect, processMap }: Props) {
  const cells = useMemo(() => {
    const result: GridCell[] = [];
    for (const win of windows) {
      const termPanes = win.panes.filter(
        (p) => p.class_name === "TermControl" && p.rect
      );
      if (termPanes.length === 0) continue;

      // Find bounding box of all panes in this window
      let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
      for (const p of termPanes) {
        const r = p.rect!;
        if (r.left < minL) minL = r.left;
        if (r.top < minT) minT = r.top;
        if (r.right > maxR) maxR = r.right;
        if (r.bottom > maxB) maxB = r.bottom;
      }

      const totalW = maxR - minL || 1;
      const totalH = maxB - minT || 1;

      for (const p of termPanes) {
        const r = p.rect!;
        result.push({
          key: `${win.handle}-${p.id}`,
          pane: p,
          windowHandle: win.handle,
          left: ((r.left - minL) / totalW) * 100,
          top: ((r.top - minT) / totalH) * 100,
          width: ((r.right - r.left) / totalW) * 100,
          height: ((r.bottom - r.top) / totalH) * 100,
        });
      }
    }
    return result;
  }, [windows]);

  if (cells.length === 0) return null;

  return (
    <div className="mb-4">
      <h2 className="text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 mb-3 font-rajdhani uppercase">
        PANE.MATRIX
      </h2>
      <div
        className="relative w-full border border-cyber-border bg-cyber-bg/50 rounded-sm overflow-hidden"
        style={{ height: 180 }}
      >
        {cells.map((cell) => {
          const isSelected = selectedKey === cell.key;
          const isFocused = cell.pane.focused;
          const proc = processMap.get(cell.key);
          const cwd = proc?.cwd
            ? proc.cwd.length > 20
              ? "..." + proc.cwd.slice(-17)
              : proc.cwd
            : "";

          return (
            <button
              key={cell.key}
              onClick={() => onSelect(cell.key)}
              className={`absolute flex flex-col justify-center items-center p-1 text-center transition-all duration-200 cursor-pointer border rounded-sm overflow-hidden ${isSelected
                  ? "border-cyber-accent bg-cyber-accent-dim z-10"
                  : "border-cyber-border-highlight bg-cyber-panel hover:border-cyber-accent/40 hover:bg-cyber-panel/80"
                } ${isFocused && !isSelected ? "animate-pulse" : ""}`}
              style={{
                left: `${cell.left}%`,
                top: `${cell.top}%`,
                width: `${cell.width}%`,
                height: `${cell.height}%`,
              }}
            >
              <span
                className={`text-[10px] font-jetbrains font-bold ${isSelected ? "text-cyber-accent cyber-glow-text" : "text-cyber-text"
                  }`}
              >
                [{cell.pane.id}]
              </span>
              {proc?.name && (
                <span className="text-[9px] font-rajdhani text-cyber-text-dim tracking-wider uppercase truncate w-full px-1">
                  {proc.name}
                </span>
              )}
              {cwd && (
                <span className="text-[8px] font-jetbrains text-cyber-text-dim/60 truncate w-full px-1">
                  {cwd}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
