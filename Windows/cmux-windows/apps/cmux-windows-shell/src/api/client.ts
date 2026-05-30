import type {
  ActionDef,
  ActionsResponse,
  CategoriesResponse,
  ExecuteResponse,
} from '../types/actions';
import type {
  AgentClaim,
  BrowserSurfaceState,
  JobRun,
  Layout,
  MacroStep,
  ScheduledJob,
  SchedulerSettings,
  SidebarState,
  StreamMessage,
  Watcher,
  WtState,
} from '@shared/types';

const isDesktopBridgeAvailable = typeof window !== 'undefined' && Boolean(window.liteWinTerminal);

const mockActions: ActionDef[] = [
  {
    id: 'split_right',
    name: 'Split Pane Right',
    category: 'pane',
    method: 'shortcut',
    shortcut: 'Alt+Shift+=',
    palette_name: 'Split Right',
    args: [],
    changes_structure: true,
    description: 'Split the current pane vertically.',
  },
  {
    id: 'split_down',
    name: 'Split Pane Down',
    category: 'pane',
    method: 'shortcut',
    shortcut: 'Alt+Shift+-',
    palette_name: 'Split Down',
    args: [],
    changes_structure: true,
    description: 'Split the current pane horizontally.',
  },
  {
    id: 'new_tab',
    name: 'New Tab',
    category: 'tab',
    method: 'shortcut',
    shortcut: 'Ctrl+Shift+T',
    palette_name: 'New Tab',
    args: [],
    changes_structure: true,
    description: 'Open a new tab.',
  },
];

const mockState: WtState = {
  windows: [
    {
      handle: 1001,
      title: 'Windows Terminal - cmux Windows Preview',
      pid: 4242,
      panes: [
        {
          id: 1,
          title: 'pwsh',
          focused: true,
          class_name: 'TermControl',
          control_type: 'Pane',
          rect: { left: 0, top: 0, right: 640, bottom: 420 },
        },
        {
          id: 2,
          title: 'git-status',
          focused: false,
          class_name: 'TermControl',
          control_type: 'Pane',
          rect: { left: 640, top: 0, right: 1280, bottom: 420 },
        },
      ],
      shells: [
        {
          pid: 6001,
          name: 'pwsh.exe',
          cmdline: 'pwsh.exe -NoLogo',
          cwd: 'C:\\Projects\\cmux',
          cpu_percent: 3.4,
          memory_mb: 118,
          create_time: new Date().toISOString(),
        },
        {
          pid: 6002,
          name: 'bash.exe',
          cmdline: 'bash -lc tail -f app.log',
          cwd: 'C:\\Projects\\cmux\\logs',
          cpu_percent: 1.2,
          memory_mb: 74,
          create_time: new Date().toISOString(),
        },
      ],
    },
  ],
};

const mockWatchers: Watcher[] = [
  {
    id: 'watcher-1',
    name: 'Errors',
    pane_id: 1,
    window_handle: 1001,
    pattern: 'ERROR|FAIL',
    action: 'highlight',
    trigger_action_id: null,
    enabled: true,
    match_count: 2,
    last_match: 'ERROR Unable to load profile cache',
  },
];

const mockLayouts: Layout[] = [
  { name: 'default', tabs: [{ profile: 'PowerShell', cwd: 'C:\\Projects\\cmux' }] },
];

const mockAgents: AgentClaim[] = [
  {
    agent_id: 'agent-alpha',
    pane_id: 1,
    role: 'monitor',
    claimed_at: new Date().toISOString(),
    last_command: { text: 'tail -f app.log', at: new Date().toISOString() },
  },
];

const mockMacros = [
  {
    name: 'bootstrap',
    steps: [
      { action_id: 'new_tab', delay_ms: 0 },
      { action_id: 'split_right', delay_ms: 200 },
    ],
    created: Date.now(),
  },
];

const mockSchedulerSettings: SchedulerSettings = {
  enabled: true,
  max_concurrent_jobs: 3,
  history_retention_days: 30,
  poll_interval_ms: 1000,
};

