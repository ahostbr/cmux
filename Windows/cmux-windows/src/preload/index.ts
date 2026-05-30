import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActionDef,
  ActionsResponse,
  AgentClaim,
  BrowserSurfaceState,
  CategoriesResponse,
  ExecuteResponse,
  JobRun,
  Layout,
  MacroDetail,
  MacroStep,
  ProcessGroup,
  ScheduledJob,
  SchedulerSettings,
  SidebarState,
  StreamMessage,
  Watcher,
  WtState,
} from '../shared/types';

const electronApp = {
  info: () => ipcRenderer.invoke('app:info') as Promise<{
    name: string;
    electron: string;
    chrome: string;
    node: string;
  }>,
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key) as Promise<unknown>,
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value) as Promise<unknown>,
  },
};

const workspaceWindow = {
  minimize: () => ipcRenderer.send('wt:window:minimize'),
  maximize: () => ipcRenderer.send('wt:window:maximize'),
  close: () => ipcRenderer.send('wt:window:close'),
  isMaximized: () => ipcRenderer.invoke('wt:window:is-maximized') as Promise<boolean>,
  spanAllMonitors: () => ipcRenderer.send('wt:window:span-all-monitors'),
  restoreSpan: () => ipcRenderer.send('wt:window:restore-span'),
  isSpanned: () => ipcRenderer.invoke('wt:window:is-spanned') as Promise<boolean>,
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on('wt:window:maximize-change', handler);
    return () => ipcRenderer.removeListener('wt:window:maximize-change', handler);
  },
  onSpanChange: (callback: (spanned: boolean) => void) => {
    const handler = (_event: unknown, spanned: boolean) => callback(spanned);
    ipcRenderer.on('wt:window:span-change', handler);
    return () => ipcRenderer.removeListener('wt:window:span-change', handler);
  },
};

export interface CmuxWindowsApi {
  terminal: {
    health(): Promise<{ status: string; version: string }>;
    listPanes(): Promise<WtState>;
    getBuffer(input: { paneId: number; lines?: number; window?: number; shellPid?: number }): Promise<{ pane_id: number; buffer: string | null; error?: string }>;
    sendInput(input: { paneId: number; text: string; window?: number }): Promise<{ ok: boolean; error?: string }>;
    splitPane(input: { direction?: string; window?: number; pane_id?: number | null; profile?: string; cwd?: string }): Promise<ExecuteResponse>;
    focusPane(input: { paneId: number; window?: number }): Promise<{ ok: boolean; error?: string }>;
    listProcesses(): Promise<ProcessGroup[]>;
  };
  layouts: {
    list(): Promise<Layout[]>;
    save(name: string): Promise<{ ok: boolean; path: string }>;
    restore(name: string): Promise<ExecuteResponse & { command?: string }>;
    delete(name: string): Promise<{ ok: boolean }>;
  };
  agents: {
    list(): Promise<AgentClaim[]>;
    claim(input: { agent_id: string; pane_id: number; role?: string }): Promise<{ ok: boolean; claim?: AgentClaim; error?: string }>;
    release(input: { agent_id: string }): Promise<{ ok: boolean; error?: string }>;
  };
  actions: {
    list(filters?: { category?: string; search?: string }): Promise<ActionsResponse>;
    categories(): Promise<CategoriesResponse>;
    execute(input: { action_id: string; window?: number; pane_id?: number | null; args?: Record<string, unknown> }): Promise<ExecuteResponse>;
  };
  macros: {
    list(): Promise<{ macros: Array<{ name: string; steps: number; created: number | null }> }>;
    get(name: string): Promise<MacroDetail | { error: string }>;
    save(input: { name: string; steps: MacroStep[] }): Promise<{ ok: boolean; path: string }>;
    delete(name: string): Promise<{ ok: boolean }>;
    run(input: { name: string; window?: number | null; pane_id?: number | null }): Promise<Record<string, unknown>>;
    startRecording(): Promise<{ ok: boolean; recording: boolean }>;
    stopRecording(): Promise<{ ok: boolean; steps: MacroStep[] }>;
  };
  watchers: {
    list(): Promise<{ watchers: Watcher[] }>;
    create(input: { name: string; pane_id: number; window_handle: number; pattern: string; action?: string; trigger_action_id?: string | null }): Promise<{ ok: boolean; watcher?: Watcher; error?: string }>;
    delete(watcherId: string): Promise<{ ok: boolean }>;
    toggle(watcherId: string): Promise<{ ok: boolean; watcher?: Watcher; error?: string }>;
  };
  scheduler: {
    listJobs(): Promise<{ jobs: ScheduledJob[] }>;
    createJob(input: Omit<ScheduledJob, 'id' | 'status' | 'last_run' | 'next_run' | 'run_count' | 'created_at' | 'updated_at'>): Promise<{ ok: boolean; job: ScheduledJob }>;
    getJob(jobId: string): Promise<{ ok: boolean; job?: ScheduledJob; error?: string }>;
    updateJob(id: string, updates: Record<string, unknown>): Promise<{ ok: boolean; job?: ScheduledJob; error?: string }>;
    deleteJob(jobId: string): Promise<{ ok: boolean }>;
    runJob(jobId: string): Promise<{ ok: boolean; run?: JobRun; error?: string }>;
    pauseJob(jobId: string): Promise<{ ok: boolean; job?: ScheduledJob; error?: string }>;
    resumeJob(jobId: string): Promise<{ ok: boolean; job?: ScheduledJob; error?: string }>;
    cancelJob(jobId: string): Promise<{ ok: boolean }>;
    getHistory(jobId: string, limit?: number): Promise<{ history: JobRun[] }>;
    listHistory(limit?: number): Promise<{ history: JobRun[] }>;
    getSettings(): Promise<SchedulerSettings>;
    updateSettings(updates: Partial<SchedulerSettings>): Promise<SchedulerSettings>;
  };
  stream: {
    onEvent(callback: (message: StreamMessage) => void): () => void;
  };
  sidebar: {
    getState(): Promise<SidebarState>;
    setState(input: { visible?: boolean; mode?: string }): Promise<SidebarState>;
    toggle(): Promise<SidebarState>;
  };
  browser: {
    getState(): Promise<BrowserSurfaceState>;
    updateState(input: Partial<BrowserSurfaceState>): Promise<BrowserSurfaceState>;
  };
  window: typeof workspaceWindow;
}

