import { useEffect, useState, useCallback, useMemo } from 'react';
import type {
  ActionDef,
  ActionsResponse,
  CategoriesResponse,
  ExecuteRequest,
  ExecuteResponse,
} from '../types/actions';
import { liteWinTerminalClient } from '../api/client';

export function useActionRegistry() {
  const [actions, setActions] = useState<ActionDef[]>([]);
  const [categories, setCategories] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [actRes, catRes] = await Promise.all([
          liteWinTerminalClient.actions.list() as Promise<ActionsResponse>,
          liteWinTerminalClient.actions.categories() as Promise<CategoriesResponse>,
        ]);
        if (!cancelled) {
          setActions(actRes.actions);
          setCategories(catRes.categories);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const executeAction = useCallback(
    async (req: ExecuteRequest): Promise<ExecuteResponse> => liteWinTerminalClient.actions.execute(req),
    [],
  );

  const searchActions = useCallback(
    (query: string, category?: string): ActionDef[] => {
      const q = query.toLowerCase();
      return actions.filter((action) => {
        if (category && action.category !== category) return false;
        if (!q) return true;
        return action.name.toLowerCase().includes(q) || action.id.includes(q);
      });
    },
    [actions],
  );

  const categoryList = useMemo(
    () => Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    [categories],
  );

  return { actions, categories: categoryList, loading, executeAction, searchActions };
}
