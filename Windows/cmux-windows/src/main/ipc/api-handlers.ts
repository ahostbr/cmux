import { app, ipcMain } from 'electron';
import type { MacroStep, ScheduledJob, StreamMessage } from '../../shared/types';
import { ActionExecutor, ActionRegistry, buildActionsResponse, buildCategoriesResponse } from '../actions';
import type { RuntimeServices } from '../managers';
import { TerminalAutomation, WtCli } from '../terminal-automation';

interface HandlerContext {
  automation: TerminalAutomation;
  wtCli: WtCli;
  actionRegistry: ActionRegistry;
  actionExecutor: ActionExecutor;
  services: RuntimeServices;
  emit: (message: StreamMessage) => void;
}

export function registerApiHandlers(context: HandlerContext): void {
  const resolveWindowHandle = async (requested?: number | null) => {
    if (requested) {
      return requested;
    }
    const windows = await context.automation.findWindows();
    return windows[0]?.handle ?? 0;
  };

  ipcMain.handle('wt:health:get', async () => ({
    status: 'ok',
    version: app.getVersion(),
  }));

  ipcMain.handle('wt:panes:list', async () => context.automation.getState());

  ipcMain.handle('wt:panes:buffer:get', async (_event, payload: {
    paneId: number;
    lines?: number;
    window?: number;
    shellPid?: number;
  }) => {
    const handle = await resolveWindowHandle(payload.window);
    if (!handle) {
      return { error: 'No Windows Terminal found' };
    }

    let text = await context.automation.readBuffer(handle, payload.paneId, payload.shellPid);
    if (text && context.services.watchers.listWatchers().length > 0) {
      const matches = context.services.watchers.checkOutput(payload.paneId, handle, text);
      for (const match of matches) {
        context.emit(match);
        if (match.action === 'trigger') {
          await context.services.scheduler.handleWatcherMatch(match.watcher_id);
        }
      }
    }
    if (text && payload.lines && payload.lines > 0) {
      text = text.split('\n').slice(-payload.lines).join('\n');
    }
    return { pane_id: payload.paneId, buffer: text };
  });

  ipcMain.handle('wt:panes:input:send', async (_event, payload: {
    paneId: number;
    text: string;
    window?: number;
  }) => {
    const handle = await resolveWindowHandle(payload.window);
    if (!handle) {
      return { error: 'No Windows Terminal found' };
    }
    const ok = await context.automation.sendInput(handle, payload.paneId, payload.text);
    return { ok };
  });

  ipcMain.handle('wt:panes:split', async (_event, payload: {
    direction?: string;
    window?: number;
    pane_id?: number | null;
    profile?: string;
    cwd?: string;
  }) => {
    if (payload.window && payload.pane_id !== undefined && payload.pane_id !== null) {
      const ok = await context.automation.splitPane(
        payload.window,
        payload.pane_id,
        payload.direction ?? 'vertical',
      );
      if (ok) {
        await context.services.poller.forcePoll();
      }
      return { ok };
    }

    const result = await context.wtCli.splitPane({
      direction: payload.direction,
      profile: payload.profile,
      cwd: payload.cwd,
    });
    if (result.ok) {
      await context.services.poller.forcePoll();
    }
    return result;
  });

  ipcMain.handle('wt:panes:focus', async (_event, payload: { paneId: number; window?: number }) => {
    const handle = await resolveWindowHandle(payload.window);
    if (!handle) {
      return { error: 'No Windows Terminal found' };
    }
    const ok = await context.automation.focusPane(handle, payload.paneId);
    return { ok };
  });

  ipcMain.handle('wt:processes:list', async () => context.automation.listProcesses());

  ipcMain.handle('wt:layouts:list', async () => context.services.layouts.listLayouts());

  ipcMain.handle('wt:layouts:save-named', async (_event, name: string) => {
    const state = await context.automation.getState();
    return { ok: true, path: context.services.layouts.saveLayout(name, state) };
  });
  ipcMain.handle('wt:layouts:restore', async (_event, name: string) => {
    const layout = context.services.layouts.getLayout(name);
    if (!layout) {
      return { ok: false, error: 'Layout not found' };
    }
    const args = context.services.layouts.buildRestoreCommand(layout);
    const result = await context.wtCli.runCommand(args);
    return {
      ...result,
      command: ['wt', ...args].join(' '),
    };
  });
  ipcMain.handle('wt:layouts:delete', async (_event, name: string) => ({
    ok: context.services.layouts.deleteLayout(name),
  }));

  ipcMain.handle('wt:agents:list', async () => context.services.agents.listAgents());
  ipcMain.handle('wt:agents:claim', async (_event, payload: { agent_id: string; pane_id: number; role?: string }) =>
    context.services.agents.claim(payload.agent_id, payload.pane_id, payload.role),
  );
  ipcMain.handle('wt:agents:release', async (_event, payload: { agent_id: string }) =>
    context.services.agents.release(payload.agent_id),
  );

  ipcMain.handle('wt:actions:list', async (_event, filters?: { category?: string; search?: string }) => {
    const actions = filters?.search
      ? context.actionRegistry.search(filters.search)
      : filters?.category
        ? context.actionRegistry.byCategory(filters.category)
        : context.actionRegistry.all();
    return buildActionsResponse(actions);
  });

  ipcMain.handle('wt:actions:categories:list', async () =>
    buildCategoriesResponse(context.actionRegistry.categories()),
  );

  ipcMain.handle('wt:actions:execute', async (_event, payload: {
    action_id: string;
    window?: number;
    pane_id?: number | null;
    args?: Record<string, unknown>;
  }) => {
    const handle = await resolveWindowHandle(payload.window);
    if (!handle) {
      return { ok: false, error: 'No Windows Terminal found' };
    }
    const result = await context.actionExecutor.execute(
      payload.action_id,
      handle,
      payload.pane_id ?? null,
      payload.args,
    );
    if (result.ok && context.services.macros.recording) {
      context.services.macros.recordStep(payload.action_id, payload.args);
    }
    if (result.ok && result.changes_structure) {
      await context.services.poller.forcePoll();
    }
    return result;
  });

  ipcMain.handle('wt:macros:list', async () => ({ macros: context.services.macros.listMacros() }));
  ipcMain.handle('wt:macros:get', async (_event, name: string) => {
    const macro = context.services.macros.getMacro(name);
    return macro ?? { error: 'Macro not found' };
  });
  ipcMain.handle('wt:macros:save', async (_event, payload: { name: string; steps: MacroStep[] }) => ({
    ok: true,
    path: context.services.macros.saveMacro(payload.name, payload.steps),
  }));
  ipcMain.handle('wt:macros:delete', async (_event, name: string) => ({
    ok: context.services.macros.deleteMacro(name),
  }));
  ipcMain.handle('wt:macros:run', async (_event, payload: {
    name: string;
    window?: number | null;
    pane_id?: number | null;
  }) => {
    const handle = await resolveWindowHandle(payload.window ?? undefined);
    if (!handle) {
      return { ok: false, error: 'No Windows Terminal found' };
    }
    const result = await context.services.macros.executeMacro(
      payload.name,
      context.actionExecutor,
      handle,
      payload.pane_id ?? null,
    );
    if (result.changes_structure) {
      await context.services.poller.forcePoll();
    }
    return result;
  });
  ipcMain.handle('wt:macros:record:start', async () => {
    context.services.macros.startRecording();
    return { ok: true, recording: true };
  });
  ipcMain.handle('wt:macros:record:stop', async () => ({
    ok: true,
    steps: context.services.macros.stopRecording(),
  }));

  ipcMain.handle('wt:watchers:list', async () => ({ watchers: context.services.watchers.listWatchers() }));
  ipcMain.handle('wt:watchers:create', async (_event, payload: {
    name: string;
    pane_id: number;
    window_handle: number;
    pattern: string;
    action?: string;
    trigger_action_id?: string | null;
  }) => {
    try {
      const watcher = context.services.watchers.addWatcher(payload);
      return { ok: true, watcher };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('wt:watchers:delete', async (_event, watcherId: string) => ({
    ok: context.services.watchers.removeWatcher(watcherId),
  }));
  ipcMain.handle('wt:watchers:toggle', async (_event, watcherId: string) => {
    const watcher = context.services.watchers.toggleWatcher(watcherId);
    if (!watcher) {
      return { ok: false, error: 'Watcher not found' };
    }
    return { ok: true, watcher };
  });

  ipcMain.handle('wt:scheduler:jobs:list', async () => ({ jobs: context.services.scheduler.listJobs() }));
  ipcMain.handle('wt:scheduler:jobs:create', async (_event, payload: Omit<ScheduledJob, 'id' | 'status' | 'last_run' | 'next_run' | 'run_count' | 'created_at' | 'updated_at'>) => ({
    ok: true,
    job: context.services.scheduler.createJob(payload),
  }));
  ipcMain.handle('wt:scheduler:jobs:get', async (_event, jobId: string) => {
    const job = context.services.scheduler.getJob(jobId);
    return job ? { ok: true, job } : { ok: false, error: 'not found' };
  });
  ipcMain.handle('wt:scheduler:jobs:update', async (_event, payload: { id: string; updates: Record<string, unknown> }) => {
    const job = context.services.scheduler.updateJob(payload.id, payload.updates);
    return job ? { ok: true, job } : { ok: false, error: 'not found' };
  });
  ipcMain.handle('wt:scheduler:jobs:delete', async (_event, jobId: string) => ({
    ok: context.services.scheduler.deleteJob(jobId),
  }));
  ipcMain.handle('wt:scheduler:jobs:run', async (_event, jobId: string) => {
    const run = await context.services.scheduler.executeJob(jobId, 'manual');
    return run ? { ok: true, run } : { ok: false, error: 'job not found or disabled' };
  });
  ipcMain.handle('wt:scheduler:jobs:pause', async (_event, jobId: string) => {
    const job = context.services.scheduler.pauseJob(jobId);
    return job ? { ok: true, job } : { ok: false, error: 'not found' };
  });
  ipcMain.handle('wt:scheduler:jobs:resume', async (_event, jobId: string) => {
    const job = context.services.scheduler.resumeJob(jobId);
    return job ? { ok: true, job } : { ok: false, error: 'not found' };
  });
  ipcMain.handle('wt:scheduler:jobs:cancel', async (_event, jobId: string) => ({
    ok: context.services.scheduler.updateJob(jobId, { status: 'idle' }) !== null,
  }));
  ipcMain.handle('wt:scheduler:history:get', async (_event, payload: { jobId: string; limit?: number }) => ({
    history: context.services.scheduler.getHistory(payload.jobId, payload.limit),
  }));
  ipcMain.handle('wt:scheduler:history:list', async (_event, limit?: number) => ({
    history: context.services.scheduler.getHistory(undefined, limit),
  }));
  ipcMain.handle('wt:scheduler:settings:get', async () => context.services.scheduler.getSettings());
  ipcMain.handle('wt:scheduler:settings:update', async (_event, updates: Record<string, unknown>) =>
    context.services.scheduler.updateSettings(updates as never),
  );
}

