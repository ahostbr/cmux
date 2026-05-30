import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'path';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createActionRegistry, ActionExecutor } from './actions';
import { initializeAppPaths } from './app-paths';
import { startCmuxProtocolServer, type CmuxProtocolServer } from './cmux-protocol';
import { registerApiHandlers } from './ipc/api-handlers';
import { bindWindowStateEvents, registerWindowHandlers } from './ipc/window-handlers';
import { createRuntimeServices } from './managers';
import { TerminalAutomation, WtCli } from './terminal-automation';
import type { BrowserSurfaceState, StreamMessage } from '../shared/types';

const SETTINGS_FILE = 'cmux-windows-settings.json';
let mainWindow: BrowserWindow | null = null;
let cmuxProtocolServer: CmuxProtocolServer | null = null;
let preSpanBounds: Electron.Rectangle | null = null;
let isSpanned = false;

function broadcast(message: StreamMessage): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('wt:stream:event', message);
    }
  }
  cmuxProtocolServer?.broadcast(message);
}

function getSettingsPath() {
  return join(app.getPath('userData'), SETTINGS_FILE);
}

async function readSettings() {
  try {
    const raw = await readFile(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSettings(settings: Record<string, unknown>) {
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function getNestedValue(settings: Record<string, unknown>, key: string) {
  return key.split('.').reduce<unknown>((current, part) => (
    current && typeof current === 'object'
      ? (current as Record<string, unknown>)[part]
      : undefined
  ), settings);
}

function setNestedValue(settings: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split('.');
  let cursor: Record<string, unknown> = settings;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object') {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function getUnionBounds(): Electron.Rectangle {
  const displays = screen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const display of displays) {
    const { x, y, width, height } = display.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    frame: false,
    backgroundColor: '#15181C',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  bindWindowStateEvents(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  const window = createMainWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId('ai.manaflow.cmux.windows');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const paths = initializeAppPaths();
  const automation = new TerminalAutomation();
  const wtCli = new WtCli();
  const actionRegistry = createActionRegistry();
  const actionExecutor = new ActionExecutor(actionRegistry, automation, wtCli);
  const services = createRuntimeServices(paths, automation, wtCli, actionExecutor, broadcast);

  registerWindowHandlers();
  registerApiHandlers({ automation, wtCli, actionRegistry, actionExecutor, services, emit: broadcast });
  cmuxProtocolServer = startCmuxProtocolServer({
    automation,
    wtCli,
    actionRegistry,
    actionExecutor,
    services,
    getMainWindow: () => mainWindow,
    emit: broadcast,
    activateApp: () => {
      const window = createMainWindow();
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
  });
  ipcMain.handle('right-sidebar:state:get', () => {
    if (!cmuxProtocolServer) {
      throw new Error('cmux protocol server is not available');
    }
    return cmuxProtocolServer.getSidebarState();
  });
  ipcMain.handle('right-sidebar:state:set', (_event, input: { visible?: boolean; mode?: string }) => {
    if (!cmuxProtocolServer) {
      throw new Error('cmux protocol server is not available');
    }
    return cmuxProtocolServer.setSidebarState(input);
  });
  ipcMain.handle('right-sidebar:toggle', () => {
    if (!cmuxProtocolServer) {
      throw new Error('cmux protocol server is not available');
    }
    return cmuxProtocolServer.toggleSidebar();
  });
  ipcMain.handle('browser:state:get', () => {
    if (!cmuxProtocolServer) {
      throw new Error('cmux protocol server is not available');
    }
    return cmuxProtocolServer.getBrowserState();
  });
  ipcMain.handle('browser:state:update', (_event, input: Partial<BrowserSurfaceState>) => {
    if (!cmuxProtocolServer) {
      throw new Error('cmux protocol server is not available');
    }
    return cmuxProtocolServer.updateBrowserState(input);
  });

  ipcMain.handle('app:info', () => ({
    name: 'cmux Windows',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));
  ipcMain.handle('settings:get', async (_event, key: string) => {
    const settings = await readSettings();
    return getNestedValue(settings, key);
  });
  ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
    const settings = await readSettings();
    setNestedValue(settings, key, value);
    await writeSettings(settings);
    return value;
  });
  ipcMain.on('wt:window:span-all-monitors', () => {
    if (!mainWindow || isSpanned) return;
    preSpanBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(1, 1);
    mainWindow.setBounds(getUnionBounds());
    isSpanned = true;
    mainWindow.webContents.send('wt:window:span-change', true);
  });
  ipcMain.on('wt:window:restore-span', () => {
    if (!mainWindow || !isSpanned) return;
    if (preSpanBounds) {
      mainWindow.setBounds(preSpanBounds);
    }
    mainWindow.setMinimumSize(1200, 760);
    isSpanned = false;
    preSpanBounds = null;
    mainWindow.webContents.send('wt:window:span-change', false);
  });
  ipcMain.handle('wt:window:is-spanned', () => isSpanned);

  services.poller.start();
  services.scheduler.start();
  createMainWindow();

  screen.on('display-removed', () => {
    if (!mainWindow || !isSpanned) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    mainWindow.setBounds(primaryDisplay.workArea);
    mainWindow.setMinimumSize(1200, 760);
    isSpanned = false;
    preSpanBounds = null;
    mainWindow.webContents.send('wt:window:span-change', false);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.on('before-quit', () => {
    services.poller.stop();
    services.scheduler.stop();
    cmuxProtocolServer?.close();
    cmuxProtocolServer = null;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
