import type {
  GuiWorkspaceController,
  WorkspacePanelDefinition
} from '@gui/workspace-core';
import type { ReactNode } from 'react';

interface TabLayoutProps {
  panels: WorkspacePanelDefinition[];
  activePanelId: string | null;
  controller: GuiWorkspaceController;
  renderPanelContent: (panel: WorkspacePanelDefinition, visible: boolean) => ReactNode;
}

export function TabLayout({
  panels,
  activePanelId,
  controller,
  renderPanelContent
}: TabLayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base, #0c0c0f)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          height: 'var(--tab-height, 36px)',
          borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
          background: 'var(--bg-surface, #111116)',
          overflowX: 'auto'
        }}
      >
        {panels.map((panel, index) => {
          const active = panel.id === activePanelId;
          return (
            <button
              key={panel.id}
              type="button"
              onClick={() => controller.onActivatePanel(panel.id)}
              draggable={Boolean(controller.onReorderPanels)}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(index));
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                if (!controller.onReorderPanels) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!controller.onReorderPanels) return;
                event.preventDefault();
                const fromIndex = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
                if (!Number.isNaN(fromIndex) && fromIndex !== index) {
                  controller.onReorderPanels(fromIndex, index);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 12px',
                border: 'none',
                borderTop: active ? '2px solid var(--accent, #d4a039)' : '2px solid transparent',
                background: active ? 'var(--bg-base, #0c0c0f)' : 'transparent',
                color: active ? 'var(--text-primary, #d4d4d8)' : 'var(--text-muted, #5c5c6a)',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{panel.title}</span>
              {panel.chrome?.closable === false ? null : (
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.onClosePanel(panel.id);
                  }}
                  style={{ fontSize: 11, opacity: 0.7 }}
                >
                  x
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {panels.map((panel) => (
          <div
            key={panel.id}
            style={{
              position: 'absolute',
              inset: 0,
              visibility: panel.id === activePanelId ? 'visible' : 'hidden'
            }}
          >
            {renderPanelContent(panel, panel.id === activePanelId)}
          </div>
        ))}
      </div>
    </div>
  );
}
