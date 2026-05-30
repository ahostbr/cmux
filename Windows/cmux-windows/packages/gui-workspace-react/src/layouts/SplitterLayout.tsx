import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type {
  GuiWorkspaceController,
  WorkspacePanelDefinition
} from '@gui/workspace-core';
import type { ReactNode } from 'react';
import { PanelFrame } from '../PanelFrame';

interface SplitterLayoutProps {
  panels: WorkspacePanelDefinition[];
  activePanelId: string | null;
  controller: GuiWorkspaceController;
  renderPanelContent: (panel: WorkspacePanelDefinition, visible: boolean) => ReactNode;
}

export function SplitterLayout({
  panels,
  activePanelId,
  controller,
  renderPanelContent
}: SplitterLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<number[]>([]);

  useEffect(() => {
    setSizes((current) => {
      if (current.length === panels.length) return current;
      const equal = panels.length > 0 ? 100 / panels.length : 100;
      return panels.map(() => equal);
    });
  }, [panels]);

  const resolvedSizes = useMemo(() => {
    if (sizes.length === panels.length) return sizes;
    const equal = panels.length > 0 ? 100 / panels.length : 100;
    return panels.map(() => equal);
  }, [panels, sizes]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: 'var(--bg-base, #0c0c0f)'
      }}
    >
      {panels.map((panel, index) => (
        <Fragment key={panel.id}>
          {index > 0 ? (
            <SplitterHandle
              onMouseDown={(event) => {
                const container = containerRef.current;
                if (!container) return;

                event.preventDefault();
                const startX = event.clientX;
                const startSizes = [...resolvedSizes];
                const containerWidth = container.getBoundingClientRect().width;

                const onMouseMove = (moveEvent: MouseEvent) => {
                  const deltaPercent = ((moveEvent.clientX - startX) / containerWidth) * 100;
                  const next = [...startSizes];
                  const left = startSizes[index - 1] + deltaPercent;
                  const right = startSizes[index] - deltaPercent;
                  if (left < 10 || right < 10) return;
                  next[index - 1] = left;
                  next[index] = right;
                  setSizes(next);
                };

                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                };

                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            />
          ) : null}
          <div style={{ width: `${resolvedSizes[index]}%`, height: '100%', minWidth: 0, minHeight: 0 }}>
            <PanelFrame
              title={panel.title}
              active={panel.id === activePanelId}
              onActivate={() => controller.onActivatePanel(panel.id)}
              onClose={panel.chrome?.closable === false ? undefined : () => controller.onClosePanel(panel.id)}
            >
              {renderPanelContent(panel, true)}
            </PanelFrame>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function SplitterHandle({ onMouseDown }: { onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 3,
        flexShrink: 0,
        cursor: 'col-resize',
        background: 'var(--border, rgba(255,255,255,0.08))'
      }}
    />
  );
}
