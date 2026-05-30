import actionCatalog from './data/actions.json';
import type {
  ActionDef,
  ActionsResponse,
  CategoriesResponse,
  ExecuteResponse,
} from '../shared/types';
import { TerminalAutomation, WtCli } from './terminal-automation';

export class ActionRegistry {
  private readonly actions: ActionDef[];

  constructor(actions: ActionDef[]) {
    this.actions = actions;
  }

  get(actionId: string): ActionDef | undefined {
    return this.actions.find((action) => action.id === actionId);
  }

  all(): ActionDef[] {
    return [...this.actions];
  }

  byCategory(category: string): ActionDef[] {
    return this.actions.filter((action) => action.category === category);
  }

  search(query: string): ActionDef[] {
    const normalized = query.toLowerCase();
    return this.actions.filter(
      (action) =>
        action.name.toLowerCase().includes(normalized) ||
        action.id.toLowerCase().includes(normalized),
    );
  }

  categories(): Record<string, number> {
    return this.actions.reduce<Record<string, number>>((accumulator, action) => {
      accumulator[action.category] = (accumulator[action.category] ?? 0) + 1;
      return accumulator;
    }, {});
  }
}

export function createActionRegistry(): ActionRegistry {
  return new ActionRegistry(actionCatalog as ActionDef[]);
}

export class ActionExecutor {
  constructor(
    private readonly registry: ActionRegistry,
    private readonly automation: TerminalAutomation,
    private readonly wtCli: WtCli,
  ) {}

  async execute(
    actionId: string,
    windowHandle: number,
    paneId: number | null,
    args?: Record<string, unknown>,
  ): Promise<ExecuteResponse> {
    const action = this.registry.get(actionId);
    if (!action) {
      return { ok: false, error: `Unknown action: ${actionId}` };
    }

    if (actionId === 'send_input_text') {
      const text = typeof args?.text === 'string' ? args.text : '';
      if (!text) {
        return { ok: false, error: 'text argument required' };
      }
      const ok = await this.automation.sendInput(windowHandle, paneId ?? 0, text);
      return { ok, action: actionId };
    }

    try {
      if (action.method === 'shortcut') {
        if (!action.shortcut) {
          return { ok: false, error: `Action ${actionId} has no shortcut`, action: actionId };
        }
        const ok = await this.automation.sendShortcut(
          windowHandle,
          paneId ?? 0,
          action.shortcut,
        );
        return { ok, action: actionId, changes_structure: action.changes_structure };
      }

      if (action.method === 'cli') {
        if (action.id === 'new_tab_profile') {
          const result = await this.wtCli.newTab({
            profile: typeof args?.profile === 'string' ? args.profile : undefined,
            cwd: typeof args?.cwd === 'string' ? args.cwd : undefined,
          });
          return {
            ...result,
            action: actionId,
            changes_structure: action.changes_structure,
          };
        }

        return { ok: false, error: `No CLI handler for ${actionId}`, action: actionId };
      }

      const ok = await this.automation.commandPaletteInvoke(
        windowHandle,
        paneId ?? 0,
        action.palette_name ?? action.name,
        args,
      );
      return { ok, action: actionId, changes_structure: action.changes_structure };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        action: actionId,
      };
    }
  }
}

export function buildActionsResponse(actions: ActionDef[]): ActionsResponse {
  return {
    actions,
    total: actions.length,
  };
}

export function buildCategoriesResponse(
  categories: Record<string, number>,
): CategoriesResponse {
  return { categories };
}
