import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  appendWorkspacePanel,
  removeWorkspacePanel,
  reorderWorkspacePanels,
  upsertSingletonWorkspacePanel,
  type WorkspaceStateSnapshot,
  type WorkspaceActivityItem,
  type WorkspaceIcon,
  type WorkspaceLayoutMode,
  type WorkspacePanelDefinition,
  type GuiWorkspaceController,
  type WorkspacePanelRendererMap,
} from '@gui/workspace-core';
import { GuiWorkspace } from '@gui/workspace-react';
import { liteWinTerminalClient } from './api/client';
import { ActionToolbar } from './components/ActionToolbar';
import { AgentPanel } from './components/AgentPanel';
import { AnsiBuffer } from './components/AnsiBuffer';
import { CommandPalette } from './components/CommandPalette';
import { ControlBar } from './components/ControlBar';
import { LayoutManager } from './components/LayoutManager';
import { MacroEditor } from './components/MacroEditor';
import { MacroPanel } from './components/MacroPanel';
import { PaneGrid } from './components/PaneGrid';
import { ProcessBadge } from './components/ProcessBadge';
import { ProcessDetailToggle } from './components/ProcessDetail';
import { WatcherPanel } from './components/WatcherPanel';
import { WatcherToasts } from './components/WatcherToast';
import { SchedulerPanel } from './components/scheduler';
import { useActionRegistry } from './hooks/useActionRegistry';
import { useMacros, type MacroStep } from './hooks/useMacros';
import { useProcessMap, type ProcessInfo } from './hooks/useProcessMap';
import { useWtSocket } from './hooks/useWtSocket';
import type { ExecuteRequest, ExecuteResponse } from './types/actions';
import type { BrowserCommandEvent, BrowserSurfaceState, SidebarState, StreamMessage, Watcher, WtWindow } from '@shared/types';

type SidebarView = 'sessions';
type LitePanelType = 'terminal-session' | 'browser' | 'watchers' | 'macros' | 'scheduler' | 'agents' | 'layouts';

interface TerminalEntry {
  windowHandle: number;
  windowTitle: string;
  paneId: number;
  paneName: string;
}

interface LiteTerminalMetadata extends Record<string, unknown> {
  windowHandle: number;
  windowTitle: string;
  paneId: number;
  paneName: string;
}

interface LitePanel extends WorkspacePanelDefinition {
  type: LitePanelType;
  metadata?: LiteTerminalMetadata;
}

interface WatcherToastEvent extends Extract<StreamMessage, { type: 'watcher_match' }> {}

interface BrowserCommandSignal {
  sequence: number;
  event: BrowserCommandEvent;
}

interface BrowserWebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getWebContentsId(): number;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  isLoading(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
}

const emptySidebarState: SidebarState = {
  visible: true,
  mode: 'sessions',
  statuses: [],
  progress: [],
  log: [],
};
const defaultBrowserState: BrowserSurfaceState = {
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

const dragRegion = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragRegion = { WebkitAppRegion: 'no-drag' } as CSSProperties;

function makeIcon(path: string): WorkspaceIcon {
  return function Icon({ size = 18, strokeWidth = 1.8, className }) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d={path} />
      </svg>
    );
  };
}

const SessionsIcon = makeIcon('M4 6h16v4H4z M4 14h7v4H4z M13 14h7v4h-7z');
const WatchersIcon = makeIcon('M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M12 9v3l2 2');
const MacrosIcon = makeIcon('M5 5h14v14H5z M9 9h6 M9 12h6 M9 15h4');
const SchedulerIcon = makeIcon('M4 6h16 M7 3v6 M17 3v6 M6 10h12v10H6z');
const AgentsIcon = makeIcon('M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8 M5 20a7 7 0 0 1 14 0');
const LayoutsIcon = makeIcon('M5 5h6v6H5z M13 5h6v6h-6z M5 13h14v6H5z');
const BrowserIcon = makeIcon('M4 5h16v14H4z M4 9h16 M8 15h8');
const SidebarIcon = makeIcon('M5 5h4v14H5z M11 5h8v14h-8');
const GridIcon = makeIcon('M5 5h6v6H5z M13 5h6v6h-6z M5 13h6v6H5z M13 13h6v6h-6z');
const SplitIcon = makeIcon('M5 5h6v14H5z M13 5h6v14h-6z');
const TabsIcon = makeIcon('M4 7h16 M6 11h5 M13 11h5 M6 17h12');
const WindowIcon = makeIcon('M4 5h16v14H4z M4 9h16');
const MinimizeIcon = makeIcon('M6 12h12');
const MaximizeIcon = makeIcon('M6 6h12v12H6z');
const RestoreIcon = makeIcon('M8 8h10v10H8z M6 6h10');
const CloseIcon = makeIcon('M6 6l12 12 M18 6L6 18');

const layoutOptions: Array<{ mode: WorkspaceLayoutMode; label: string; icon: WorkspaceIcon }> = [
  { mode: 'grid', label: 'Grid', icon: GridIcon },
  { mode: 'splitter', label: 'Split', icon: SplitIcon },
  { mode: 'tabs', label: 'Tabs', icon: TabsIcon },
  { mode: 'window', label: 'Window', icon: WindowIcon },
];

