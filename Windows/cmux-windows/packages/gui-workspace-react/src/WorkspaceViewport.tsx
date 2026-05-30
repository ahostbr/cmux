import type {
  GuiWorkspaceController,
  WorkspaceLayoutMode,
  WorkspacePanelDefinition
} from '@gui/workspace-core';
import type { ReactNode } from 'react';
import { GridLayout } from './layouts/GridLayout';
import { SplitterLayout } from './layouts/SplitterLayout';
import { TabLayout } from './layouts/TabLayout';
import { WindowLayout } from './layouts/WindowLayout';

interface WorkspaceViewportProps {
  layoutMode: WorkspaceLayoutMode;
  panels: WorkspacePanelDefinition[];
  activePanelId: string | null;
  controller: GuiWorkspaceController;
  renderPanelContent: (panel: WorkspacePanelDefinition, visible: boolean) => ReactNode;
}

export function WorkspaceViewport({
  layoutMode,
  panels,
  activePanelId,
  controller,
  renderPanelContent
}: WorkspaceViewportProps) {
  switch (layoutMode) {
    case 'grid':
      return (
        <GridLayout
          panels={panels}
          activePanelId={activePanelId}
          controller={controller}
          renderPanelContent={renderPanelContent}
        />
      );
    case 'splitter':
      return (
        <SplitterLayout
          panels={panels}
          activePanelId={activePanelId}
          controller={controller}
          renderPanelContent={renderPanelContent}
        />
      );
    case 'tabs':
      return (
        <TabLayout
          panels={panels}
          activePanelId={activePanelId}
          controller={controller}
          renderPanelContent={renderPanelContent}
        />
      );
    case 'window':
      return (
        <WindowLayout
          panels={panels}
          activePanelId={activePanelId}
          controller={controller}
          renderPanelContent={renderPanelContent}
        />
      );
  }
}
