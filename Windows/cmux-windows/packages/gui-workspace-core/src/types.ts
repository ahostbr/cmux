import type { ComponentType, ReactNode } from 'react';

export type WorkspaceLayoutMode = 'grid' | 'splitter' | 'tabs' | 'window';

export type WorkspaceIcon = ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
}>;

export interface WorkspacePanelChrome {
  closable?: boolean;
  draggable?: boolean;
  persistHost?: boolean;
}

export interface WorkspacePanelDefinition {
  id: string;
  type: string;
  title: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  chrome?: WorkspacePanelChrome;
}

export interface WorkspaceActivityItem {
  id: string;
  label: string;
  icon: WorkspaceIcon;
  placement?: 'primary' | 'secondary';
  actionId?: string;
}

export interface WorkspacePanelRenderContext {
  panel: WorkspacePanelDefinition;
  isActive: boolean;
  visible: boolean;
  host: HTMLElement | null;
}

export type WorkspacePanelRenderer = (
  context: WorkspacePanelRenderContext
) => ReactNode;

export type WorkspacePanelRendererMap = Record<string, WorkspacePanelRenderer>;

export interface GuiWorkspaceController {
  onActivatePanel: (panelId: string) => void;
  onClosePanel: (panelId: string) => void;
  onReorderPanels?: (fromIndex: number, toIndex: number) => void;
  onChangeLayout?: (mode: WorkspaceLayoutMode) => void;
  onToggleSidebar?: () => void;
  onActivityAction?: (itemId: string) => void;
}

export interface NativeViewAdapter {
  setVisible: (panelId: string, visible: boolean) => void;
  setBounds?: (panelId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
}

export interface WorkspaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativePanelSession {
  panelId: string;
  sessionId: string;
  kind: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}
