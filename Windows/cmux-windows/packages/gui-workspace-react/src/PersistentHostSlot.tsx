import { useEffect, useRef } from 'react';
import type { NativeViewAdapter, WorkspaceBounds } from '@gui/workspace-core';

interface PersistentHostSlotProps {
  panelId?: string;
  nativeViewAdapter?: NativeViewAdapter;
  host?: HTMLDivElement;
  visible?: boolean;
}

const ZERO_BOUNDS: WorkspaceBounds = { x: 0, y: 0, width: 0, height: 0 };
const EPSILON = 1;

function toWorkspaceBounds(element: HTMLElement | null): WorkspaceBounds | null {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const width = Math.max(0, Math.round(rect.width));
  const height = Math.max(0, Math.round(rect.height));

  if (width <= EPSILON || height <= EPSILON) {
    return null;
  }

  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width,
    height
  };
}

function isSameBounds(a: WorkspaceBounds | null, b: WorkspaceBounds | null) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function PersistentHostSlot({
  panelId,
  nativeViewAdapter,
  host,
  visible = true
}: PersistentHostSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(visible);
  const lastBoundsRef = useRef<WorkspaceBounds | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!slotRef.current || !host) return;
    slotRef.current.appendChild(host);
  }, [host]);

  visibleRef.current = visible;

  useEffect(() => {
    const setBounds = nativeViewAdapter?.setBounds;
    if (!panelId || !setBounds) return;

    const syncBounds = (force = false) => {
      if (!visibleRef.current) {
        lastBoundsRef.current = ZERO_BOUNDS;
        setBounds(panelId, ZERO_BOUNDS);
        return;
      }

      const nextBounds = toWorkspaceBounds(slotRef.current);
      if (!nextBounds) {
        lastBoundsRef.current = ZERO_BOUNDS;
        setBounds(panelId, ZERO_BOUNDS);
        return;
      }

      if (!force && isSameBounds(lastBoundsRef.current, nextBounds)) {
        return;
      }

      lastBoundsRef.current = nextBounds;
      setBounds(panelId, nextBounds);
    };

    syncBounds(true);

    const scheduleSync = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        syncBounds();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleSync);
    const element = slotRef.current;
    if (element) {
      resizeObserver.observe(element);
    }

    window.addEventListener('resize', scheduleSync);

    let loopId: number | null = null;
    const loop = () => {
      scheduleSync();
      loopId = window.requestAnimationFrame(loop);
    };
    loopId = window.requestAnimationFrame(loop);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleSync);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      if (loopId !== null) {
        window.cancelAnimationFrame(loopId);
      }

      lastBoundsRef.current = ZERO_BOUNDS;
      nativeViewAdapter?.setVisible(panelId, false);
      setBounds(panelId, ZERO_BOUNDS);
    };
  }, [nativeViewAdapter, panelId]);

  return (
    <div
      ref={slotRef}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        visibility: visible ? 'visible' : 'hidden'
      }}
    />
  );
}
