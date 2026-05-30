import { BrowserWindow, ipcMain } from 'electron';

const WINDOW_MAXIMIZE_CHANGE = 'wt:window:maximize-change';

export function registerWindowHandlers(): void {
  ipcMain.on('wt:window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('wt:window:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.on('wt:window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('wt:window:is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false);
}

export function bindWindowStateEvents(window: BrowserWindow): void {
  window.on('maximize', () => {
    window.webContents.send(WINDOW_MAXIMIZE_CHANGE, true);
  });
  window.on('unmaximize', () => {
    window.webContents.send(WINDOW_MAXIMIZE_CHANGE, false);
  });
}