const singletonTitles: Record<Exclude<LitePanelType, 'terminal-session'>, string> = {
  browser: 'Browser',
  watchers: 'Watcher Daemon',
  macros: 'Macro Engine',
  scheduler: 'Scheduler',
  agents: 'System Agents',
  layouts: 'Layout Manager',
};

function panelIdForTerminal(entry: TerminalEntry) {
  return `terminal-${entry.windowHandle}-${entry.paneId}`;
}

function panelTypeForActivity(itemId: string): Exclude<LitePanelType, 'terminal-session'> | null {
  switch (itemId) {
    case 'watchers':
    case 'browser':
    case 'macros':
    case 'scheduler':
    case 'agents':
    case 'layouts':
      return itemId;
    default:
      return null;
  }
}

function cleanTitle(title: string) {
  return title.replace(/[^\x20-\x7E]/g, '').trim() || 'Terminal';
}

function usePaneBuffer({ paneId, windowHandle, pollIntervalMs, enabled }: { paneId: number; windowHandle: number; pollIntervalMs: number; enabled: boolean; }) {
  const [buffer, setBuffer] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const load = async () => {
      try {
        const data = await liteWinTerminalClient.terminal.getBuffer({ paneId, window: windowHandle, lines: 80 });
        if (!disposed) setBuffer(data.buffer ?? '');
      } catch {
        if (!disposed) setBuffer('Error reading buffer');
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, pollIntervalMs);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [enabled, paneId, pollIntervalMs, windowHandle]);

  return buffer;
}

