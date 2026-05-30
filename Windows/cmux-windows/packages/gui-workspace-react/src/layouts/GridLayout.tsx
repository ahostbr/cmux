import type {
  GuiWorkspaceController,
  WorkspacePanelDefinition
} from '@gui/workspace-core';
import type { ReactNode } from 'react';
import { PanelFrame } from '../PanelFrame';

interface GridLayoutProps {
  panels: WorkspacePanelDefinition[];
  activePanelId: string | null;
  controller: GuiWorkspaceController;
  renderPanelContent: (panel: WorkspacePanelDefinition, visible: boolean) => ReactNode;
}

function getGridTemplate(count: number) {
  if (count <= 1) return '1fr';
  if (count === 2) return 'repeat(2, minmax(0, 1fr))';
  if (count <= 4) return 'repeat(2, minmax(0, 1fr))';
  return 'repeat(3, minmax(0, 1fr))';
}

export function GridLayout({
  panels,
  activePanelId,
  controller,
  renderPanelContent
}: GridLayoutProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: getGridTemplate(panels.length),
        gap: 1,
        width: '100%',
        height: '100%',
        background: 'var(--border, rgba(255,255,255,0.08))'
      }}
    >
      {panels.map((panel, index) => (
        <PanelFrame
          key={panel.id}
          title={panel.title}
          active={panel.id === activePanelId}
          onActivate={() => controller.onActivatePanel(panel.id)}
          onClose={panel.chrome?.closable === false ? undefined : () => controller.onClosePanel(panel.id)}
          draggable={Boolean(controller.onReorderPanels)}
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', String(index));
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event) => {
            if (!controller.onReorderPanels) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            if (!controller.onReorderPanels) return;
            event.preventDefault();
            const fromIndex = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
            if (!Number.isNaN(fromIndex) && fromIndex !== index) {
              controller.onReorderPanels(fromIndex, index);
            }
          }}
        >
          {renderPanelContent(panel, true)}
        </PanelFrame>
      ))}
    </div>
  );
}
