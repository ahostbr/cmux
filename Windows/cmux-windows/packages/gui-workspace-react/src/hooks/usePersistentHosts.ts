import { useEffect, useMemo, useRef } from 'react';
import type { WorkspacePanelDefinition } from '@gui/workspace-core';

export function usePersistentHosts(panels: WorkspacePanelDefinition[]) {
  const hostsRef = useRef(new Map<string, HTMLDivElement>());

  const hosts = useMemo(() => {
    const persistentPanels = panels.filter((panel) => panel.chrome?.persistHost);
    const panelIds = new Set(persistentPanels.map((panel) => panel.id));

    for (const panel of persistentPanels) {
      if (hostsRef.current.has(panel.id)) continue;
      const host = document.createElement('div');
      host.style.display = 'contents';
      hostsRef.current.set(panel.id, host);
    }

    for (const [panelId, host] of hostsRef.current) {
      if (panelIds.has(panelId)) continue;
      host.remove();
      hostsRef.current.delete(panelId);
    }

    return new Map(hostsRef.current);
  }, [panels]);

  useEffect(() => {
    return () => {
      for (const host of hostsRef.current.values()) {
        host.remove();
      }
      hostsRef.current.clear();
    };
  }, []);

  return hosts;
}