function TerminalSessionPanel({ panel, visible, pollIntervalMs, watchers, process, onSendInput, onExecute, onAfterExecute, onOpenPalette, onRefresh }: { panel: LitePanel; visible: boolean; pollIntervalMs: number; watchers: Watcher[]; process?: ProcessInfo; onSendInput: (paneId: number, text: string, window?: number) => void; onExecute: (req: ExecuteRequest) => Promise<ExecuteResponse>; onAfterExecute: () => void; onOpenPalette: () => void; onRefresh: () => void; }) {
  const metadata = panel.metadata;
  if (!metadata) return null;
  const buffer = usePaneBuffer({ paneId: metadata.paneId, windowHandle: metadata.windowHandle, pollIntervalMs, enabled: visible });
  const highlights = watchers.filter((watcher) => watcher.enabled && watcher.action === 'highlight' && watcher.pane_id === metadata.paneId && watcher.window_handle === metadata.windowHandle).map((watcher) => ({ pattern: watcher.pattern, watcherName: watcher.name }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex items-center gap-4 px-4 py-3 cyber-panel">
        <div className="flex min-w-0 flex-col">
          <span className="font-rajdhani text-sm font-bold tracking-widest text-cyber-accent uppercase truncate">{cleanTitle(metadata.windowTitle)}</span>
          <span className="text-xs text-cyber-text-dim font-jetbrains truncate">{metadata.paneName}</span>
        </div>
        <div className="hidden min-[1280px]:block"><ProcessBadge process={process} /></div>
        <div className="ml-auto">
          <ActionToolbar windowHandle={metadata.windowHandle} paneId={metadata.paneId} onExecute={onExecute} onAfterExecute={onAfterExecute} onOpenPalette={onOpenPalette} />
        </div>
      </div>
      <div className="flex-1 min-h-0 overscroll-contain font-jetbrains text-xs text-cyber-text bg-[#030408] p-4 overflow-auto whitespace-pre-wrap cyber-scrollbar cyber-panel relative group">
        <div className="absolute inset-0 pointer-events-none opacity-5 group-hover:opacity-10 transition-opacity bg-[radial-gradient(circle_at_center,rgba(133,224,113,0.7)_0,transparent_100%)]" />
        <div className="relative z-10">
          {buffer ? <AnsiBuffer buffer={buffer.slice(-8000)} highlights={highlights} /> : <span className="text-cyber-text-dim opacity-50">&gt; BUFFER EMPTY</span>}
        </div>
      </div>
      <ControlBar paneId={metadata.paneId} windowHandle={metadata.windowHandle} onSendInput={onSendInput} onAfterSplit={onRefresh} />
    </div>
  );
}

function normalizeBrowserInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return defaultBrowserState.url;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:') {
      return parsed.toString();
    }
  } catch {
    // Fall through to host/search coercion.
  }
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function BrowserPanel({ state, commandSignal, visible, onStateChange }: { state: BrowserSurfaceState; commandSignal: BrowserCommandSignal | null; visible: boolean; onStateChange: (patch: Partial<BrowserSurfaceState>) => void; }) {
  const webviewRef = useRef<BrowserWebviewElement | null>(null);
  const [address, setAddress] = useState(state.url);

  useEffect(() => {
    setAddress(state.url);
  }, [state.url]);

  const publishSnapshot = useCallback((patch: Partial<BrowserSurfaceState> = {}) => {
    const webview = webviewRef.current;
    if (!webview) {
      onStateChange({ ...patch, visible: true });
      return;
    }
    onStateChange({
      visible: true,
      url: webview.getURL() || state.url,
      title: webview.getTitle() || null,
      canGoBack: webview.canGoBack(),
      canGoForward: webview.canGoForward(),
      loading: webview.isLoading(),
      webContentsId: webview.getWebContentsId(),
      ...patch,
    });
  }, [onStateChange, state.url]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStart = () => publishSnapshot({ loading: true });
    const handleStop = () => publishSnapshot({ loading: false });
    const handleNavigate = () => publishSnapshot({ loading: webview.isLoading() });
    const handleReady = () => publishSnapshot({ loading: webview.isLoading() });
    const handleFocus = () => publishSnapshot({ focused: true });
    const handleBlur = () => publishSnapshot({ focused: false });

    webview.addEventListener('dom-ready', handleReady);
    webview.addEventListener('did-start-loading', handleStart);
    webview.addEventListener('did-stop-loading', handleStop);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);
    webview.addEventListener('page-title-updated', handleNavigate);
    webview.addEventListener('focus', handleFocus);
    webview.addEventListener('blur', handleBlur);
    return () => {
      webview.removeEventListener('dom-ready', handleReady);
      webview.removeEventListener('did-start-loading', handleStart);
      webview.removeEventListener('did-stop-loading', handleStop);
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
      webview.removeEventListener('page-title-updated', handleNavigate);
      webview.removeEventListener('focus', handleFocus);
      webview.removeEventListener('blur', handleBlur);
    };
  }, [publishSnapshot]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !commandSignal) return;

    const command = commandSignal.event.command;
    if (command === 'open' || command === 'navigate') {
      void webview.loadURL(commandSignal.event.state.url).catch((error) => {
        console.error('[cmux-windows] browser navigation failed:', error);
      });
      return;
    }
    if (command === 'back' && webview.canGoBack()) {
      webview.goBack();
      return;
    }
    if (command === 'forward' && webview.canGoForward()) {
      webview.goForward();
      return;
    }
    if (command === 'reload') {
      webview.reload();
      return;
    }
    if (command === 'focus') {
      webview.focus();
    }
  }, [commandSignal]);

  const navigate = useCallback((rawUrl: string) => {
    const nextUrl = normalizeBrowserInput(rawUrl);
    const webview = webviewRef.current;
    setAddress(nextUrl);
    onStateChange({ visible: true, url: nextUrl, loading: true });
    if (!webview) return;
    void webview.loadURL(nextUrl).catch((error) => {
      console.error('[cmux-windows] browser navigation failed:', error);
    });
  }, [onStateChange]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2 px-4 py-3 cyber-panel">
        <button type="button" className="cyber-button px-2 py-1 text-xs" disabled={!state.canGoBack} onClick={() => webviewRef.current?.goBack()}>Back</button>
        <button type="button" className="cyber-button px-2 py-1 text-xs" disabled={!state.canGoForward} onClick={() => webviewRef.current?.goForward()}>Forward</button>
        <button type="button" className="cyber-button px-2 py-1 text-xs" onClick={() => webviewRef.current?.reload()}>Reload</button>
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); navigate(address); }}>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="min-w-0 flex-1 rounded-sm border border-cyber-border bg-[#05070a] px-3 py-1.5 font-jetbrains text-xs text-cyber-text outline-none focus:border-cyber-accent"
            placeholder="https://example.com or search"
          />
          <button type="submit" className="cyber-button px-3 py-1.5 text-xs">Go</button>
        </form>
        <span className={`rounded-sm border px-2 py-1 text-[10px] font-rajdhani uppercase tracking-widest ${state.loading ? 'border-cyber-alert text-cyber-alert' : 'border-cyber-success text-cyber-success'}`}>{state.loading ? 'Loading' : 'Ready'}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden cyber-panel">
        {visible ? (
          <webview
            ref={(node) => { webviewRef.current = node as BrowserWebviewElement | null; }}
            src={state.url}
            className="block h-full w-full bg-white"
            allowpopups
            partition="persist:cmux-browser"
          />
        ) : null}
      </div>
      <div className="truncate font-jetbrains text-[10px] text-cyber-text-dim">
        {state.title ? `${state.title} - ` : ''}{state.url}
      </div>
    </div>
  );
}

