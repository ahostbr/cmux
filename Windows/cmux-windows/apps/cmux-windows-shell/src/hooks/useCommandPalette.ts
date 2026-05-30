import { useState, useCallback, useEffect } from "react";
import type { ActionDef } from "../types/actions";

export function useCommandPalette(
  actions: ActionDef[],
  externalOpen?: boolean,
  onOpenChange?: (open: boolean) => void,
) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingAction, setPendingAction] = useState<ActionDef | null>(null);

  // Filter actions based on query and category
  const filtered = actions.filter((a) => {
    if (category && a.category !== category) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.id.includes(q);
  });

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, category]);

  // Reset state when palette closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setCategory(null);
      setSelectedIndex(0);
      setPendingAction(null);
    }
  }, [open]);

  // Global Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        if (pendingAction) {
          setPendingAction(null);
        } else {
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, pendingAction]);

  const moveSelection = useCallback(
    (delta: number) => {
      setSelectedIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return filtered.length - 1;
        if (next >= filtered.length) return 0;
        return next;
      });
    },
    [filtered.length]
  );

  return {
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
  };
}
