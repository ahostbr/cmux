export * from './GuiWorkspace';
export * from './ActivityRail';
export * from './PanelFrame';
export * from './PersistentHostSlot';
export * from './SidebarShell';
export * from './WorkspaceViewport';
export * from './EmptyWorkspaceState';
export * from './hooks/usePersistentHosts';
export * from './layouts/GridLayout';
export * from './layouts/SplitterLayout';
export * from './layouts/TabLayout';
export * from './layouts/WindowLayout';
export type {
  GuiWorkspaceController,
  NativeViewAdapter,
  WorkspaceActivityItem,
  WorkspaceIcon,
  WorkspaceLayoutMode,
  WorkspacePanelChrome,
  WorkspacePanelDefinition,
  WorkspacePanelRenderContext,
  WorkspacePanelRenderer,
  WorkspacePanelRendererMap,
  WorkspaceWindowState
} from '@gui/workspace-core';