const mockJobs: ScheduledJob[] = [
  {
    id: 'job-1',
    name: 'Morning Bootstrap',
    description: 'Open the daily workspace layout.',
    enabled: true,
    trigger: { type: 'schedule', schedule: { type: 'interval', every: 4, unit: 'hours' } },
    action: { type: 'macro', macro_name: 'bootstrap' },
    target_pane_id: 1,
    target_window_handle: 1001,
    status: 'idle',
    last_run: null,
    next_run: null,
    run_count: 0,
    tags: ['demo'],
    notify_on_start: true,
    notify_on_complete: true,
    notify_on_error: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockHistory: JobRun[] = [];
const mockSettings = new Map<string, unknown>();
const mockSidebarState: SidebarState = {
  visible: true,
  mode: 'sessions',
  statuses: [],
  progress: [],
  log: [],
};
const mockBrowserState: BrowserSurfaceState = {
  visible: false,
  url: 'https://www.google.com/',
  title: null,
  canGoBack: false,
  canGoForward: false,
  loading: false,
  focused: false,
  webContentsId: null,
  updated_at: new Date().toISOString(),
};

function computeCategories(): CategoriesResponse {
  const categories: Record<string, number> = {};
  for (const action of mockActions) {
    categories[action.category] = (categories[action.category] ?? 0) + 1;
  }
  return { categories };
}

function mockBuffer(paneId: number): string {
  const prefix = paneId === 1 ? 'pwsh' : 'bash';
  return [
    `${prefix}> pnpm dev`,
    '> electron-vite dev',
    '> workspace shell ready',
    paneId === 1 ? 'INFO Monitoring Windows Terminal state' : 'tail -f logs/app.log',
    paneId === 1 ? 'ERROR Unable to load profile cache' : 'INFO Waiting for file changes',
  ].join('\n');
}

async function withDesktopBridge<T>(handler: () => Promise<T>, fallback: () => Promise<T> | T): Promise<T> {
  if (isDesktopBridgeAvailable) {
    return handler();
  }
  return Promise.resolve(fallback());
}

export const liteWinTerminalClient = {
  isDesktop: isDesktopBridgeAvailable,
  app: {
    info: async () => {
      if (window.electronApp?.info) {
        return window.electronApp.info();
      }
      return {
        name: 'cmux Windows Web Preview',
        electron: 'browser',
        chrome: navigator.userAgent,
        node: 'n/a',
      };
    },
  },
  settings: {
    get: async <T = unknown>(key: string, fallback?: T): Promise<T> =>
      withDesktopBridge(
        async () => {
          const value = await window.electronApp.settings.get(key);
          return (value ?? fallback) as T;
        },
        () => (mockSettings.has(key) ? (mockSettings.get(key) as T) : (fallback as T)),
      ),
    set: async <T = unknown>(key: string, value: T): Promise<T> =>
      withDesktopBridge(
        async () => window.electronApp.settings.set(key, value) as Promise<T>,
        () => {
          mockSettings.set(key, value);
          return value;
        },
      ),
  },
  terminal: {
    health: () =>
      withDesktopBridge(
        () => window.liteWinTerminal.terminal.health(),
        () => ({ status: 'ok', version: 'web-preview' }),
      ),
    listPanes: () => withDesktopBridge(() => window.liteWinTerminal.terminal.listPanes(), () => mockState),
    getBuffer: (input: { paneId: number; lines?: number; window?: number; shellPid?: number }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.terminal.getBuffer(input),
        () => ({ pane_id: input.paneId, buffer: mockBuffer(input.paneId) }),
      ),
    sendInput: (input: { paneId: number; text: string; window?: number }) =>
      withDesktopBridge(() => window.liteWinTerminal.terminal.sendInput(input), () => ({ ok: true })),
    splitPane: (input: { direction?: string; window?: number; pane_id?: number | null; profile?: string; cwd?: string }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.terminal.splitPane(input),
        () => ({ ok: true, changes_structure: true, action: input.direction ?? 'split' } as ExecuteResponse),
      ),
    focusPane: (input: { paneId: number; window?: number }) =>
      withDesktopBridge(() => window.liteWinTerminal.terminal.focusPane(input), () => ({ ok: true })),
    listProcesses: () =>
      withDesktopBridge(
        () => window.liteWinTerminal.terminal.listProcesses(),
        () =>
          mockState.windows.map((windowItem) => ({
            pid: windowItem.pid,
            name: windowItem.title,
            create_time: new Date().toISOString(),
            shells: windowItem.shells,
          })),
      ),
  },
  layouts: {
    list: () => withDesktopBridge(() => window.liteWinTerminal.layouts.list(), () => mockLayouts),
    save: (name: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.layouts.save(name),
        () => ({ ok: true, path: `mock://${name}.json` }),
      ),
    restore: (name: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.layouts.restore(name),
        () => ({ ok: true, action: `restore:${name}` } as ExecuteResponse & { command?: string }),
      ),
    delete: (name: string) => withDesktopBridge(() => window.liteWinTerminal.layouts.delete(name), () => ({ ok: true })),
  },
  agents: {
    list: () => withDesktopBridge(() => window.liteWinTerminal.agents.list(), () => mockAgents),
    claim: (input: { agent_id: string; pane_id: number; role?: string }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.agents.claim(input),
        () => ({
          ok: true,
          claim: {
            ...input,
            role: input.role ?? 'operator',
            claimed_at: new Date().toISOString(),
            last_command: null,
          } as AgentClaim,
        }),
      ),
    release: (input: { agent_id: string }) =>
      withDesktopBridge(() => window.liteWinTerminal.agents.release(input), () => ({ ok: true })),
  },
  actions: {
    list: (filters?: { category?: string; search?: string }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.actions.list(filters),
        () => {
          const actions = mockActions.filter((action) => {
            if (filters?.category && action.category !== filters.category) return false;
            if (filters?.search) {
              const query = filters.search.toLowerCase();
              return action.id.includes(query) || action.name.toLowerCase().includes(query);
            }
            return true;
          });
          return { actions, total: actions.length } as ActionsResponse;
        },
      ),
    categories: () => withDesktopBridge(() => window.liteWinTerminal.actions.categories(), () => computeCategories()),
    execute: (input: { action_id: string; window?: number; pane_id?: number | null; args?: Record<string, unknown> }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.actions.execute(input),
        () =>
          ({
            ok: true,
            action: input.action_id,
            changes_structure: input.action_id.startsWith('split') || input.action_id === 'new_tab',
          }) as ExecuteResponse,
      ),
  },
  macros: {
    list: () =>
      withDesktopBridge(
        () => window.liteWinTerminal.macros.list(),
        () => ({ macros: mockMacros.map(({ name, steps, created }) => ({ name, steps: steps.length, created })) }),
      ),
    get: (name: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.macros.get(name),
        () => mockMacros.find((macro) => macro.name === name) ?? { error: 'Macro not found' },
      ),
    save: (input: { name: string; steps: MacroStep[] }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.macros.save(input),
        () => ({ ok: true, path: `mock://${input.name}.json` }),
      ),
    delete: (name: string) => withDesktopBridge(() => window.liteWinTerminal.macros.delete(name), () => ({ ok: true })),
    run: (input: { name: string; window?: number | null; pane_id?: number | null }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.macros.run(input),
        () => ({ ok: true, macro: input.name, steps_run: 2, steps_total: 2, changes_structure: true }),
      ),
    startRecording: () =>
      withDesktopBridge(() => window.liteWinTerminal.macros.startRecording(), () => ({ ok: true, recording: true })),
    stopRecording: () =>
      withDesktopBridge(() => window.liteWinTerminal.macros.stopRecording(), () => ({ ok: true, steps: [] })),
  },
  watchers: {
    list: () => withDesktopBridge(() => window.liteWinTerminal.watchers.list(), () => ({ watchers: mockWatchers })),
    create: (input: { name: string; pane_id: number; window_handle: number; pattern: string; action?: string; trigger_action_id?: string | null }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.watchers.create(input),
        () => ({
          ok: true,
          watcher: {
            ...input,
            action: input.action ?? 'notify',
            trigger_action_id: input.trigger_action_id ?? null,
            id: `mock-${Date.now()}`,
            enabled: true,
            match_count: 0,
            last_match: null,
          },
        }),
      ),
    delete: (watcherId: string) =>
      withDesktopBridge(() => window.liteWinTerminal.watchers.delete(watcherId), () => ({ ok: true })),
    toggle: (watcherId: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.watchers.toggle(watcherId),
        () => ({ ok: true, watcher: mockWatchers.find((watcher) => watcher.id === watcherId) }),
      ),
  },
  scheduler: {
    listJobs: () => withDesktopBridge(() => window.liteWinTerminal.scheduler.listJobs(), () => ({ jobs: mockJobs })),
    createJob: (input: Omit<ScheduledJob, 'id' | 'status' | 'last_run' | 'next_run' | 'run_count' | 'created_at' | 'updated_at'>) =>
      withDesktopBridge(
        () => window.liteWinTerminal.scheduler.createJob(input),
        () =>
          ({
            ok: true,
            job: {
              ...input,
              id: `job-${Date.now()}`,
              status: 'idle',
              run_count: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as ScheduledJob,
          }),
      ),
    getJob: (jobId: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.scheduler.getJob(jobId),
        () => ({ ok: true, job: mockJobs.find((job) => job.id === jobId) }),
      ),
    updateJob: (id: string, updates: Record<string, unknown>) =>
      withDesktopBridge(
        () => window.liteWinTerminal.scheduler.updateJob(id, updates),
        () => ({ ok: true, job: { ...mockJobs[0], ...updates, id } as ScheduledJob }),
      ),
    deleteJob: (jobId: string) =>
      withDesktopBridge(() => window.liteWinTerminal.scheduler.deleteJob(jobId), () => ({ ok: true })),
    runJob: (jobId: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.scheduler.runJob(jobId),
        () =>
          ({
            ok: true,
            run: {
              id: `run-${Date.now()}`,
              job_id: jobId,
              started_at: new Date().toISOString(),
              status: 'completed',
              triggered_by: 'manual',
            } as JobRun,
          }),
      ),
    pauseJob: (jobId: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.scheduler.pauseJob(jobId),
        () => ({ ok: true, job: { ...mockJobs[0], id: jobId, status: 'paused' } as ScheduledJob }),
      ),
    resumeJob: (jobId: string) =>
      withDesktopBridge(
        () => window.liteWinTerminal.scheduler.resumeJob(jobId),
        () => ({ ok: true, job: { ...mockJobs[0], id: jobId, status: 'idle' } as ScheduledJob }),
      ),
    cancelJob: (jobId: string) =>
      withDesktopBridge(() => window.liteWinTerminal.scheduler.cancelJob(jobId), () => ({ ok: true })),
    getHistory: (jobId: string, limit?: number) =>
      withDesktopBridge(() => window.liteWinTerminal.scheduler.getHistory(jobId, limit), () => ({ history: mockHistory })),
    listHistory: (limit?: number) =>
      withDesktopBridge(() => window.liteWinTerminal.scheduler.listHistory(limit), () => ({ history: mockHistory })),
    getSettings: () =>
      withDesktopBridge(() => window.liteWinTerminal.scheduler.getSettings(), () => mockSchedulerSettings),
    updateSettings: (updates: Partial<SchedulerSettings>) =>
      withDesktopBridge(
        () => window.liteWinTerminal.scheduler.updateSettings(updates),
        () => ({ ...mockSchedulerSettings, ...updates }),
      ),
  },
  stream: {
    onEvent: (callback: (message: StreamMessage) => void) => {
      if (isDesktopBridgeAvailable) {
        return window.liteWinTerminal.stream.onEvent(callback);
      }
      const timer = window.setInterval(() => {
        callback({ type: 'state', data: mockState });
      }, 5000);
      return () => window.clearInterval(timer);
    },
  },
  sidebar: {
    getState: () => withDesktopBridge(() => window.liteWinTerminal.sidebar.getState(), () => mockSidebarState),
    setState: (input: { visible?: boolean; mode?: string }) =>
      withDesktopBridge(
        () => window.liteWinTerminal.sidebar.setState(input),
        () => {
          Object.assign(mockSidebarState, input);
          return { ...mockSidebarState };
        },
      ),
    toggle: () =>
      withDesktopBridge(
        () => window.liteWinTerminal.sidebar.toggle(),
        () => {
          mockSidebarState.visible = !mockSidebarState.visible;
          return { ...mockSidebarState };
        },
      ),
  },
  browser: {
    getState: () => withDesktopBridge(() => window.liteWinTerminal.browser.getState(), () => ({ ...mockBrowserState })),
    updateState: (input: Partial<BrowserSurfaceState>) =>
      withDesktopBridge(
        () => window.liteWinTerminal.browser.updateState(input),
        () => {
          Object.assign(mockBrowserState, input, { updated_at: new Date().toISOString() });
          return { ...mockBrowserState };
        },
      ),
  },
  window: {
    minimize: () => {
      window.workspaceWindow?.minimize?.();
    },
    maximize: () => {
      window.workspaceWindow?.maximize?.();
    },
    close: () => {
      window.workspaceWindow?.close?.();
    },
    isMaximized: () => window.workspaceWindow?.isMaximized?.() ?? Promise.resolve(false),
    onMaximizeChange: (callback: (maximized: boolean) => void) =>
      window.workspaceWindow?.onMaximizeChange?.(callback) ?? (() => {}),
    spanAllMonitors: () => {
      window.workspaceWindow?.spanAllMonitors?.();
    },
    restoreSpan: () => {
      window.workspaceWindow?.restoreSpan?.();
    },
    isSpanned: () => window.workspaceWindow?.isSpanned?.() ?? Promise.resolve(false),
    onSpanChange: (callback: (spanned: boolean) => void) =>
      window.workspaceWindow?.onSpanChange?.(callback) ?? (() => {}),
  },
};

export type CmuxWindowsClient = typeof liteWinTerminalClient;
