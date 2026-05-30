import type { NativePanelSession, WorkspaceBounds } from '@gui/workspace-core';

export interface NativeSessionRegistryLike {
  register: (session: NativePanelSession) => NativePanelSession;
  unregister: (panelId: string) => void;
  get: (panelId: string) => NativePanelSession | null;
  getAll: () => NativePanelSession[];
}

export interface NativeSessionDriver {
  createSession: () => Promise<string>;
  destroySession: (sessionId: string) => void | Promise<void>;
  showSession: (sessionId: string) => void | Promise<void>;
  hideSession: (sessionId: string) => void | Promise<void>;
  setSessionBounds: (sessionId: string, bounds: WorkspaceBounds) => void | Promise<void>;
}

