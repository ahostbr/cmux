import net from 'node:net';
import type { Socket } from 'node:net';
import { webContents as electronWebContents } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import type { ActionExecutor, ActionRegistry } from './actions';
import type { RuntimeServices } from './managers';
import { OWNED_WINDOW_HANDLE, TerminalAutomation, WtCli } from './terminal-automation';
import type {
  BrowserSurfaceState,
  SidebarLogEntry,
  SidebarProgress,
  SidebarState,
  SidebarStatus,
  StreamMessage,
  WtPane,
  WtState,
  WtWindow,
} from '../shared/types';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface RpcRequest {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown> | null;
}

interface RpcErrorBody {
  code: string;
  message: string;
}

interface ProtocolContext {
  automation: TerminalAutomation;
  wtCli: WtCli;
  actionRegistry: ActionRegistry;
  actionExecutor: ActionExecutor;
  services: RuntimeServices;
  getMainWindow?: () => BrowserWindow | null;
  activateApp?: () => void;
  emit?: (message: StreamMessage) => void;
}

interface SurfaceRef {
  windowHandle: number;
  paneId: number;
}

interface ProtocolNotification {
  id: string;
  message: string;
  created_at: string;
  read: boolean;
  target?: string;
  surface_id?: string;
  workspace_id?: string;
  window_id?: string;
}

type ProtocolEvent = StreamMessage;

const PIPE_NAME = process.env.CMUX_WINDOWS_PIPE || '\\\\.\\pipe\\cmux-windows';
const SURFACE_ID_PREFIX = 'surface:';
const PANE_ID_PREFIX = 'pane:';
const WINDOW_ID_PREFIX = 'window:';
const WORKSPACE_ID_PREFIX = 'workspace:';
const DEFAULT_BROWSER_URL = 'https://www.google.com/';

function send(socket: Socket, value: unknown): void {
  socket.write(`${JSON.stringify(value)}\n`);
}

function rpcResult(id: RpcRequest['id'], result: unknown) {
  return { id: id ?? null, ok: true, result };
}

