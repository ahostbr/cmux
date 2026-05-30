import { useEffect, useRef, useState } from 'react';
import type { NativePanelSession, WorkspaceBounds } from '@gui/workspace-core';
import type { NativeSessionDriver, NativeSessionRegistryLike } from './types';

const ZERO_BOUNDS: WorkspaceBounds = { x: 0, y: 0, width: 0, height: 0 };

export interface UseNativePanelSessionOptions {
  panelId: string;
  kind: string;
  sessionId?: string;
  visible: boolean;
  driver: NativeSessionDriver;
  registry: NativeSessionRegistryLike;
  metadata?: Record<string, unknown>;
  destroyOnUnmount?: boolean;
  onSessionIdChange?: (sessionId: string | null) => void;
  onSessionReady?: (session: NativePanelSession, reused: boolean) => void;
}

function registerSession(
  registry: NativeSessionRegistryLike,
  session: NativePanelSession
) {
  registry.register(session);
  return session;
}

export function useNativePanelSession({
  panelId,
  kind,
  sessionId,
  visible,
  driver,
  registry,
  metadata,
  destroyOnUnmount = true,
  onSessionIdChange,
  onSessionReady
}: UseNativePanelSessionOptions) {
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(
    sessionId ?? registry.get(panelId)?.sessionId ?? null
  );
  const visibleRef = useRef(visible);
  const metadataRef = useRef(metadata);
  const onSessionIdChangeRef = useRef(onSessionIdChange);
  const onSessionReadyRef = useRef(onSessionReady);
  const sessionIdRef = useRef<string | null>(resolvedSessionId);

  visibleRef.current = visible;
  metadataRef.current = metadata;
  onSessionIdChangeRef.current = onSessionIdChange;
  onSessionReadyRef.current = onSessionReady;

  function syncVisibility(nextSessionId: string) {
    if (visibleRef.current) {
      void driver.showSession(nextSessionId);
      return;
    }

    void driver.hideSession(nextSessionId);
    void driver.setSessionBounds(nextSessionId, ZERO_BOUNDS);
  }

  useEffect(() => {
    if (!sessionId || sessionId === sessionIdRef.current) return;

    const nextSession: NativePanelSession = {
      panelId,
      sessionId,
      kind,
      metadata: metadataRef.current
    };

    sessionIdRef.current = sessionId;
    setResolvedSessionId(sessionId);
    registerSession(registry, nextSession);
    syncVisibility(sessionId);
  }, [kind, panelId, registry, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const existing = sessionIdRef.current ?? registry.get(panelId)?.sessionId ?? null;

      if (existing) {
        const session = registerSession(registry, {
          panelId,
          sessionId: existing,
          kind,
          metadata: metadataRef.current
        });

        sessionIdRef.current = existing;
        setResolvedSessionId(existing);
        onSessionReadyRef.current?.(session, true);
        onSessionIdChangeRef.current?.(existing);
        syncVisibility(existing);
        return;
      }

      const created = await driver.createSession();
      if (cancelled) {
        void driver.hideSession(created);
        void driver.setSessionBounds(created, ZERO_BOUNDS);
        void driver.destroySession(created);
        return;
      }

      const session = registerSession(registry, {
        panelId,
        sessionId: created,
        kind,
        metadata: metadataRef.current
      });

      sessionIdRef.current = created;
      setResolvedSessionId(created);
      onSessionReadyRef.current?.(session, false);
      onSessionIdChangeRef.current?.(created);
      syncVisibility(created);
    };

    void init();

    return () => {
      cancelled = true;

      const currentSessionId = sessionIdRef.current;

      if (!currentSessionId) return;

      void driver.hideSession(currentSessionId);
      void driver.setSessionBounds(currentSessionId, ZERO_BOUNDS);

      if (destroyOnUnmount) {
        registry.unregister(panelId);
        void driver.destroySession(currentSessionId);
        sessionIdRef.current = null;
        onSessionIdChangeRef.current?.(null);
      }
    };
  }, [destroyOnUnmount, driver, kind, panelId, registry]);

  useEffect(() => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;

    registerSession(registry, {
      panelId,
      sessionId: currentSessionId,
      kind,
      metadata: metadataRef.current
    });
  }, [kind, metadata, panelId, registry]);

  useEffect(() => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;

    syncVisibility(currentSessionId);
  }, [driver, visible]);

  return {
    sessionId: resolvedSessionId
  };
}
