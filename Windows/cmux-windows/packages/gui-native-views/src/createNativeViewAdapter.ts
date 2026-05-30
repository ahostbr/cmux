import type { NativeViewAdapter, WorkspaceBounds } from '@gui/workspace-core';
import type { NativeSessionDriver, NativeSessionRegistryLike } from './types';

const ZERO_BOUNDS: WorkspaceBounds = { x: 0, y: 0, width: 0, height: 0 };

function resolveDriver(
  kind: string,
  drivers: Record<string, NativeSessionDriver> | ((kind: string) => NativeSessionDriver | undefined)
) {
  if (typeof drivers === 'function') {
    return drivers(kind);
  }

  return drivers[kind];
}

export function createNativeViewAdapter(
  registry: NativeSessionRegistryLike,
  drivers: Record<string, NativeSessionDriver> | ((kind: string) => NativeSessionDriver | undefined)
): NativeViewAdapter {
  return {
    setVisible(panelId, visible) {
      const session = registry.get(panelId);
      if (!session) return;

      const driver = resolveDriver(session.kind, drivers);
      if (!driver) return;

      if (visible) {
        void driver.showSession(session.sessionId);
        return;
      }

      void driver.hideSession(session.sessionId);
      void driver.setSessionBounds(session.sessionId, ZERO_BOUNDS);
    },
    setBounds(panelId, bounds) {
      const session = registry.get(panelId);
      if (!session) return;

      const driver = resolveDriver(session.kind, drivers);
      if (!driver) return;

      void driver.setSessionBounds(session.sessionId, bounds);
    }
  };
}