function rpcError(id: RpcRequest['id'], code: string, message: string) {
  return { id: id ?? null, ok: false, error: { code, message } satisfies RpcErrorBody };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringParam(params: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function booleanParam(params: Record<string, unknown>, key: string): boolean | null {
  const value = params[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return null;
}

function numberParam(params: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return Number(value);
    }
  }
  return null;
}

function normalizeBrowserUrl(raw: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_BROWSER_URL;
  }
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

function browserWaitScript(params: Record<string, unknown>): string {
  const selector = stringParam(params, 'selector');
  const text = stringParam(params, 'text');
  const url = stringParam(params, 'url');
  const predicate = stringParam(params, 'predicate', 'js', 'code');
  const state = stringParam(params, 'state', 'load_state') ?? (params.load === true ? 'load' : null);
  const timeoutMs = numberParam(params, 'timeout_ms', 'timeout') ?? 5000;
  return `
    (() => new Promise((resolve, reject) => {
      const started = Date.now();
      const timeoutMs = ${JSON.stringify(timeoutMs)};
      const selector = ${JSON.stringify(selector)};
      const text = ${JSON.stringify(text)};
      const url = ${JSON.stringify(url)};
      const predicate = ${JSON.stringify(predicate)};
      const state = ${JSON.stringify(state)};
      const check = () => {
        try {
          if (selector && document.querySelector(selector)) return resolve({ matched: 'selector', selector });
          if (text && document.body && document.body.innerText.includes(text)) return resolve({ matched: 'text', text });
          if (url && location.href.includes(url)) return resolve({ matched: 'url', url: location.href });
          if (state && state !== 'networkidle' && document.readyState === 'complete') return resolve({ matched: 'load', state: document.readyState });
          if (predicate && Function('"use strict"; return (' + predicate + ')')()) return resolve({ matched: 'predicate' });
          if (Date.now() - started >= timeoutMs) return reject(new Error('browser wait timed out'));
          setTimeout(check, 100);
        } catch (error) {
          reject(error);
        }
      };
      check();
    }))()
  `;
}

function prefixedNumber(value: string, prefix: string): number | null {
  if (!value.startsWith(prefix)) {
    return null;
  }
  const numeric = Number(value.slice(prefix.length));
  return Number.isFinite(numeric) ? numeric : null;
}

function makeWindowId(windowHandle: number): string {
  return `${WINDOW_ID_PREFIX}${windowHandle}`;
}

function makeWorkspaceId(windowHandle: number): string {
  return `${WORKSPACE_ID_PREFIX}${windowHandle}`;
}

function makePaneId(windowHandle: number, paneId: number): string {
  return `${PANE_ID_PREFIX}${windowHandle}:${paneId}`;
}

function makeSurfaceId(windowHandle: number, paneId: number): string {
  return `${SURFACE_ID_PREFIX}${windowHandle}:${paneId}`;
}

function parseCompositeId(value: string | null, prefix: string): SurfaceRef | null {
  if (!value?.startsWith(prefix)) {
    return null;
  }
  const [windowRaw, paneRaw] = value.slice(prefix.length).split(':');
  const windowHandle = Number(windowRaw);
  const paneId = Number(paneRaw);
  return Number.isFinite(windowHandle) && Number.isFinite(paneId)
    ? { windowHandle, paneId }
    : null;
}

function termPanes(window: WtWindow): WtPane[] {
  return window.panes.filter((pane) => pane.class_name === 'TermControl' || pane.has_text_pattern);
}

function windowByHandle(state: WtState, handle: number | null): WtWindow | null {
  if (handle === null) {
    return state.windows[0] ?? null;
  }
  return state.windows.find((window) => window.handle === handle) ?? null;
}

function resolveWindowHandle(state: WtState, params: Record<string, unknown>): number | null {
  const numeric = numberParam(params, 'window_handle', 'handle');
  if (numeric !== null) {
    return numeric;
  }

  const raw = stringParam(params, 'window_id', 'window', 'workspace_id', 'workspace');
  if (!raw) {
    return state.windows[0]?.handle ?? null;
  }

  const prefixed =
    prefixedNumber(raw, WINDOW_ID_PREFIX) ??
    prefixedNumber(raw, WORKSPACE_ID_PREFIX);
  if (prefixed !== null) {
    return prefixed;
  }

  const indexRef = raw.match(/^(?:window|workspace):(\d+)$/);
  if (indexRef) {
    const index = Number(indexRef[1]) - 1;
    return state.windows[index]?.handle ?? null;
  }

  const numericRaw = Number(raw);
  return Number.isFinite(numericRaw) ? numericRaw : null;
}

function hasWindowSelector(params: Record<string, unknown>): boolean {
  return ['window_handle', 'handle', 'window_id', 'window', 'workspace_id', 'workspace']
    .some((key) => params[key] !== undefined && params[key] !== null);
}

function firstSurface(state: WtState, params: Record<string, unknown>): SurfaceRef | null {
  const surfaceId = parseCompositeId(stringParam(params, 'surface_id', 'surface'), SURFACE_ID_PREFIX);
  if (surfaceId) {
    return surfaceId;
  }

  const paneId = parseCompositeId(stringParam(params, 'pane_id', 'pane'), PANE_ID_PREFIX);
  if (paneId) {
    return paneId;
  }

  const directPaneId = numberParam(params, 'pane_id', 'pane');
  const windowHandle = resolveWindowHandle(state, params);
  if (directPaneId !== null && windowHandle !== null) {
    return { windowHandle, paneId: directPaneId };
  }

  if (hasWindowSelector(params) && windowHandle !== null) {
    const window = windowByHandle(state, windowHandle);
    const pane = window
      ? termPanes(window).find((candidate) => candidate.focused) ?? termPanes(window)[0]
      : null;
    if (pane) {
      return { windowHandle, paneId: pane.id };
    }
  }

  for (const window of state.windows) {
    const focused = termPanes(window).find((pane) => pane.focused);
    if (focused) {
      return { windowHandle: window.handle, paneId: focused.id };
    }
  }

  for (const window of state.windows) {
    const pane = termPanes(window)[0];
    if (pane) {
      return { windowHandle: window.handle, paneId: pane.id };
    }
  }

  return null;
}

function windowsResult(state: WtState) {
  return {
    windows: state.windows.map((window, index) => ({
      id: makeWindowId(window.handle),
      window_id: makeWindowId(window.handle),
      handle: window.handle,
      index: index + 1,
      title: window.title,
      pid: window.pid,
      current: index === 0,
    })),
  };
}

function workspacesResult(state: WtState) {
  return {
    workspaces: state.windows.map((window, index) => ({
      id: makeWorkspaceId(window.handle),
      workspace_id: makeWorkspaceId(window.handle),
      window_id: makeWindowId(window.handle),
      handle: window.handle,
      index: index + 1,
      title: window.title || `Windows Terminal ${index + 1}`,
      current: index === 0,
      surface_count: termPanes(window).length,
    })),
  };
}

function panesResult(state: WtState) {
  const panes = state.windows.flatMap((window) =>
    termPanes(window).map((pane, index) => ({
      id: makePaneId(window.handle, pane.id),
      pane_id: makePaneId(window.handle, pane.id),
      numeric_pane_id: pane.id,
      window_id: makeWindowId(window.handle),
      workspace_id: makeWorkspaceId(window.handle),
      index: index + 1,
      title: pane.title,
      focused: pane.focused,
      rect: pane.rect,
    })),
  );
  return { panes };
}

function surfacesResult(state: WtState) {
  const surfaces = state.windows.flatMap((window) =>
    termPanes(window).map((pane, index) => ({
      id: makeSurfaceId(window.handle, pane.id),
      surface_id: makeSurfaceId(window.handle, pane.id),
      pane_id: makePaneId(window.handle, pane.id),
      numeric_pane_id: pane.id,
      window_id: makeWindowId(window.handle),
      workspace_id: makeWorkspaceId(window.handle),
      index: index + 1,
      title: pane.title || 'Terminal',
      kind: 'terminal',
      focused: pane.focused,
      rect: pane.rect,
    })),
  );
  return { surfaces };
}

function paneSurfacesResult(state: WtState, params: Record<string, unknown>) {
  const target = firstSurface(state, params);
  const surfaces = surfacesResult(state).surfaces.filter((surface) => {
    if (!target) {
      return true;
    }
    return surface.pane_id === makePaneId(target.windowHandle, target.paneId);
  });
  return { surfaces };
}

function capabilities() {
  return {
    protocol: 'cmux.v2.windows-preview',
    transport: 'named-pipe',
    pipe: PIPE_NAME,
    methods: [
      'ping',
      'capabilities',
      'identify',
      'events.stream',
      'window.list',
      'window.current',
      'window.create',
      'window.focus',
      'window.close',
      'workspace.list',
      'workspace.current',
      'workspace.create',
      'workspace.select',
      'workspace.close',
      'pane.list',
      'pane.create',
      'pane.focus',
      'pane.surfaces',
      'surface.list',
      'surface.focus',
      'surface.send_text',
      'surface.send_key',
      'surface.split',
      'surface.create',
      'surface.close',
      'surface.refresh',
      'surface.trigger_flash',
      'surface.health',
      'app.focus_override.set',
      'app.simulate_active',
      'notification.create',
      'notification.create_for_surface',
      'notification.create_for_target',
      'notification.list',
      'notification.clear',
      'notification.dismiss',
      'notification.mark_read',
      'notification.open',
      'notification.jump_to_unread',
      'right_sidebar.state',
      'right_sidebar.set',
      'right_sidebar.toggle',
      'right_sidebar.status.set',
      'right_sidebar.status.clear',
      'right_sidebar.status.list',
      'right_sidebar.progress.set',
      'right_sidebar.progress.clear',
      'right_sidebar.log.append',
      'right_sidebar.log.clear',
      'right_sidebar.log.list',
      'browser.open_split',
      'browser.navigate',
      'browser.back',
      'browser.forward',
      'browser.reload',
      'browser.url.get',
      'browser.focus_webview',
      'browser.is_webview_focused',
      'browser.snapshot',
      'browser.eval',
      'browser.wait',
      'browser.click',
      'browser.dblclick',
      'browser.hover',
      'browser.focus',
      'browser.check',
      'browser.uncheck',
      'browser.scroll_into_view',
      'browser.type',
      'browser.fill',
      'browser.press',
      'browser.key',
      'browser.select',
      'browser.scroll',
      'browser.screenshot',
      'browser.get',
      'browser.is',
      'browser.find',
      'browser.cookies',
      'browser.storage',
      'browser.highlight',
      'browser.addinitscript',
      'browser.addscript',
      'browser.addstyle',
      'browser.identify',
      'debug.app.activate',
      'debug.terminal.read_text',
      'debug.terminal.is_focused',
      'debug.terminal.render_stats',
      'debug.layout',
      'debug.window.screenshot',
      'action.list',
      'action.execute',
    ],
  };
}

export class CmuxProtocolServer {
  private readonly server: net.Server;
  private readonly streamClients = new Set<Socket>();
  private readonly notifications: ProtocolNotification[] = [];
  private appFocusOverride: boolean | null = null;
  private browserState: BrowserSurfaceState = {
    visible: false,
    url: DEFAULT_BROWSER_URL,
    title: null,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    focused: false,
    webContentsId: null,
    updated_at: new Date().toISOString(),
  };
  private sidebarState: SidebarState = {
    visible: true,
    mode: 'sessions',
    statuses: [],
    progress: [],
    log: [],
  };

  constructor(private readonly context: ProtocolContext) {
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  listen(): void {
    this.server.on('error', (error) => {
      console.error('[cmux-windows] protocol server error:', error);
    });
    this.server.listen(PIPE_NAME, () => {
      console.info(`[cmux-windows] protocol server listening on ${PIPE_NAME}`);
    });
  }

  close(): void {
    for (const socket of this.streamClients) {
      socket.destroy();
    }
    this.streamClients.clear();
    this.server.close();
  }

  broadcast(message: ProtocolEvent): void {
    const event = {
      type: 'event',
      event: message.type,
      data: message,
      at: new Date().toISOString(),
    };
    for (const socket of [...this.streamClients]) {
      if (socket.destroyed) {
        this.streamClients.delete(socket);
        continue;
      }
      send(socket, event);
    }
  }

  getSidebarState(): SidebarState {
    return this.sidebarSnapshot();
  }

  getBrowserState(): BrowserSurfaceState {
    return this.browserSnapshot();
  }

  updateBrowserState(params: Partial<BrowserSurfaceState>): BrowserSurfaceState {
    return this.setBrowserState(params, true);
  }

  setSidebarState(params: { visible?: boolean; mode?: string }): SidebarState {
    if (params.mode) {
      this.sidebarState = { ...this.sidebarState, mode: params.mode };
    }
    if (typeof params.visible === 'boolean') {
      this.sidebarState = { ...this.sidebarState, visible: params.visible };
    }
    this.emitEvent({ type: 'right_sidebar_state', state: this.sidebarSnapshot() });
    return this.sidebarSnapshot();
  }

  toggleSidebar(): SidebarState {
    return this.setSidebarState({ visible: !this.sidebarState.visible });
  }

  private handleConnection(socket: Socket): void {
    socket.setEncoding('utf8');
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) {
          void this.handleLine(socket, line);
        }
        newline = buffer.indexOf('\n');
      }
    });

    socket.on('close', () => {
      this.streamClients.delete(socket);
    });
  }

  private sidebarSnapshot(): SidebarState {
    return {
      ...this.sidebarState,
      statuses: [...this.sidebarState.statuses],
      progress: [...this.sidebarState.progress],
      log: [...this.sidebarState.log],
    };
  }

  private browserSnapshot(): BrowserSurfaceState {
    return { ...this.browserState };
  }

  private setBrowserState(params: Partial<BrowserSurfaceState>, emitState = true): BrowserSurfaceState {
    this.browserState = {
      ...this.browserState,
      ...params,
      url: params.url ? normalizeBrowserUrl(params.url) : this.browserState.url,
      updated_at: new Date().toISOString(),
    };
    const state = this.browserSnapshot();
    if (emitState) {
      this.emitEvent({ type: 'browser_state', state });
    }
    return state;
  }

  private emitBrowserCommand(command: 'open' | 'navigate' | 'back' | 'forward' | 'reload' | 'focus', params: Record<string, unknown>): BrowserSurfaceState {
    const url = stringParam(params, 'url');
    const state = this.setBrowserState({
      visible: true,
      ...(url ? { url } : {}),
      ...(command === 'open' || command === 'navigate' || command === 'reload' ? { loading: true } : {}),
      ...(command === 'focus' ? { focused: true } : {}),
    });
    this.emitEvent({ type: 'browser_command', command, ...(url ? { url: state.url } : {}), state });
    return state;
  }

  private browserWebContents(): WebContents {
    const id = this.browserState.webContentsId;
    if (!id) {
      throw new Error('browser webview is not ready');
    }
    const contents = electronWebContents.fromId(id);
    if (!contents || contents.isDestroyed()) {
      throw new Error('browser webview is no longer available');
    }
    return contents;
  }

  private async waitForBrowserWebContents(timeoutMs = 5000): Promise<WebContents> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        return this.browserWebContents();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    return this.browserWebContents();
  }

  private async executeBrowserJavaScript<T>(source: string): Promise<T> {
    return await (await this.waitForBrowserWebContents()).executeJavaScript(source, true) as T;
  }

  private emitEvent(message: ProtocolEvent): void {
    if (this.context.emit) {
      this.context.emit(message);
      return;
    }
    this.broadcast(message);
  }

  private async handleLine(socket: Socket, line: string): Promise<void> {
    let request: RpcRequest;
    try {
      request = JSON.parse(line) as RpcRequest;
    } catch {
      send(socket, rpcError(null, 'invalid_json', 'request must be one JSON object per line'));
      return;
    }

    if (!request.method) {
      send(socket, rpcError(request.id, 'invalid_request', 'method is required'));
      return;
    }

    if (request.method === 'events.stream') {
      this.streamClients.add(socket);
    }

    try {
      const result = await this.dispatch(request.method, asRecord(request.params));
      send(socket, rpcResult(request.id, result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send(socket, rpcError(request.id, 'request_failed', message));
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    const state = await this.context.automation.getState();

    switch (method) {
      case 'ping':
        return { pong: true, at: new Date().toISOString() };
      case 'capabilities':
        return capabilities();
      case 'identify':
        return {
          app: 'cmux Windows',
          platform: process.platform,
          pid: process.pid,
          protocol: capabilities(),
        };
      case 'events.stream':
        return { streaming: true };
      case 'window.list':
        return windowsResult(state);
      case 'window.current': {
        const window = state.windows[0] ?? null;
        return { window: window ? windowsResult({ windows: [window] }).windows[0] : null };
      }
      case 'window.focus':
      case 'workspace.select': {
        const target = firstSurface(state, params);
        if (!target) {
          throw new Error('window or workspace not found');
        }
        return { ok: await this.context.automation.focusPane(target.windowHandle, target.paneId) };
      }
      case 'window.close':
      case 'workspace.close': {
        const target = firstSurface(state, params);
        if (!target) {
          throw new Error('window or workspace not found');
        }
        if (target.windowHandle < 0) {
          const ok = this.context.automation.closePane(target.windowHandle, target.paneId);
          if (ok) {
            await this.context.services.poller.forcePoll();
          }
          return { ok };
        }
        const ok = await this.context.automation.sendShortcut(target.windowHandle, target.paneId, '%{F4}');
        if (ok) {
          await this.context.services.poller.forcePoll();
        }
        return { ok };
      }
      case 'workspace.list':
        return workspacesResult(state);
      case 'workspace.current': {
        const window = state.windows[0] ?? null;
        return { workspace: window ? workspacesResult({ windows: [window] }).workspaces[0] : null };
      }
      case 'window.create':
      case 'workspace.create':
      case 'surface.create': {
        if (stringParam(params, 'backend') === 'windows-terminal') {
          const result = await this.context.wtCli.newTab({
            profile: stringParam(params, 'profile') ?? undefined,
            cwd: stringParam(params, 'cwd') ?? undefined,
            command: stringParam(params, 'command') ?? undefined,
          });
          if (result.ok) {
            await this.context.services.poller.forcePoll();
          }
          return result;
        }
        const session = this.context.automation.createOwnedSession({
          cwd: stringParam(params, 'cwd') ?? undefined,
          command: stringParam(params, 'command') ?? undefined,
        });
        await this.context.services.poller.forcePoll();
        return {
          ok: true,
          backend: 'owned',
          window_id: makeWindowId(OWNED_WINDOW_HANDLE),
          pane_id: makePaneId(OWNED_WINDOW_HANDLE, session.id),
          surface_id: makeSurfaceId(OWNED_WINDOW_HANDLE, session.id),
        };
      }
      case 'pane.create':
        return this.dispatch('surface.split', params);
      case 'pane.list':
        return panesResult(state);
      case 'pane.focus':
      case 'surface.focus': {
        const target = firstSurface(state, params);
        if (!target) {
          throw new Error('surface not found');
        }
        return { ok: await this.context.automation.focusPane(target.windowHandle, target.paneId), surface_id: makeSurfaceId(target.windowHandle, target.paneId) };
      }
      case 'pane.surfaces':
        return paneSurfacesResult(state, params);
      case 'surface.list':
        return surfacesResult(state);
      case 'surface.send_text': {
        const target = firstSurface(state, params);
        const text = stringParam(params, 'text', 'input');
        if (!target) {
          throw new Error('surface not found');
        }
        if (text === null) {
          throw new Error('text is required');
        }
        return {
          ok: await this.context.automation.sendInput(target.windowHandle, target.paneId, text),
          surface_id: makeSurfaceId(target.windowHandle, target.paneId),
        };
      }
      case 'surface.send_key': {
        const target = firstSurface(state, params);
        const key = stringParam(params, 'key', 'keys');
        if (!target) {
          throw new Error('surface not found');
        }
        if (key === null) {
          throw new Error('key is required');
        }
        return {
          ok: await this.context.automation.sendShortcut(target.windowHandle, target.paneId, key),
          surface_id: makeSurfaceId(target.windowHandle, target.paneId),
        };
      }
      case 'surface.split': {
        const target = firstSurface(state, params);
        if (!target) {
          throw new Error('surface not found');
        }
        const ok = await this.context.automation.splitPane(
          target.windowHandle,
          target.paneId,
          stringParam(params, 'direction') ?? 'vertical',
        );
        if (ok) {
          await this.context.services.poller.forcePoll();
        }
        return { ok };
      }
      case 'surface.close': {
        const target = firstSurface(state, params);
        if (!target) {
          throw new Error('surface not found');
        }
        if (target.windowHandle < 0) {
          const ok = this.context.automation.closePane(target.windowHandle, target.paneId);
          if (ok) {
            await this.context.services.poller.forcePoll();
          }
          return { ok };
        }
        const result = await this.context.actionExecutor.execute(
          'close_pane',
          target.windowHandle,
          target.paneId,
        );
        if (result.ok) {
          await this.context.services.poller.forcePoll();
        }
        return result;
      }
      case 'surface.refresh':
        await this.context.services.poller.forcePoll();
        return { ok: true, state: surfacesResult(await this.context.automation.getState()) };
      case 'surface.trigger_flash': {
        const target = firstSurface(state, params);
        const surfaceId = target ? makeSurfaceId(target.windowHandle, target.paneId) : stringParam(params, 'surface_id', 'surface');
        const event: StreamMessage = {
          type: 'flash',
          surface_id: surfaceId,
          workspace_id: target ? makeWorkspaceId(target.windowHandle) : stringParam(params, 'workspace_id', 'workspace'),
          message: stringParam(params, 'message') ?? null,
        };
        this.emitEvent(event);
        return { ok: true, event };
      }
      case 'surface.health':
        return {
          ok: true,
          state: surfacesResult(state),
          process_groups: await this.context.automation.listProcesses(),
        };
      case 'app.focus_override.set': {
        this.appFocusOverride = booleanParam(params, 'focused');
        const event: StreamMessage = { type: 'app_focus_override', focused: this.appFocusOverride };
        this.emitEvent(event);
        return { ok: true, focused: this.appFocusOverride };
      }
      case 'app.simulate_active': {
        const event: StreamMessage = { type: 'app_active', simulated: true, at: new Date().toISOString() };
        this.emitEvent(event);
        return { ok: true, event };
      }
      case 'notification.create':
      case 'notification.create_for_surface':
      case 'notification.create_for_target': {
        const target = firstSurface(state, params);
        const message = stringParam(params, 'message', 'body', 'text') ?? '';
        if (!message) {
          throw new Error('message is required');
        }
        const notification: ProtocolNotification = {
          id: `notification:${Date.now()}:${this.notifications.length + 1}`,
          message,
          created_at: new Date().toISOString(),
          read: false,
          target: stringParam(params, 'target') ?? undefined,
          surface_id: target ? makeSurfaceId(target.windowHandle, target.paneId) : stringParam(params, 'surface_id', 'surface') ?? undefined,
          workspace_id: target ? makeWorkspaceId(target.windowHandle) : stringParam(params, 'workspace_id', 'workspace') ?? undefined,
          window_id: target ? makeWindowId(target.windowHandle) : stringParam(params, 'window_id', 'window') ?? undefined,
        };
        this.notifications.unshift(notification);
        this.emitEvent({ type: 'notification', notification });
        return { ok: true, notification };
      }
      case 'notification.list':
        return { notifications: this.notifications };
      case 'notification.clear': {
        const id = stringParam(params, 'notification_id', 'id');
        if (id) {
          const index = this.notifications.findIndex((notification) => notification.id === id);
          if (index >= 0) {
            this.notifications.splice(index, 1);
          }
        } else {
          this.notifications.splice(0, this.notifications.length);
        }
        return { ok: true, notifications: this.notifications };
      }
      case 'notification.dismiss': {
        const id = stringParam(params, 'notification_id', 'id');
        const allRead = booleanParam(params, 'all_read') ?? false;
        if (allRead) {
          for (let index = this.notifications.length - 1; index >= 0; index -= 1) {
            if (this.notifications[index].read) {
              this.notifications.splice(index, 1);
            }
          }
        } else if (id) {
          const index = this.notifications.findIndex((notification) => notification.id === id);
          if (index >= 0) {
            this.notifications.splice(index, 1);
          }
        } else {
          throw new Error('notification id or all_read is required');
        }
        return { ok: true, notifications: this.notifications };
      }
      case 'notification.mark_read': {
        const id = stringParam(params, 'notification_id', 'id');
        const all = booleanParam(params, 'all') ?? false;
        if (all) {
          for (const notification of this.notifications) {
            notification.read = true;
          }
          return { ok: true, notifications: this.notifications };
        }
        if (!id) {
          throw new Error('notification id is required');
        }
        const notification = this.notifications.find((entry) => entry.id === id);
        if (!notification) {
          throw new Error(`notification not found: ${id}`);
        }
        notification.read = true;
        return { ok: true, notification };
      }
      case 'notification.open':
      case 'notification.jump_to_unread': {
        const requestedId = method === 'notification.open'
          ? stringParam(params, 'notification_id', 'id')
          : null;
        const notification = requestedId
          ? this.notifications.find((entry) => entry.id === requestedId)
          : this.notifications.find((entry) => !entry.read);
        if (!notification) {
          throw new Error(requestedId ? `notification not found: ${requestedId}` : 'no unread notifications');
        }
        notification.read = true;
        const target = parseCompositeId(notification.surface_id ?? null, SURFACE_ID_PREFIX);
        const focused = target
          ? await this.context.automation.focusPane(target.windowHandle, target.paneId)
          : false;
        return { ok: true, focused, notification };
      }
      case 'right_sidebar.state':
        return this.sidebarSnapshot();
      case 'right_sidebar.set': {
        const mode = stringParam(params, 'mode');
        const visible = booleanParam(params, 'visible');
        const state = this.setSidebarState({ mode: mode ?? undefined, visible: visible ?? undefined });
        return { ok: true, state };
      }
      case 'right_sidebar.toggle':
        return { ok: true, state: this.toggleSidebar() };
      case 'right_sidebar.status.set': {
        const id = stringParam(params, 'id', 'key') ?? 'default';
        const label = stringParam(params, 'label', 'message') ?? id;
        const next: SidebarStatus = {
          id,
          label,
          value: stringParam(params, 'value') ?? undefined,
          color: stringParam(params, 'color') ?? undefined,
          updated_at: new Date().toISOString(),
        };
        this.sidebarState = {
          ...this.sidebarState,
          statuses: [next, ...this.sidebarState.statuses.filter((status) => status.id !== id)],
        };
        this.emitEvent({ type: 'right_sidebar_status', status: next });
        return { ok: true, status: next };
      }
      case 'right_sidebar.status.clear': {
        const id = stringParam(params, 'id', 'key');
        this.sidebarState = {
          ...this.sidebarState,
          statuses: id ? this.sidebarState.statuses.filter((status) => status.id !== id) : [],
        };
        this.emitEvent({ type: 'right_sidebar_state', state: this.sidebarSnapshot() });
        return { ok: true, statuses: this.sidebarState.statuses };
      }
      case 'right_sidebar.status.list':
        return { statuses: this.sidebarState.statuses };
      case 'right_sidebar.progress.set': {
        const id = stringParam(params, 'id', 'key') ?? 'default';
        const label = stringParam(params, 'label') ?? id;
        const value = numberParam(params, 'value', 'current') ?? 0;
        const total = numberParam(params, 'total');
        const next: SidebarProgress = {
          id,
          label,
          value,
          total: total ?? undefined,
          updated_at: new Date().toISOString(),
        };
        this.sidebarState = {
          ...this.sidebarState,
          progress: [next, ...this.sidebarState.progress.filter((entry) => entry.id !== id)],
        };
        this.emitEvent({ type: 'right_sidebar_progress', progress: next });
        return { ok: true, progress: next };
      }
      case 'right_sidebar.progress.clear': {
        const id = stringParam(params, 'id', 'key');
        this.sidebarState = {
          ...this.sidebarState,
          progress: id ? this.sidebarState.progress.filter((entry) => entry.id !== id) : [],
        };
        this.emitEvent({ type: 'right_sidebar_state', state: this.sidebarSnapshot() });
        return { ok: true, progress: this.sidebarState.progress };
      }
      case 'right_sidebar.log.append': {
        const message = stringParam(params, 'message', 'text');
        if (!message) {
          throw new Error('message is required');
        }
        const entry: SidebarLogEntry = {
          id: `log:${Date.now()}:${this.sidebarState.log.length + 1}`,
          message,
          level: stringParam(params, 'level') ?? 'info',
          created_at: new Date().toISOString(),
        };
        this.sidebarState = { ...this.sidebarState, log: [entry, ...this.sidebarState.log].slice(0, 500) };
        this.emitEvent({ type: 'right_sidebar_log', entry });
        return { ok: true, entry };
      }
      case 'right_sidebar.log.clear':
        this.sidebarState = { ...this.sidebarState, log: [] };
        this.emitEvent({ type: 'right_sidebar_state', state: this.sidebarSnapshot() });
        return { ok: true, log: [] };
      case 'right_sidebar.log.list':
        return { log: this.sidebarState.log };
      case 'browser.open_split': {
        const state = this.emitBrowserCommand('open', params);
        this.context.activateApp?.();
        return { ok: true, surface: { id: 'browser:main', type: 'browser', url: state.url }, state };
      }
      case 'browser.navigate': {
        const url = stringParam(params, 'url');
        if (!url) {
          throw new Error('url is required');
        }
        const state = this.emitBrowserCommand('navigate', params);
        return { ok: true, url: state.url, state };
      }
      case 'browser.back':
        return { ok: true, state: this.emitBrowserCommand('back', params) };
      case 'browser.forward':
        return { ok: true, state: this.emitBrowserCommand('forward', params) };
      case 'browser.reload':
        return { ok: true, state: this.emitBrowserCommand('reload', params) };
      case 'browser.url.get':
        return { url: this.browserState.url, state: this.browserSnapshot() };
      case 'browser.focus_webview': {
        const state = this.emitBrowserCommand('focus', params);
        this.context.activateApp?.();
        return { ok: true, focused: true, state };
      }
      case 'browser.is_webview_focused':
        return { focused: this.browserState.focused, state: this.browserSnapshot() };
      case 'browser.snapshot': {
        const maxChars = numberParam(params, 'max_chars', 'limit') ?? 20000;
        const snapshot = await this.executeBrowserJavaScript(`
          (() => {
            const limit = ${JSON.stringify(maxChars)};
            const clip = (value) => String(value ?? '').slice(0, limit);
            const selectorFor = (element) => {
              if (element.id) return '#' + CSS.escape(element.id);
              const role = element.getAttribute('role');
              const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder');
              if (role && label) return '[role="' + role + '"][aria-label="' + label.replace(/"/g, '\\"') + '"]';
              const segments = [];
              let current = element;
              while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 5) {
                let segment = current.localName;
                const parent = current.parentElement;
                if (parent) {
                  const siblings = Array.from(parent.children).filter((child) => child.localName === current.localName);
                  if (siblings.length > 1) segment += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
                }
                segments.unshift(segment);
                current = parent;
              }
              return segments.join(' > ');
            };
            const elementSummary = (element) => ({
              selector: selectorFor(element),
              tag: element.localName,
              role: element.getAttribute('role'),
              label: element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder') || element.innerText?.trim().slice(0, 120) || null,
              text: element.innerText?.trim().slice(0, 240) || null,
              href: element.href || null,
              value: 'value' in element ? element.value : null,
            });
            return {
              url: location.href,
              title: document.title,
              text: clip(document.body?.innerText ?? ''),
              html: clip(document.documentElement?.outerHTML ?? ''),
              elements: Array.from(document.querySelectorAll('a,button,input,textarea,select,[role],[aria-label],[data-testid]')).slice(0, 200).map(elementSummary),
            };
          })()
        `);
        return { snapshot, state: this.browserSnapshot() };
      }
      case 'browser.eval': {
        const source = stringParam(params, 'code', 'js', 'expression', 'script');
        if (!source) {
          throw new Error('code is required');
        }
        return { value: await this.executeBrowserJavaScript(source), state: this.browserSnapshot() };
      }
      case 'browser.wait':
        return { ok: true, result: await this.executeBrowserJavaScript(browserWaitScript(params)), state: this.browserSnapshot() };
      case 'browser.click':
      case 'browser.dblclick':
      case 'browser.hover':
      case 'browser.focus': {
        const selector = stringParam(params, 'selector');
        if (!selector) {
          throw new Error('selector is required');
        }
        const action = method.split('.')[1];
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
            element.scrollIntoView({ block: 'center', inline: 'center' });
            if (${JSON.stringify(action)} === 'focus') {
              element.focus();
            } else if (${JSON.stringify(action)} === 'hover') {
              element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
              element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window }));
            } else if (${JSON.stringify(action)} === 'dblclick') {
              element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
            } else {
              element.click();
            }
            return { selector: ${JSON.stringify(selector)}, action: ${JSON.stringify(action)} };
          })()
        `);
        return { ok: true, result, state: this.browserSnapshot() };
      }
      case 'browser.check':
      case 'browser.uncheck': {
        const selector = stringParam(params, 'selector');
        if (!selector) {
          throw new Error('selector is required');
        }
        const checked = method === 'browser.check';
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
            if (!('checked' in element)) throw new Error('target is not checkable');
            element.scrollIntoView({ block: 'center', inline: 'center' });
            element.checked = ${JSON.stringify(checked)};
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return { selector: ${JSON.stringify(selector)}, checked: element.checked };
          })()
        `);
        return { ok: true, result, state: this.browserSnapshot() };
      }
      case 'browser.scroll_into_view': {
        const selector = stringParam(params, 'selector');
        if (!selector) {
          throw new Error('selector is required');
        }
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
            element.scrollIntoView({ block: 'center', inline: 'center' });
            const rect = element.getBoundingClientRect();
            return { selector: ${JSON.stringify(selector)}, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
          })()
        `);
        return { ok: true, result, state: this.browserSnapshot() };
      }
      case 'browser.type':
      case 'browser.fill': {
        const selector = stringParam(params, 'selector');
        const text = stringParam(params, 'text', 'value');
        if (!selector) {
          throw new Error('selector is required');
        }
        if (text === null) {
          throw new Error('text is required');
        }
        const replace = method === 'browser.fill';
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
            element.scrollIntoView({ block: 'center', inline: 'center' });
            element.focus();
            const text = ${JSON.stringify(text)};
            if (element.isContentEditable) {
              element.textContent = ${JSON.stringify(replace)} ? text : (element.textContent || '') + text;
            } else if ('value' in element) {
              element.value = ${JSON.stringify(replace)} ? text : String(element.value || '') + text;
            } else {
              throw new Error('target is not editable');
            }
            element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return { selector: ${JSON.stringify(selector)}, value: element.isContentEditable ? element.textContent : element.value };
          })()
        `);
        return { ok: true, result, state: this.browserSnapshot() };
      }
      case 'browser.press':
      case 'browser.key': {
        const key = stringParam(params, 'key', 'code');
        if (!key) {
          throw new Error('key is required');
        }
        const contents = await this.waitForBrowserWebContents();
        contents.sendInputEvent({ type: 'keyDown', keyCode: key });
        if (key.length === 1) {
          contents.sendInputEvent({ type: 'char', keyCode: key });
        }
        contents.sendInputEvent({ type: 'keyUp', keyCode: key });
        return { ok: true, key, state: this.browserSnapshot() };
      }
      case 'browser.select': {
        const selector = stringParam(params, 'selector');
        const value = stringParam(params, 'value', 'option');
        if (!selector) {
          throw new Error('selector is required');
        }
        if (value === null) {
          throw new Error('value is required');
        }
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
            if (element.tagName !== 'SELECT') throw new Error('target is not a select element');
            element.value = ${JSON.stringify(value)};
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return { selector: ${JSON.stringify(selector)}, value: element.value };
          })()
        `);
        return { ok: true, result, state: this.browserSnapshot() };
      }
      case 'browser.scroll': {
        const selector = stringParam(params, 'selector');
        const x = numberParam(params, 'x', 'dx') ?? 0;
        const y = numberParam(params, 'y', 'dy') ?? 600;
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const target = ${JSON.stringify(selector)} ? document.querySelector(${JSON.stringify(selector)}) : window;
            if (!target) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
            if (target === window) {
              window.scrollBy(${JSON.stringify(x)}, ${JSON.stringify(y)});
              return { x: window.scrollX, y: window.scrollY };
            }
            target.scrollBy(${JSON.stringify(x)}, ${JSON.stringify(y)});
            return { x: target.scrollLeft, y: target.scrollTop };
          })()
        `);
        return { ok: true, result, state: this.browserSnapshot() };
      }
      case 'browser.screenshot': {
        const image = await (await this.waitForBrowserWebContents()).capturePage();
        return {
          mime_type: 'image/png',
          data_base64: image.toPNG().toString('base64'),
          size: image.getSize(),
          state: this.browserSnapshot(),
        };
      }
      case 'browser.get': {
        const kind = stringParam(params, 'kind', 'property', 'what') ?? 'text';
        const selector = stringParam(params, 'selector');
        const attr = stringParam(params, 'attr', 'attribute');
        const value = await this.executeBrowserJavaScript(`
          (() => {
            const kind = ${JSON.stringify(kind)};
            const selector = ${JSON.stringify(selector)};
            const attr = ${JSON.stringify(attr)};
            const element = selector ? document.querySelector(selector) : document.documentElement;
            if (selector && !element) throw new Error('selector not found: ' + selector);
            if (kind === 'url') return location.href;
            if (kind === 'title') return document.title;
            if (kind === 'html') return element.outerHTML;
            if (kind === 'text') return element.innerText || element.textContent || '';
            if (kind === 'value') return 'value' in element ? element.value : null;
            if (kind === 'attr') return element.getAttribute(attr);
            if (kind === 'count') return selector ? document.querySelectorAll(selector).length : 1;
            if (kind === 'box') {
              const rect = element.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
            if (kind === 'styles') return Object.fromEntries(Array.from(getComputedStyle(element)).map((name) => [name, getComputedStyle(element).getPropertyValue(name)]));
            throw new Error('unsupported browser get kind: ' + kind);
          })()
        `);
        return { value, kind, state: this.browserSnapshot() };
      }
      case 'browser.is': {
        const kind = stringParam(params, 'kind', 'state') ?? 'visible';
        const selector = stringParam(params, 'selector');
        if (!selector) {
          throw new Error('selector is required');
        }
        const value = await this.executeBrowserJavaScript(`
          (() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) return false;
            const kind = ${JSON.stringify(kind)};
            if (kind === 'checked') return Boolean(element.checked);
            if (kind === 'enabled') return !element.disabled && element.getAttribute('aria-disabled') !== 'true';
            if (kind === 'visible') {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
            }
            throw new Error('unsupported browser is kind: ' + kind);
          })()
        `);
        return { value, kind, selector, state: this.browserSnapshot() };
      }
      case 'browser.find': {
        const selector = stringParam(params, 'selector');
        const text = stringParam(params, 'text');
        const matches = await this.executeBrowserJavaScript(`
          (() => {
            const selector = ${JSON.stringify(selector)};
            const text = ${JSON.stringify(text)};
            const candidates = selector ? Array.from(document.querySelectorAll(selector)) : Array.from(document.querySelectorAll('a,button,input,textarea,select,[role],[aria-label],[data-testid],body *'));
            return candidates
              .filter((element) => !text || (element.innerText || element.textContent || element.getAttribute('aria-label') || '').includes(text))
              .slice(0, 50)
              .map((element, index) => ({
                index,
                tag: element.localName,
                text: (element.innerText || element.textContent || '').trim().slice(0, 240),
                role: element.getAttribute('role'),
                label: element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder'),
              }));
          })()
        `);
        return { matches, state: this.browserSnapshot() };
      }
      case 'browser.cookies': {
        const action = stringParam(params, 'action', 'subcommand') ?? 'get';
        const contents = await this.waitForBrowserWebContents();
        const url = stringParam(params, 'url') ?? this.browserState.url;
        if (action === 'get' || action === 'list') {
          const cookies = await contents.session.cookies.get({
            ...(url ? { url } : {}),
            ...(stringParam(params, 'name') ? { name: stringParam(params, 'name') as string } : {}),
          });
          return { cookies, state: this.browserSnapshot() };
        }
        if (action === 'set') {
          const name = stringParam(params, 'name');
          const value = stringParam(params, 'value');
          if (!name || value === null) {
            throw new Error('name and value are required');
          }
          await contents.session.cookies.set({ url, name, value });
          return { ok: true, state: this.browserSnapshot() };
        }
        if (action === 'clear' || action === 'delete') {
          const cookies = await contents.session.cookies.get({
            ...(url ? { url } : {}),
            ...(stringParam(params, 'name') ? { name: stringParam(params, 'name') as string } : {}),
          });
          await Promise.all(cookies.map((cookie) => contents.session.cookies.remove(url, cookie.name)));
          return { ok: true, cleared: cookies.length, state: this.browserSnapshot() };
        }
        throw new Error(`unsupported browser cookies action: ${action}`);
      }
      case 'browser.storage': {
        const action = stringParam(params, 'action', 'subcommand') ?? 'get';
        const area = stringParam(params, 'area') === 'session' ? 'sessionStorage' : 'localStorage';
        const key = stringParam(params, 'key');
        const value = stringParam(params, 'value');
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const store = window[${JSON.stringify(area)}];
            const action = ${JSON.stringify(action)};
            const key = ${JSON.stringify(key)};
            const value = ${JSON.stringify(value)};
            if (action === 'get' || action === 'list') {
              if (key) return store.getItem(key);
              return Object.fromEntries(Array.from({ length: store.length }, (_, index) => {
                const name = store.key(index);
                return [name, name ? store.getItem(name) : null];
              }));
            }
            if (action === 'set') {
              if (!key || value === null) throw new Error('key and value are required');
              store.setItem(key, value);
              return { key, value: store.getItem(key) };
            }
            if (action === 'clear') {
              if (key) store.removeItem(key);
              else store.clear();
              return { cleared: key || 'all' };
            }
            throw new Error('unsupported browser storage action: ' + action);
          })()
        `);
        return { result, state: this.browserSnapshot() };
      }
      case 'browser.highlight': {
        const selector = stringParam(params, 'selector');
        if (!selector) {
          throw new Error('selector is required');
        }
        const result = await this.executeBrowserJavaScript(`
          (() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
            element.scrollIntoView({ block: 'center', inline: 'center' });
            element.style.outline = '3px solid #85e071';
            element.style.outlineOffset = '2px';
            return { selector: ${JSON.stringify(selector)} };
          })()
        `);
        return { ok: true, result, state: this.browserSnapshot() };
      }
      case 'browser.addscript':
      case 'browser.addinitscript':
      case 'browser.addstyle': {
        const source = stringParam(params, 'code', 'js', 'css', 'source');
        if (!source) {
          throw new Error('source is required');
        }
        if (method === 'browser.addstyle') {
          await this.executeBrowserJavaScript(`
            (() => {
              const style = document.createElement('style');
              style.textContent = ${JSON.stringify(source)};
              document.documentElement.appendChild(style);
              return true;
            })()
          `);
        } else {
          await this.executeBrowserJavaScript(source);
        }
        return { ok: true, state: this.browserSnapshot() };
      }
      case 'browser.identify':
        return {
          surface_id: 'browser:main',
          web_contents_id: this.browserState.webContentsId,
          state: this.browserSnapshot(),
        };
      case 'debug.app.activate':
        this.context.activateApp?.();
        return { ok: true };
      case 'debug.terminal.read_text': {
        const target = firstSurface(state, params);
        if (!target) {
          throw new Error('surface not found');
        }
        return {
          surface_id: makeSurfaceId(target.windowHandle, target.paneId),
          text: await this.context.automation.readBuffer(target.windowHandle, target.paneId),
        };
      }
      case 'debug.terminal.is_focused': {
        const target = firstSurface(state, params);
        if (!target) {
          return { focused: false };
        }
        const window = windowByHandle(state, target.windowHandle);
        const pane = window?.panes.find((candidate) => candidate.id === target.paneId);
        return { focused: Boolean(pane?.focused), surface_id: makeSurfaceId(target.windowHandle, target.paneId) };
      }
      case 'debug.terminal.render_stats':
        return {
          windows: state.windows.length,
          panes: panesResult(state).panes.length,
          surfaces: surfacesResult(state).surfaces.length,
        };
      case 'debug.layout':
        return {
          windows: windowsResult(state).windows,
          workspaces: workspacesResult(state).workspaces,
          panes: panesResult(state).panes,
          surfaces: surfacesResult(state).surfaces,
        };
      case 'debug.window.screenshot': {
        const window = this.context.getMainWindow?.();
        if (!window || window.isDestroyed()) {
          throw new Error('main window is not available');
        }
        const image = await window.webContents.capturePage();
        return {
          mime_type: 'image/png',
          data_base64: image.toPNG().toString('base64'),
        };
      }
      case 'action.list':
        return { actions: this.context.actionRegistry.all() };
      case 'action.execute': {
        const target = firstSurface(state, params);
        const actionId = stringParam(params, 'action_id', 'action');
        if (!target) {
          throw new Error('surface not found');
        }
        if (actionId === null) {
          throw new Error('action_id is required');
        }
        const result = await this.context.actionExecutor.execute(
          actionId,
          target.windowHandle,
          target.paneId,
          asRecord(params.args),
        );
        if (result.ok && result.changes_structure) {
          await this.context.services.poller.forcePoll();
        }
        return result;
      }
      default:
        throw new Error(`unsupported method: ${method}`);
    }
  }
}

export function startCmuxProtocolServer(context: ProtocolContext): CmuxProtocolServer {
  const server = new CmuxProtocolServer(context);
  server.listen();
  return server;
}
