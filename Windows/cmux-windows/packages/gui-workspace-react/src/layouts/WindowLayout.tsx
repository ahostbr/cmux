import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  GuiWorkspaceController,
  WorkspacePanelDefinition,
  WorkspaceWindowState
} from '@gui/workspace-core';
import { PanelFrame } from '../PanelFrame';

interface WindowLayoutProps {
  panels: WorkspacePanelDefinition[];
  activePanelId: string | null;
  controller: GuiWorkspaceController;
  renderPanelContent: (panel: WorkspacePanelDefinition, visible: boolean) => ReactNode;
}

export function WindowLayout({
  panels,
  activePanelId,
  controller,
  renderPanelContent
}: WindowLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowStates, setWindowStates] = useState<Record<string, WorkspaceWindowState>>({});
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<'top' | 'bottom' | 'left' | 'right' | 'center' | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    setWindowStates((current) => {
      const next: Record<string, WorkspaceWindowState> = {};
      panels.forEach((panel, index) => {
        next[panel.id] = current[panel.id] ?? {
          x: 32 + index * 28,
          y: 32 + index * 28,
          width: Math.min(560, bounds.width * 0.55),
          height: Math.min(360, bounds.height * 0.55),
          zIndex: index + 1
        };
      });
      return next;
    });
  }, [panels]);

  function bringToFront(panelId: string) {
    setWindowStates((current) => {
      const topZ = Math.max(0, ...Object.values(current).map((entry) => entry.zIndex));
      return {
        ...current,
        [panelId]: {
          ...current[panelId],
          zIndex: topZ + 1
        }
      };
    });
  }

  function resolveDropZone(clientX: number, clientY: number) {
    const container = containerRef.current;
    if (!container) return null;

    const bounds = container.getBoundingClientRect();
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    const edgeThreshold = 0.12;

    if (y < edgeThreshold) return 'top';
    if (y > 1 - edgeThreshold) return 'bottom';
    if (x < edgeThreshold) return 'left';
    if (x > 1 - edgeThreshold) return 'right';
    if (x > 0.35 && x < 0.65 && y > 0.35 && y < 0.65) return 'center';
    return null;
  }

  function applyDropZone(panelId: string, nextDropZone: NonNullable<typeof dropZone>) {
    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const snaps = {
      top: { x: 0, y: 0, width: bounds.width, height: bounds.height / 2 },
      bottom: { x: 0, y: bounds.height / 2, width: bounds.width, height: bounds.height / 2 },
      left: { x: 0, y: 0, width: bounds.width / 2, height: bounds.height },
      right: { x: bounds.width / 2, y: 0, width: bounds.width / 2, height: bounds.height },
      center: { x: 0, y: 0, width: bounds.width, height: bounds.height }
    };

    setWindowStates((current) => ({
      ...current,
      [panelId]: {
        ...current[panelId],
        ...snaps[nextDropZone]
      }
    }));
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-base, #0c0c0f)'
      }}
    >
      {draggingPanelId && dropZone ? <DropZoneOverlay zone={dropZone} /> : null}
      {panels.map((panel) => {
        const state = windowStates[panel.id];
        if (!state) return null;

        return (
          <FloatingWindow
            key={panel.id}
            panel={panel}
            active={panel.id === activePanelId}
            state={state}
            onActivate={() => {
              bringToFront(panel.id);
              controller.onActivatePanel(panel.id);
            }}
            onClose={panel.chrome?.closable === false ? undefined : () => controller.onClosePanel(panel.id)}
            onChange={(updates) => {
              setWindowStates((current) => ({
                ...current,
                [panel.id]: { ...current[panel.id], ...updates }
              }));
            }}
            onDragStateChange={(dragging, clientX, clientY) => {
              setDraggingPanelId(dragging ? panel.id : null);
              const nextDropZone = typeof clientX === 'number' && typeof clientY === 'number'
                ? resolveDropZone(clientX, clientY)
                : null;
              setDropZone(nextDropZone);
              if (!dragging && nextDropZone) {
                applyDropZone(panel.id, nextDropZone);
              }
              if (!dragging) {
                setDropZone(null);
              }
            }}
          >
            {renderPanelContent(panel, true)}
          </FloatingWindow>
        );
      })}
    </div>
  );
}

interface FloatingWindowProps {
  panel: WorkspacePanelDefinition;
  active: boolean;
  state: WorkspaceWindowState;
  onActivate: () => void;
  onClose?: () => void;
  onChange: (updates: Partial<WorkspaceWindowState>) => void;
  onDragStateChange: (dragging: boolean, clientX?: number, clientY?: number) => void;
  children: ReactNode;
}

function FloatingWindow({
  panel,
  active,
  state,
  onActivate,
  onClose,
  onChange,
  onDragStateChange,
  children
}: FloatingWindowProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: state.x,
        top: state.y,
        width: state.width,
        height: state.height,
        zIndex: state.zIndex,
        minWidth: 240,
        minHeight: 180
      }}
      onMouseDown={onActivate}
    >
      <div
        onMouseDown={(event) => {
          const startX = event.clientX;
          const startY = event.clientY;
          const startLeft = state.x;
          const startTop = state.y;
          onDragStateChange(true, event.clientX, event.clientY);

          const onMouseMove = (moveEvent: MouseEvent) => {
            onChange({
              x: startLeft + (moveEvent.clientX - startX),
              y: startTop + (moveEvent.clientY - startY)
            });
            onDragStateChange(true, moveEvent.clientX, moveEvent.clientY);
          };

          const onMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            onDragStateChange(false, upEvent.clientX, upEvent.clientY);
          };

          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <PanelFrame title={panel.title} active={active} onActivate={onActivate} onClose={onClose}>
          {children}
        </PanelFrame>
      </div>
      <div
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();

          const startX = event.clientX;
          const startY = event.clientY;
          const startWidth = state.width;
          const startHeight = state.height;

          const onMouseMove = (moveEvent: MouseEvent) => {
            onChange({
              width: Math.max(240, startWidth + (moveEvent.clientX - startX)),
              height: Math.max(180, startHeight + (moveEvent.clientY - startY))
            });
          };

          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          };

          document.body.style.cursor = 'nwse-resize';
          document.body.style.userSelect = 'none';
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 14,
          height: 14,
          cursor: 'nwse-resize'
        }}
      />
    </div>
  );
}

function DropZoneOverlay({ zone }: { zone: 'top' | 'bottom' | 'left' | 'right' | 'center' }) {
  const positions = {
    top: { inset: '0 0 88% 0' },
    bottom: { inset: '88% 0 0 0' },
    left: { inset: '0 88% 0 0' },
    right: { inset: '0 0 0 88%' },
    center: { inset: '35% 35%' }
  };

  return (
    <div
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: 999,
        border: '2px dashed var(--accent, #d4a039)',
        background: 'rgba(212, 160, 57, 0.12)',
        ...positions[zone]
      }}
    />
  );
}
