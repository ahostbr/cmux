import type { WorkspacePanelDefinition } from './types';

export interface WorkspaceStateSnapshot<TPanel extends WorkspacePanelDefinition = WorkspacePanelDefinition> {
  panels: TPanel[];
  activePanelId: string | null;
}

export function reorderWorkspacePanels<TPanel extends WorkspacePanelDefinition>(
  panels: TPanel[],
  fromIndex: number,
  toIndex: number
): TPanel[] {
  if (fromIndex === toIndex) return panels;
  if (fromIndex < 0 || toIndex < 0) return panels;
  if (fromIndex >= panels.length || toIndex >= panels.length) return panels;

  const next = [...panels];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function appendWorkspacePanel<TPanel extends WorkspacePanelDefinition>(
  snapshot: WorkspaceStateSnapshot<TPanel>,
  panel: TPanel
): WorkspaceStateSnapshot<TPanel> {
  return {
    panels: [...snapshot.panels, panel],
    activePanelId: panel.id
  };
}

export function upsertSingletonWorkspacePanel<TPanel extends WorkspacePanelDefinition>(
  snapshot: WorkspaceStateSnapshot<TPanel>,
  panel: TPanel
): WorkspaceStateSnapshot<TPanel> {
  const existing = snapshot.panels.find((entry) => entry.type === panel.type);
  if (existing) {
    return {
      panels: snapshot.panels,
      activePanelId: existing.id
    };
  }

  return appendWorkspacePanel(snapshot, panel);
}

export function removeWorkspacePanel<TPanel extends WorkspacePanelDefinition>(
  snapshot: WorkspaceStateSnapshot<TPanel>,
  panelId: string
): WorkspaceStateSnapshot<TPanel> {
  const panels = snapshot.panels.filter((panel) => panel.id !== panelId);
  const activePanelId = snapshot.activePanelId === panelId
    ? (panels[panels.length - 1]?.id ?? null)
    : snapshot.activePanelId;

  return {
    panels,
    activePanelId
  };
}

export function makeSequentialPanelId(type: string, panels: WorkspacePanelDefinition[]): string {
  const count = panels.filter((panel) => panel.type === type).length + 1;
  return `${type}-${count}`;
}