function SidebarNavigator({ windows, terminals, processMap, activePanelId, sidebarState, onOpenTerminal }: { windows: WtWindow[]; terminals: TerminalEntry[]; processMap: Map<string, ProcessInfo>; activePanelId: string | null; sidebarState: SidebarState; onOpenTerminal: (entry: TerminalEntry) => void; }) {
  const latestLog = sidebarState.log.slice(0, 6);

  return (
    <div className="h-full overflow-y-auto cyber-scrollbar p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-rajdhani uppercase tracking-[0.3em] text-cyber-text-dim">Sidebar</p>
          <h2 className="font-rajdhani text-lg tracking-[0.18em] uppercase text-cyber-accent">Terminal Matrix</h2>
        </div>
        <span className="text-[10px] text-cyber-text-dim font-rajdhani uppercase tracking-widest bg-cyber-panel px-2 py-1 border border-cyber-border rounded-sm">{terminals.length} Panes</span>
      </div>

      {(sidebarState.statuses.length > 0 || sidebarState.progress.length > 0 || latestLog.length > 0) ? (
        <div className="mb-6 space-y-3">
          <h3 className="text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 font-rajdhani uppercase">cmux status</h3>
          {sidebarState.statuses.length > 0 ? (
            <div className="grid gap-2">
              {sidebarState.statuses.slice(0, 6).map((status) => (
                <div key={status.id} className="rounded-sm border border-cyber-border bg-cyber-panel p-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-rajdhani uppercase tracking-widest text-cyber-text">{status.label}</span>
                    <span className="rounded-sm border border-cyber-accent/40 px-2 py-0.5 text-[10px] font-jetbrains text-cyber-accent">{status.value ?? 'set'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {sidebarState.progress.length > 0 ? (
            <div className="grid gap-2">
              {sidebarState.progress.slice(0, 4).map((entry) => {
                const percent = entry.total && entry.total > 0 ? Math.min(100, Math.max(0, (entry.value / entry.total) * 100)) : Math.min(100, Math.max(0, entry.value));
                return (
                  <div key={entry.id} className="rounded-sm border border-cyber-border bg-cyber-panel p-2">
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-rajdhani uppercase tracking-widest">
                      <span className="truncate text-cyber-text">{entry.label}</span>
                      <span className="font-jetbrains text-cyber-text-dim">{Math.round(percent)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#05070a]">
                      <div className="h-full bg-cyber-accent" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {latestLog.length > 0 ? (
            <div className="space-y-1 rounded-sm border border-cyber-border bg-[#05070a] p-2 font-jetbrains text-[10px]">
              {latestLog.map((entry) => (
                <div key={entry.id} className="flex gap-2 text-cyber-text-dim">
                  <span className="shrink-0 text-cyber-accent">{entry.level.toUpperCase()}</span>
                  <span className="min-w-0 truncate">{entry.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <PaneGrid
        windows={windows}
        selectedKey={activePanelId ? activePanelId.replace('terminal-', '') : null}
        onSelect={(key) => {
          const [windowHandle, paneId] = key.split('-').map(Number);
          const entry = terminals.find((candidate) => candidate.windowHandle === windowHandle && candidate.paneId === paneId);
          if (entry) onOpenTerminal(entry);
        }}
        processMap={processMap}
      />

      <div className="mt-6 space-y-2">
        <h3 className="text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 mb-3 font-rajdhani uppercase">Session Registry</h3>
        {terminals.map((terminal, index) => {
          const panelId = panelIdForTerminal(terminal);
          const process = processMap.get(`${terminal.windowHandle}-${terminal.paneId}`);
          const selected = activePanelId === panelId;

          return (
            <ProcessDetailToggle key={panelId} process={process}>
              <button
                onClick={() => onOpenTerminal(terminal)}
                className={`w-full text-left p-3 rounded-sm border text-sm transition-all duration-300 cursor-pointer ${selected ? 'border-cyber-accent bg-[#15181C]' : 'border-cyber-border bg-cyber-panel hover:border-cyber-border-highlight'}`}
              >
                <div className="font-mono flex items-center gap-2">
                  <span className="text-cyber-accent opacity-80">[{index + 1}]</span>
                  <span className="truncate text-cyber-text">{cleanTitle(terminal.windowTitle)}</span>
                </div>
                <div className="text-xs text-cyber-text-dim mt-1 font-rajdhani tracking-widest uppercase truncate">&gt; {terminal.paneName}</div>
                <div className="mt-1.5"><ProcessBadge process={process} compact /></div>
              </button>
            </ProcessDetailToggle>
          );
        })}
      </div>
    </div>
  );
}

function ShellTitlebar({ accentColor, setAccentColor, layoutMode, setLayoutMode, sidebarVisible, toggleSidebar, connected, terminalCount, actionCount, pollIntervalMs, setPollIntervalMs, activePanelTitle, openPalette }: { accentColor: string; setAccentColor: (value: string) => void; layoutMode: WorkspaceLayoutMode; setLayoutMode: (value: WorkspaceLayoutMode) => void; sidebarVisible: boolean; toggleSidebar: () => void; connected: boolean; terminalCount: number; actionCount: number; pollIntervalMs: number; setPollIntervalMs: (value: number) => void; activePanelTitle: string; openPalette: () => void; }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    void liteWinTerminalClient.window.isMaximized().then((value) => { if (mounted) setMaximized(value); });
    const unsubscribe = liteWinTerminalClient.window.onMaximizeChange((value) => { setMaximized(value); });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  return (
    <header className="border-b border-cyber-border bg-[#0f1216] text-cyber-text">
      <div className="flex h-12 items-center gap-4 px-3 select-none" style={dragRegion}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-cyber-accent/40 text-cyber-accent font-rajdhani text-xs tracking-widest">WT</span>
          <div className="min-w-0">
            <div className="font-rajdhani text-xs uppercase tracking-[0.28em] text-cyber-text-dim">cmux Windows</div>
            <div className="font-jetbrains text-xs truncate">{activePanelTitle}</div>
          </div>
        </div>

        <div className="ml-4 hidden min-[1180px]:flex items-center gap-1" style={noDragRegion}>
          <button type="button" onClick={toggleSidebar} className={`cyber-button px-2 py-1 text-[10px] ${sidebarVisible ? 'border-cyber-accent/50 text-cyber-accent' : ''}`} title="Toggle sidebar"><SidebarIcon size={14} /></button>
          {layoutOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button key={option.mode} type="button" onClick={() => setLayoutMode(option.mode)} className={`cyber-button px-2 py-1 text-[10px] ${layoutMode === option.mode ? 'border-cyber-accent/50 text-cyber-accent' : ''}`} title={option.label}>
                <Icon size={14} />
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3" style={noDragRegion}>
          <button type="button" onClick={openPalette} className="cyber-button px-3 py-1.5 text-[10px] border-cyber-accent/50 text-cyber-accent">Palette</button>
          <div className="hidden min-[1280px]:flex items-center gap-2">
            <label className="text-[10px] text-cyber-text-dim font-rajdhani uppercase tracking-widest">Theme</label>
            <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="w-5 h-5 p-0 border border-cyber-border rounded cursor-pointer bg-cyber-panel" title="Accent color" />
          </div>
          <div className="hidden min-[1280px]:flex items-center gap-2">
            <label className="text-[10px] text-cyber-text-dim font-rajdhani uppercase tracking-widest">Poll</label>
            <input type="range" min={250} max={5000} step={250} value={pollIntervalMs} onChange={(event) => setPollIntervalMs(Number(event.target.value))} className="w-20 h-1 accent-cyber-accent cursor-pointer" />
            <span className="text-[9px] text-cyber-text-dim font-jetbrains w-10">{pollIntervalMs >= 1000 ? `${(pollIntervalMs / 1000).toFixed(1)}s` : `${pollIntervalMs}ms`}</span>
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-sm border ${connected ? 'border-cyber-success text-cyber-success bg-cyber-success/10' : 'border-cyber-alert text-cyber-alert bg-cyber-alert/10'}`}>{connected ? 'ONLINE' : 'OFFLINE'}</span>
          <span className="hidden min-[1100px]:inline-flex text-[10px] text-cyber-text-dim font-rajdhani tracking-widest uppercase bg-cyber-panel px-2 py-1 border border-cyber-border rounded-sm">{terminalCount} PANES</span>
          <span className="hidden min-[1100px]:inline-flex text-[10px] text-cyber-text-dim font-rajdhani tracking-widest uppercase bg-cyber-panel px-2 py-1 border border-cyber-border rounded-sm">{actionCount} ACTIONS</span>
          <div className="flex items-center" style={noDragRegion}>
            <button type="button" onClick={() => liteWinTerminalClient.window.minimize()} className="flex h-10 w-10 items-center justify-center text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text" aria-label="Minimize"><MinimizeIcon size={14} /></button>
            <button type="button" onClick={() => liteWinTerminalClient.window.maximize()} className="flex h-10 w-10 items-center justify-center text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text" aria-label={maximized ? 'Restore' : 'Maximize'}>{maximized ? <RestoreIcon size={14} /> : <MaximizeIcon size={14} />}</button>
            <button type="button" onClick={() => liteWinTerminalClient.window.close()} className="flex h-10 w-10 items-center justify-center text-cyber-text-dim transition-colors hover:bg-cyber-alert/80 hover:text-cyber-bg" aria-label="Close"><CloseIcon size={14} /></button>
          </div>
        </div>
      </div>
    </header>
  );
}

function ShellStatusbar({ connected, activePanel, watchers, terminalCount, sidebarState }: { connected: boolean; activePanel: LitePanel | undefined; watchers: Watcher[]; terminalCount: number; sidebarState: SidebarState; }) {
  const latestStatus = sidebarState.statuses[0];
  return (
    <footer className="flex items-center justify-between border-t border-cyber-border bg-[#0f1216] px-4 py-2 text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim">
      <div className="flex items-center gap-4">
        <span>{connected ? 'IPC Ready' : 'IPC Offline'}</span>
        <span>{terminalCount} live panes</span>
        <span>{watchers.filter((watcher) => watcher.enabled).length} watchers active</span>
        {latestStatus ? <span>{latestStatus.label}: {latestStatus.value ?? 'set'}</span> : null}
      </div>
      <div className="flex items-center gap-4">
        <span>{activePanel?.title ?? 'Workspace'}</span>
        <span>{activePanel?.type ?? 'shell'}</span>
      </div>
    </footer>
  );
}

export default function App() {
  const { state, connected, sendInput, refresh, onMessage } = useWtSocket();
  const { actions, categories, executeAction } = useActionRegistry();
  const processMap = useProcessMap(state?.windows ?? []);
  const {
    macros,
    recording,
    executing,
    getMacro,
    saveMacro,
    deleteMacro,
    runMacro,
    startRecording,
    stopRecording,
  } = useMacros();

  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [watcherEvents, setWatcherEvents] = useState<WatcherToastEvent[]>([]);
  const [macroEditing, setMacroEditing] = useState<{ name: string; steps: MacroStep[] } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarState, setSidebarState] = useState<SidebarState>(emptySidebarState);
  const [sidebarView] = useState<SidebarView>('sessions');
  const [browserState, setBrowserState] = useState<BrowserSurfaceState>(defaultBrowserState);
  const [browserCommand, setBrowserCommand] = useState<BrowserCommandSignal | null>(null);
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>('splitter');
  const [workspace, setWorkspace] = useState<WorkspaceStateSnapshot<LitePanel>>({ panels: [], activePanelId: null });
  const [pollIntervalMs, setPollIntervalMs] = useState(1000);
  const [accentColor, setAccentColor] = useState('#85E071');
  const prevMatchCounts = useRef<Record<string, number>>({});

  const terminals = useMemo(() => {
    if (!state?.windows) return [];
    const result: TerminalEntry[] = [];
    for (const win of state.windows) {
      const termPanes = win.panes.filter((pane) => pane.class_name === 'TermControl');
      for (const pane of termPanes) {
        result.push({
          windowHandle: win.handle,
          windowTitle: win.title,
          paneId: pane.id,
          paneName: pane.title || 'Terminal',
        });
      }
    }
    return result;
  }, [state]);

  const activePanel = useMemo(() => workspace.panels.find((panel) => panel.id === workspace.activePanelId), [workspace.activePanelId, workspace.panels]);

  const activeTerminal = useMemo(() => {
    const metadata = activePanel?.type === 'terminal-session' ? activePanel.metadata : null;
    if (metadata) return metadata;
    const fallbackPanel = workspace.panels.find((panel) => panel.type === 'terminal-session');
    return fallbackPanel?.metadata ?? terminals[0] ?? null;
  }, [activePanel, terminals, workspace.panels]);

  const activityItems = useMemo<WorkspaceActivityItem[]>(() => [
    { id: 'sessions', label: 'Sessions', icon: SessionsIcon, placement: 'primary' },
    { id: 'browser', label: 'Browser', icon: BrowserIcon, placement: 'primary' },
    { id: 'watchers', label: 'Watchers', icon: WatchersIcon, placement: 'primary' },
    { id: 'macros', label: 'Macros', icon: MacrosIcon, placement: 'primary' },
    { id: 'scheduler', label: 'Scheduler', icon: SchedulerIcon, placement: 'primary' },
    { id: 'agents', label: 'Agents', icon: AgentsIcon, placement: 'secondary' },
    { id: 'layouts', label: 'Layouts', icon: LayoutsIcon, placement: 'secondary' },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', icon: SidebarIcon, placement: 'secondary', actionId: 'toggle-sidebar' },
  ], []);

  const activeActivityIds = useMemo(() => {
    const ids: string[] = [];
    if (sidebarVisible && sidebarView === 'sessions') ids.push('sessions');
    if (activePanel && activePanel.type !== 'terminal-session') ids.push(activePanel.type);
    return ids;
  }, [activePanel, sidebarView, sidebarVisible]);

  const fetchWatchers = useCallback(async () => {
    try {
      const data = await liteWinTerminalClient.watchers.list();
      setWatchers(data.watchers ?? []);
    } catch {
      // ignore
    }
  }, []);

  const focusOrCreateBrowserPanel = useCallback(() => {
    setWorkspace((current) => upsertSingletonWorkspacePanel(current, { id: 'browser', type: 'browser', title: singletonTitles.browser } as LitePanel));
  }, []);

  useEffect(() => {
    void fetchWatchers();
    const interval = window.setInterval(() => { void fetchWatchers(); }, 2000);
    return () => window.clearInterval(interval);
  }, [fetchWatchers]);

  useEffect(() => {
    for (const watcher of watchers) {
      const previous = prevMatchCounts.current[watcher.id] ?? 0;
      if (watcher.match_count > previous && previous > 0) {
        const delta = watcher.match_count - previous;
        for (let index = 0; index < Math.min(delta, 3); index += 1) {
          setWatcherEvents((events) => [
            ...events,
            {
              type: 'watcher_match',
              watcher_id: watcher.id,
              watcher_name: watcher.name,
              pane_id: watcher.pane_id,
              window_handle: watcher.window_handle,
              matched_text: watcher.last_match ?? watcher.pattern,
              line: `Match #${previous + index + 1}`,
              action: watcher.action,
              trigger_action_id: watcher.trigger_action_id ?? undefined,
            },
          ]);
        }
      }
      prevMatchCounts.current[watcher.id] = watcher.match_count;
    }
  }, [watchers]);

  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      if (message.type === 'watcher_match') {
        setWatcherEvents((events) => [...events, message as unknown as WatcherToastEvent]);
      } else if (message.type === 'right_sidebar_state') {
        setSidebarState(message.state);
        setSidebarVisible(message.state.visible);
      } else if (message.type === 'right_sidebar_status') {
        setSidebarState((current) => ({
          ...current,
          statuses: [message.status, ...current.statuses.filter((status) => status.id !== message.status.id)],
        }));
      } else if (message.type === 'right_sidebar_progress') {
        setSidebarState((current) => ({
          ...current,
          progress: [message.progress, ...current.progress.filter((entry) => entry.id !== message.progress.id)],
        }));
      } else if (message.type === 'right_sidebar_log') {
        setSidebarState((current) => ({ ...current, log: [message.entry, ...current.log].slice(0, 500) }));
      } else if (message.type === 'browser_state') {
        setBrowserState(message.state);
        if (message.state.visible) {
          focusOrCreateBrowserPanel();
        }
      } else if (message.type === 'browser_command') {
        setBrowserState(message.state);
        focusOrCreateBrowserPanel();
        setBrowserCommand((current) => ({ sequence: (current?.sequence ?? 0) + 1, event: message }));
      }
    });
    return unsubscribe;
  }, [focusOrCreateBrowserPanel, onMessage]);

  useEffect(() => {
    void liteWinTerminalClient.settings.get<string>('cmux.windows.appearance.accentColor', '#85E071').then((value) => setAccentColor(value));
    void liteWinTerminalClient.settings.get<WorkspaceLayoutMode>('cmux.windows.workspace.layout', 'splitter').then((value) => {
      if (value === 'grid' || value === 'splitter' || value === 'tabs' || value === 'window') setLayoutMode(value);
    });
    void liteWinTerminalClient.scheduler.getSettings().then((settings) => setPollIntervalMs(settings.poll_interval_ms));
    void liteWinTerminalClient.sidebar.getState().then((state) => {
      setSidebarState(state);
      setSidebarVisible(state.visible);
    });
    void liteWinTerminalClient.browser.getState().then((state) => {
      setBrowserState(state);
      if (state.visible) focusOrCreateBrowserPanel();
    });
  }, [focusOrCreateBrowserPanel]);

  useEffect(() => {
    document.documentElement.style.setProperty('--color-cyber-accent', accentColor);
    void liteWinTerminalClient.settings.set('cmux.windows.appearance.accentColor', accentColor);
  }, [accentColor]);

  useEffect(() => {
    void liteWinTerminalClient.settings.set('cmux.windows.workspace.layout', layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    void liteWinTerminalClient.scheduler.updateSettings({ poll_interval_ms: pollIntervalMs });
  }, [pollIntervalMs]);

  const focusOrCreateTerminalPanel = useCallback(async (entry: TerminalEntry) => {
    const panelId = panelIdForTerminal(entry);
    setWorkspace((current) => {
      const existing = current.panels.find((panel) => panel.id === panelId);
      if (existing) return { ...current, activePanelId: existing.id };
      return appendWorkspacePanel(current, {
        id: panelId,
        type: 'terminal-session',
        title: cleanTitle(entry.windowTitle),
        metadata: {
          windowHandle: entry.windowHandle,
          windowTitle: entry.windowTitle,
          paneId: entry.paneId,
          paneName: entry.paneName,
        },
        chrome: { persistHost: true },
      });
    });
    await liteWinTerminalClient.terminal.focusPane({ paneId: entry.paneId, window: entry.windowHandle });
  }, []);

  const focusOrCreateSingletonPanel = useCallback((type: Exclude<LitePanelType, 'terminal-session'>) => {
    setWorkspace((current) => upsertSingletonWorkspacePanel(current, { id: type, type, title: singletonTitles[type] } as LitePanel));
  }, []);

  const updateBrowserState = useCallback((patch: Partial<BrowserSurfaceState>) => {
    setBrowserState((current) => ({ ...current, ...patch, updated_at: new Date().toISOString() }));
    void liteWinTerminalClient.browser.updateState(patch).then((state) => setBrowserState(state)).catch((error) => {
      console.error('[cmux-windows] browser state update failed:', error);
    });
  }, []);

  const updateSidebarVisible = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setSidebarVisible((current) => {
      const visible = typeof next === 'function' ? next(current) : next;
      void liteWinTerminalClient.sidebar.setState({ visible }).then((state) => setSidebarState(state));
      return visible;
    });
  }, []);

  useEffect(() => {
    if (workspace.panels.length === 0 && terminals.length > 0) {
      void focusOrCreateTerminalPanel(terminals[0]);
    }
  }, [focusOrCreateTerminalPanel, terminals, workspace.panels.length]);

  const handleAfterExecute = useCallback(() => {
    window.setTimeout(() => {
      void refresh();
      void fetchWatchers();
    }, 300);
  }, [fetchWatchers, refresh]);

  const controller: GuiWorkspaceController = {
    onActivatePanel: (panelId) => {
      setWorkspace((current) => ({ ...current, activePanelId: panelId }));
      const panel = workspace.panels.find((entry) => entry.id === panelId);
      if (panel?.type === 'terminal-session' && panel.metadata) {
        void liteWinTerminalClient.terminal.focusPane({ paneId: panel.metadata.paneId, window: panel.metadata.windowHandle });
      }
    },
    onClosePanel: (panelId) => setWorkspace((current) => removeWorkspacePanel(current, panelId)),
    onReorderPanels: (fromIndex, toIndex) => {
      setWorkspace((current) => ({ ...current, panels: reorderWorkspacePanels(current.panels, fromIndex, toIndex) }));
    },
    onToggleSidebar: () => updateSidebarVisible((current) => !current),
    onChangeLayout: (mode) => setLayoutMode(mode),
    onActivityAction: (itemId) => {
      if (itemId === 'sessions') {
        updateSidebarVisible((current) => !current);
        return;
      }
      const panelType = panelTypeForActivity(itemId);
      if (panelType) focusOrCreateSingletonPanel(panelType);
    },
  };

  const panelRenderers = useMemo<WorkspacePanelRendererMap>(() => ({
    'terminal-session': ({ panel, visible }) => {
      const typedPanel = panel as LitePanel;
      const metadata = typedPanel.metadata;
      const process = metadata ? processMap.get(`${metadata.windowHandle}-${metadata.paneId}`) : undefined;
      return (
        <TerminalSessionPanel
          panel={typedPanel}
          visible={visible}
          pollIntervalMs={pollIntervalMs}
          watchers={watchers.map((watcher) => ({ ...watcher, trigger_action_id: watcher.trigger_action_id ?? null }))}
          process={process}
          onSendInput={sendInput}
          onExecute={executeAction}
          onAfterExecute={handleAfterExecute}
          onOpenPalette={() => setPaletteOpen(true)}
          onRefresh={() => { void refresh(); }}
        />
      );
    },
    browser: ({ visible }) => (
      <BrowserPanel
        state={browserState}
        commandSignal={browserCommand}
        visible={visible}
        onStateChange={updateBrowserState}
      />
    ),
    watchers: () => (
      <div className="h-full p-4">
        <WatcherPanel
          watchers={watchers.map((watcher) => ({ ...watcher, trigger_action_id: watcher.trigger_action_id ?? null }))}
          panes={terminals.map((terminal) => ({
            paneId: terminal.paneId,
            windowHandle: terminal.windowHandle,
            label: `${cleanTitle(terminal.windowTitle)} - ${terminal.paneName}`,
          }))}
          onAdd={async (watcher) => { await liteWinTerminalClient.watchers.create(watcher); await fetchWatchers(); }}
          onDelete={async (watcherId) => { await liteWinTerminalClient.watchers.delete(watcherId); await fetchWatchers(); }}
          onToggle={async (watcherId) => { await liteWinTerminalClient.watchers.toggle(watcherId); await fetchWatchers(); }}
        />
      </div>
    ),
    macros: () => (
      <div className="h-full p-4">
        <MacroPanel
          macros={macros}
          recording={recording}
          executing={executing}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onRun={(name) => void runMacro(name, activeTerminal?.windowHandle ?? null, activeTerminal?.paneId ?? null).then(() => { handleAfterExecute(); })}
          onDelete={(name) => { void deleteMacro(name); }}
          onEdit={(name) => { void getMacro(name).then((detail) => { if (detail) setMacroEditing({ name, steps: detail.steps }); }); }}
          onSaveRecorded={(steps) => setMacroEditing({ name: '', steps })}
        />
      </div>
    ),
    scheduler: () => (
      <div className="h-full p-4">
        <SchedulerPanel onSettingsChange={(settings) => { if (settings.poll_interval_ms) setPollIntervalMs(settings.poll_interval_ms); }} />
      </div>
    ),
    agents: () => <div className="h-full p-4"><AgentPanel /></div>,
    layouts: () => <div className="h-full p-4"><LayoutManager /></div>,
  }), [activeTerminal, browserCommand, browserState, deleteMacro, executeAction, executing, fetchWatchers, getMacro, handleAfterExecute, macros, pollIntervalMs, processMap, recording, refresh, runMacro, sendInput, startRecording, stopRecording, terminals, updateBrowserState, watchers]);

  const activePanelTitle = activePanel?.title ?? 'Workspace';

  return (
    <div className="h-screen w-screen overflow-hidden">
      <GuiWorkspace
        title="cmux Windows"
        activityItems={activityItems}
        activityActiveIds={activeActivityIds}
        panels={workspace.panels}
        activePanelId={workspace.activePanelId}
        panelRenderers={panelRenderers}
        controller={controller}
        sidebarVisible={sidebarVisible}
        sidebar={<SidebarNavigator windows={state?.windows ?? []} terminals={terminals} processMap={processMap} activePanelId={workspace.activePanelId} sidebarState={sidebarState} onOpenTerminal={(entry) => { void focusOrCreateTerminalPanel(entry); }} />}
        emptyState={<div className="flex h-full items-center justify-center"><div className="text-center"><div className="font-rajdhani text-cyber-accent text-xl tracking-[0.2em] uppercase">No panels open</div><p className="mt-3 text-sm text-cyber-text-dim font-jetbrains">Open a live pane from the sidebar or launch a tool panel from the activity rail.</p></div></div>}
        layoutMode={layoutMode}
        titlebar={<ShellTitlebar accentColor={accentColor} setAccentColor={setAccentColor} layoutMode={layoutMode} setLayoutMode={setLayoutMode} sidebarVisible={sidebarVisible} toggleSidebar={() => updateSidebarVisible((current) => !current)} connected={connected} terminalCount={terminals.length} actionCount={actions.length} pollIntervalMs={pollIntervalMs} setPollIntervalMs={setPollIntervalMs} activePanelTitle={activePanelTitle} openPalette={() => setPaletteOpen(true)} />}
        statusbar={<ShellStatusbar connected={connected} activePanel={activePanel} watchers={watchers.map((watcher) => ({ ...watcher, trigger_action_id: watcher.trigger_action_id ?? null }))} terminalCount={terminals.length} sidebarState={sidebarState} />}
      />

      <WatcherToasts events={watcherEvents} />

      {macroEditing ? (
        <MacroEditor
          initialName={macroEditing.name}
          initialSteps={macroEditing.steps}
          actions={actions}
          onSave={async (name, steps) => { await saveMacro(name, steps); setMacroEditing(null); }}
          onCancel={() => setMacroEditing(null)}
        />
      ) : null}

      <CommandPalette
        actions={actions}
        categories={categories}
        windowHandle={activeTerminal?.windowHandle ?? null}
        paneId={activeTerminal?.paneId ?? null}
        onExecute={executeAction}
        onAfterExecute={handleAfterExecute}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </div>
  );
}

