import type { WorkspaceBounds } from '@gui/workspace-core';
import type { NativeSessionDriver } from './types';

export interface MemoryNativeSessionState {
  visible: boolean;
  bounds: WorkspaceBounds;
  createdAt: number;
  updatedAt: number;
}

const ZERO_BOUNDS: WorkspaceBounds = { x: 0, y: 0, width: 0, height: 0 };

export function createMemoryNativeSessionDriver(prefix = 'native') {
  const state = new Map<string, MemoryNativeSessionState>();
  let counter = 0;

  function setState(sessionId: string, next: Partial<MemoryNativeSessionState>) {
    const current = state.get(sessionId);
    if (!current) return;

    state.set(sessionId, {
      ...current,
      ...next,
      updatedAt: Date.now()
    });
  }

  const driver: NativeSessionDriver = {
    async createSession() {
      counter += 1;
      const sessionId = `${prefix}-${counter}`;
      const now = Date.now();

      state.set(sessionId, {
        visible: false,
        bounds: ZERO_BOUNDS,
        createdAt: now,
        updatedAt: now
      });

      return sessionId;
    },
    destroySession(sessionId) {
      state.delete(sessionId);
    },
    showSession(sessionId) {
      setState(sessionId, { visible: true });
    },
    hideSession(sessionId) {
      setState(sessionId, { visible: false });
    },
    setSessionBounds(sessionId, bounds) {
      setState(sessionId, { bounds });
    }
  };

  return {
    driver,
    getState(sessionId: string) {
      return state.get(sessionId) ?? null;
    },
    getAllStates() {
      return new Map(state);
    }
  };
}

