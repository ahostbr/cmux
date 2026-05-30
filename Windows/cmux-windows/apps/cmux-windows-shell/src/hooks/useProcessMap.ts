import { useMemo } from "react";
import type { WtWindow, WtShell } from "./useWtSocket";

export interface ProcessInfo extends WtShell {
  matched: boolean;
}

/**
 * Maps pane keys ("windowHandle-paneId") to their shell process info.
 * Uses index-based mapping: pane index → shell index when counts match.
 */
export function useProcessMap(windows: WtWindow[]): Map<string, ProcessInfo> {
  return useMemo(() => {
    const map = new Map<string, ProcessInfo>();

    for (const win of windows) {
      const termPanes = win.panes.filter((p) => p.class_name === "TermControl");
      const shells = win.shells ?? [];
      const matched = termPanes.length === shells.length;

      for (let i = 0; i < termPanes.length; i++) {
        const pane = termPanes[i];
        const key = `${win.handle}-${pane.id}`;

        if (matched && shells[i]) {
          map.set(key, { ...shells[i], matched: true });
        } else if (shells[i]) {
          // Best-effort: assign by index even when mismatched
          map.set(key, { ...shells[i], matched: false });
        }
      }
    }

    return map;
  }, [windows]);
}
