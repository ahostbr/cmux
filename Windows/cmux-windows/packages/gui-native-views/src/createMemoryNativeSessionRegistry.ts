import type { NativePanelSession } from '@gui/workspace-core';

export function createMemoryNativeSessionRegistry() {
  const sessions = new Map<string, NativePanelSession>();

  return {
    register(session: NativePanelSession) {
      sessions.set(session.panelId, session);
      return session;
    },
    unregister(panelId: string) {
      sessions.delete(panelId);
    },
    get(panelId: string) {
      return sessions.get(panelId) ?? null;
    },
    getAll() {
      return Array.from(sessions.values());
    }
  };
}
