import { app } from 'electron';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

export interface AppPaths {
  baseDir: string;
  layoutsDir: string;
  macrosDir: string;
  schedulesDir: string;
  watchersPath: string;
  historyPath: string;
  settingsPath: string;
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function copyIfMissing(from: string, to: string): void {
  if (!existsSync(from) || existsSync(to)) {
    return;
  }
  ensureDirectory(dirname(to));
  cpSync(from, to, { recursive: true });
}

export function initializeAppPaths(): AppPaths {
  const baseDir = join(app.getPath('userData'), 'cmux-windows');
  const layoutsDir = join(baseDir, 'layouts');
  const macrosDir = join(baseDir, 'macros');
  const schedulesDir = join(baseDir, 'schedules');
  const watchersPath = join(baseDir, 'watchers.json');
  const historyPath = join(baseDir, 'schedule_history.json');
  const settingsPath = join(baseDir, 'scheduler_settings.json');

  ensureDirectory(baseDir);
  ensureDirectory(layoutsDir);
  ensureDirectory(macrosDir);
  ensureDirectory(schedulesDir);

  const legacyDir = join(homedir(), '.wtcmd');
  if (existsSync(legacyDir) && readdirSync(baseDir).length === 0) {
    copyIfMissing(join(legacyDir, 'layouts'), layoutsDir);
    copyIfMissing(join(legacyDir, 'macros'), macrosDir);
    copyIfMissing(join(legacyDir, 'schedules'), schedulesDir);
    copyIfMissing(join(legacyDir, 'watchers.json'), watchersPath);
    copyIfMissing(join(legacyDir, 'schedule_history.json'), historyPath);
    copyIfMissing(join(legacyDir, 'scheduler_settings.json'), settingsPath);
  }

  return {
    baseDir,
    layoutsDir,
    macrosDir,
    schedulesDir,
    watchersPath,
    historyPath,
    settingsPath,
  };
}

