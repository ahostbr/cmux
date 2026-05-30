import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  GuiWorkspaceController,
  NativeViewAdapter,
  WorkspaceActivityItem,
  WorkspaceLayoutMode,
  WorkspacePanelDefinition,
  WorkspacePanelRendererMap
} from '@gui/workspace-core';
import { ActivityRail } from './ActivityRail';
import { EmptyWorkspaceState } from './EmptyWorkspaceState';
import { PersistentHostSlot } from './PersistentHostSlot';
import { SidebarShell } from './SidebarShell';
import { WorkspaceViewport } from './WorkspaceViewport';
import { usePersistentHosts } from './hooks/usePersistentHosts';

export interface GuiWorkspaceProps {
  title?: string;
  activityItems: WorkspaceActivityItem[];
  activityActiveIds?: string[];
  panels: WorkspacePanelDefinition[];
  activePanelId: string | null;
  panelRenderers: WorkspacePanelRendererMap;
  controller: GuiWorkspaceController;
  sidebar?: ReactNode;
  sidebarVisible?: boolean;
  titlebar?: ReactNode;
  statusbar?: ReactNode;
  emptyState?: ReactNode;
  layoutMode?: WorkspaceLayoutMode;
  defaultLayout?: WorkspaceLayoutMode;
  layoutSettingsKey?: string;
  nativeViewAdapter?: NativeViewAdapter;
}

function getPanelVisible(
  panelId: string,
  activePanelId: string | null,
  layoutMode: WorkspaceLayoutMode
) {
  return layoutMode === 'tabs' ? panelId === activePanelId : true;
}

function renderPanelPortals(
  panels: WorkspacePanelDefinition[],
  activePanelId: string | null,
  layoutMode: WorkspaceLayoutMode,
  panelRenderers: WorkspacePanelRendererMap,
  contentHosts: Map<string, HTMLDivElement>
) {
  return panels.map((panel) => {
    if (!panel.chrome?.persistHost) return null;

    const host = contentHosts.get(panel.id);
    const render = panelRenderers[panel.type];
    if (!render || !host) return null;

    const active = panel.id === activePanelId;
    const visible = getPanelVisible(panel.id, activePanelId, layoutMode);

    return createPortal(
      render({
        panel,
        isActive: active,
        visible,
        host
      }),
      host,
      `panel-${panel.id}`
    );
  });
}

async function loadPersistedLayout(layoutSettingsKey: string) {
  if (typeof window === 'undefined') return null;

  const saved = await window.electronApp?.settings?.get?.(layoutSettingsKey)
    ?? window.localStorage.getItem(layoutSettingsKey);

  return saved === 'grid' || saved === 'splitter' || saved === 'tabs' || saved === 'window'
    ? saved
    : null;
}

async function savePersistedLayout(layoutSettingsKey: string, layoutMode: WorkspaceLayoutMode) {
  if (typeof window === 'undefined') return;

  if (window.electronApp?.settings?.set) {
    await window.electronApp.settings.set(layoutSettingsKey, layoutMode);
    return;
  }

  window.localStorage.setItem(layoutSettingsKey, layoutMode);
}

export function GuiWorkspace({
  activityItems,
  activityActiveIds = [],
  panels,
  activePanelId,
  panelRenderers,
  controller,
  sidebar,
  sidebarVisible = false,
  titlebar,
  statusbar,
  emptyState,
  layoutMode,
  defaultLayout = 'splitter',
  layoutSettingsKey,
  nativeViewAdapter
}: GuiWorkspaceProps) {
  const [internalLayoutMode, setInternalLayoutMode] = useState<WorkspaceLayoutMode>(defaultLayout);
  const [persistenceReady, setPersistenceReady] = useState(!layoutSettingsKey || Boolean(layoutMode));
  const hasPanels = panels.length > 0;
  const resolvedLayoutMode = layoutMode ?? internalLayoutMode;
  const contentHosts = usePersistentHosts(panels);

  const panelPortals = useMemo(
    () => renderPanelPortals(panels, activePanelId, resolvedLayoutMode, panelRenderers, contentHosts),
    [activePanelId, contentHosts, panelRenderers, panels, resolvedLayoutMode]
  );

  useEffect(() => {
    if (!nativeViewAdapter) return;
    for (const panel of panels) {
      nativeViewAdapter.setVisible(
        panel.id,
        getPanelVisible(panel.id, activePanelId, resolvedLayoutMode)
      );
    }
  }, [activePanelId, nativeViewAdapter, panels, resolvedLayoutMode]);

  useEffect(() => {
    if (layoutMode || !layoutSettingsKey || typeof window === 'undefined') return;
    let cancelled = false;

    void loadPersistedLayout(layoutSettingsKey).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setInternalLayoutMode(saved);
      }
      setPersistenceReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [layoutMode, layoutSettingsKey]);

  useEffect(() => {
    if (layoutMode || !layoutSettingsKey || typeof window === 'undefined' || !persistenceReady) return;
    void savePersistedLayout(layoutSettingsKey, resolvedLayoutMode);
  }, [layoutMode, layoutSettingsKey, persistenceReady, resolvedLayoutMode]);

  function renderPanelContent(panel: WorkspacePanelDefinition, visible: boolean) {
    const render = panelRenderers[panel.type];
    if (!render) return null;

    const active = panel.id === activePanelId;
    const host = panel.chrome?.persistHost ? (contentHosts.get(panel.id) ?? null) : null;

    if (host) {
      return (
        <PersistentHostSlot
          panelId={panel.id}
          nativeViewAdapter={nativeViewAdapter}
          host={host}
          visible={visible}
        />
      );
    }

    return render({
      panel,
      isActive: active,
      visible,
      host: null
    });
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#090a0d',
        color: '#f4f1e8'
      }}
    >
      {titlebar}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ActivityRail
          items={activityItems}
          activeItemIds={activityActiveIds}
          onItemClick={(itemId) => {
            const item = activityItems.find((entry) => entry.id === itemId);
            if (item?.actionId === 'toggle-sidebar') {
              controller.onToggleSidebar?.();
              return;
            }
            if (item?.actionId?.startsWith('layout:')) {
              const nextLayout = item.actionId.slice('layout:'.length) as WorkspaceLayoutMode;
              if (!layoutMode) setInternalLayoutMode(nextLayout);
              controller.onChangeLayout?.(nextLayout);
              return;
            }
            controller.onActivityAction?.(itemId);
          }}
        />
        {sidebarVisible && sidebar ? <SidebarShell>{sidebar}</SidebarShell> : null}
        <main style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {hasPanels ? (
            <WorkspaceViewport
              layoutMode={resolvedLayoutMode}
              panels={panels}
              activePanelId={activePanelId}
              controller={controller}
              renderPanelContent={renderPanelContent}
            />
          ) : (
            <EmptyWorkspaceState>{emptyState}</EmptyWorkspaceState>
          )}
          {panelPortals}
        </main>
      </div>
      {statusbar}
    </div>
  );
}