const api: CmuxWindowsApi = {
  terminal: {
    health: () => ipcRenderer.invoke('wt:health:get'),
    listPanes: () => ipcRenderer.invoke('wt:panes:list'),
    getBuffer: (input) => ipcRenderer.invoke('wt:panes:buffer:get', input),
    sendInput: (input) => ipcRenderer.invoke('wt:panes:input:send', input),
    splitPane: (input) => ipcRenderer.invoke('wt:panes:split', input),
    focusPane: (input) => ipcRenderer.invoke('wt:panes:focus', input),
    listProcesses: () => ipcRenderer.invoke('wt:processes:list'),
  },
  layouts: {
    list: () => ipcRenderer.invoke('wt:layouts:list'),
    save: (name) => ipcRenderer.invoke('wt:layouts:save-named', name),
    restore: (name) => ipcRenderer.invoke('wt:layouts:restore', name),
    delete: (name) => ipcRenderer.invoke('wt:layouts:delete', name),
  },
  agents: {
    list: () => ipcRenderer.invoke('wt:agents:list'),
    claim: (input) => ipcRenderer.invoke('wt:agents:claim', input),
    release: (input) => ipcRenderer.invoke('wt:agents:release', input),
  },
  actions: {
    list: (filters) => ipcRenderer.invoke('wt:actions:list', filters),
    categories: () => ipcRenderer.invoke('wt:actions:categories:list'),
    execute: (input) => ipcRenderer.invoke('wt:actions:execute', input),
  },
  macros: {
    list: () => ipcRenderer.invoke('wt:macros:list'),
    get: (name) => ipcRenderer.invoke('wt:macros:get', name),
    save: (input) => ipcRenderer.invoke('wt:macros:save', input),
    delete: (name) => ipcRenderer.invoke('wt:macros:delete', name),
    run: (input) => ipcRenderer.invoke('wt:macros:run', input),
    startRecording: () => ipcRenderer.invoke('wt:macros:record:start'),
    stopRecording: () => ipcRenderer.invoke('wt:macros:record:stop'),
  },
  watchers: {
    list: () => ipcRenderer.invoke('wt:watchers:list'),
    create: (input) => ipcRenderer.invoke('wt:watchers:create', input),
    delete: (watcherId) => ipcRenderer.invoke('wt:watchers:delete', watcherId),
    toggle: (watcherId) => ipcRenderer.invoke('wt:watchers:toggle', watcherId),
  },
  scheduler: {
    listJobs: () => ipcRenderer.invoke('wt:scheduler:jobs:list'),
    createJob: (input) => ipcRenderer.invoke('wt:scheduler:jobs:create', input),
    getJob: (jobId) => ipcRenderer.invoke('wt:scheduler:jobs:get', jobId),
    updateJob: (id, updates) => ipcRenderer.invoke('wt:scheduler:jobs:update', { id, updates }),
    deleteJob: (jobId) => ipcRenderer.invoke('wt:scheduler:jobs:delete', jobId),
    runJob: (jobId) => ipcRenderer.invoke('wt:scheduler:jobs:run', jobId),
    pauseJob: (jobId) => ipcRenderer.invoke('wt:scheduler:jobs:pause', jobId),
    resumeJob: (jobId) => ipcRenderer.invoke('wt:scheduler:jobs:resume', jobId),
    cancelJob: (jobId) => ipcRenderer.invoke('wt:scheduler:jobs:cancel', jobId),
    getHistory: (jobId, limit) => ipcRenderer.invoke('wt:scheduler:history:get', { jobId, limit }),
    listHistory: (limit) => ipcRenderer.invoke('wt:scheduler:history:list', limit),
    getSettings: () => ipcRenderer.invoke('wt:scheduler:settings:get'),
    updateSettings: (updates) => ipcRenderer.invoke('wt:scheduler:settings:update', updates),
  },
  stream: {
    onEvent: (callback) => {
      const handler = (_event: unknown, payload: StreamMessage) => callback(payload);
      ipcRenderer.on('wt:stream:event', handler);
      return () => ipcRenderer.removeListener('wt:stream:event', handler);
    },
  },
  sidebar: {
    getState: () => ipcRenderer.invoke('right-sidebar:state:get') as Promise<SidebarState>,
    setState: (input) => ipcRenderer.invoke('right-sidebar:state:set', input) as Promise<SidebarState>,
    toggle: () => ipcRenderer.invoke('right-sidebar:toggle') as Promise<SidebarState>,
  },
  browser: {
    getState: () => ipcRenderer.invoke('browser:state:get') as Promise<BrowserSurfaceState>,
    updateState: (input) => ipcRenderer.invoke('browser:state:update', input) as Promise<BrowserSurfaceState>,
  },
  window: workspaceWindow,
};

contextBridge.exposeInMainWorld('electronApp', electronApp);
contextBridge.exposeInMainWorld('workspaceWindow', workspaceWindow);
contextBridge.exposeInMainWorld('liteWinTerminal', api);

export type ElectronAppApi = typeof electronApp;
export type WorkspaceWindowApi = typeof workspaceWindow;
