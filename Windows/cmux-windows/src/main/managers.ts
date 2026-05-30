import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import type {
  AgentClaim,
  JobRun,
  Layout,
  MacroDetail,
  MacroRunResult,
  MacroStep,
  ProcessGroup,
  ScheduledJob,
  SchedulerSettings,
  StreamMessage,
  Trigger,
  Watcher,
  WatcherMatchEvent,
  WtState,
} from '../shared/types';
import type { ActionExecutor } from './actions';
import { TerminalAutomation, WtCli } from './terminal-automation';
import type { AppPaths } from './app-paths';

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirectory(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

function detectEvents(oldState: WtState | null, newState: WtState) {
  if (!oldState) {
    return [] as Array<{ type: string; pane_id: number; window_handle: number; metadata: Record<string, unknown> }>;
  }

  const events: Array<{
    type: string;
    pane_id: number;
    window_handle: number;
    metadata: Record<string, unknown>;
  }> = [];

  const mapWindows = (state: WtState) => {
    const result = new Map<
      number,
      {
        title: string;
        panes: Map<number, { focused: boolean }>;
        shells: Set<number>;
      }
    >();

    for (const window of state.windows) {
      result.set(window.handle, {
        title: window.title,
        panes: new Map(window.panes.map((pane) => [pane.id, { focused: pane.focused }])),
        shells: new Set(window.shells.map((shell) => shell.pid)),
      });
    }

    return result;
  };

  const oldWindows = mapWindows(oldState);
  const newWindows = mapWindows(newState);
  const handles = new Set<number>([...oldWindows.keys(), ...newWindows.keys()]);

  for (const handle of handles) {
    const oldWindow = oldWindows.get(handle) ?? {
      title: '',
      panes: new Map<number, { focused: boolean }>(),
      shells: new Set<number>(),
    };
    const newWindow = newWindows.get(handle) ?? {
      title: '',
      panes: new Map<number, { focused: boolean }>(),
      shells: new Set<number>(),
    };

    const oldPaneIds = new Set(oldWindow.panes.keys());
    const newPaneIds = new Set(newWindow.panes.keys());
    for (const paneId of newPaneIds) {
      if (!oldPaneIds.has(paneId)) {
        events.push({ type: 'pane_created', pane_id: paneId, window_handle: handle, metadata: {} });
      }
    }
    for (const paneId of oldPaneIds) {
      if (!newPaneIds.has(paneId)) {
        events.push({ type: 'pane_closed', pane_id: paneId, window_handle: handle, metadata: {} });
      }
    }

    const oldFocused = [...oldWindow.panes.entries()]
      .filter(([, pane]) => pane.focused)
      .map(([paneId]) => paneId);
    const newFocused = [...newWindow.panes.entries()]
      .filter(([, pane]) => pane.focused)
      .map(([paneId]) => paneId);
    if (JSON.stringify(oldFocused) !== JSON.stringify(newFocused) && newFocused.length > 0) {
      for (const paneId of newFocused) {
        events.push({
          type: 'focus_changed',
          pane_id: paneId,
          window_handle: handle,
          metadata: { from: oldFocused, to: newFocused },
        });
      }
    }

    if (oldWindow.title && newWindow.title && oldWindow.title !== newWindow.title) {
      events.push({
        type: 'tab_switched',
        pane_id: 0,
        window_handle: handle,
        metadata: { old_title: oldWindow.title, new_title: newWindow.title },
      });
    }

    for (const shellPid of oldWindow.shells) {
      if (!newWindow.shells.has(shellPid)) {
        events.push({
          type: 'process_exit',
          pane_id: 0,
          window_handle: handle,
          metadata: { pid: shellPid },
        });
      }
    }
  }

  return events;
}

function nextCronRun(expression: string, now = new Date()): string | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }

  const [minutes, hours, dayOfMonth, month, dayOfWeek] = fields.map((field, index) =>
    parseCronField(field, index),
  );
  if (!minutes || !hours || !dayOfMonth || !month || !dayOfWeek) {
    return null;
  }

  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let step = 0; step < 60 * 24 * 366; step += 1) {
    if (
      minutes.has(candidate.getMinutes()) &&
      hours.has(candidate.getHours()) &&
      dayOfMonth.has(candidate.getDate()) &&
      month.has(candidate.getMonth() + 1) &&
      dayOfWeek.has(candidate.getDay())
    ) {
      return candidate.toISOString();
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

function parseCronField(field: string, position: number): Set<number> | null {
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ] as const;
  const [minimum, maximum] = ranges[position];
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) {
      return null;
    }

    const [base, stepRaw] = trimmed.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      return null;
    }

    if (base === '*') {
      for (let value = minimum; value <= maximum; value += step) {
        values.add(value);
      }
      continue;
    }

    const rangeMatch = base.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start > end || start < minimum || end > maximum) {
        return null;
      }
      for (let value = start; value <= end; value += step) {
        values.add(value === 7 && position === 4 ? 0 : value);
      }
      continue;
    }

    const singleValue = Number(base);
    if (!Number.isInteger(singleValue)) {
      return null;
    }
    const normalizedValue = singleValue === 7 && position === 4 ? 0 : singleValue;
    if (normalizedValue < minimum || normalizedValue > maximum) {
      return null;
    }
    values.add(normalizedValue);
  }

  return values;
}

export class LayoutManager {
  constructor(private readonly layoutsDir: string) {
    ensureDirectory(layoutsDir);
  }

  listLayouts(): Layout[] {
    return readdirSync(this.layoutsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => readJsonFile<Layout>(join(this.layoutsDir, entry.name), { name: basename(entry.name, '.json'), tabs: [] }))
      .filter((layout) => layout && Array.isArray(layout.tabs));
  }

  saveLayout(name: string, state: WtState): string {
    const layout: Layout = {
      name,
      tabs: [],
    };

    for (const window of state.windows) {
      for (const shell of window.shells) {
        layout.tabs.push({
          profile: shell.name || 'PowerShell',
          cwd: shell.cwd || '',
        });
      }
    }

    const filePath = join(this.layoutsDir, `${name}.json`);
    writeJsonFile(filePath, layout);
    return filePath;
  }

  getLayout(name: string): Layout | null {
    const filePath = join(this.layoutsDir, `${name}.json`);
    return existsSync(filePath) ? readJsonFile<Layout>(filePath, { name, tabs: [] }) : null;
  }

  deleteLayout(name: string): boolean {
    const filePath = join(this.layoutsDir, `${name}.json`);
    if (!existsSync(filePath)) {
      return false;
    }
    unlinkSync(filePath);
    return true;
  }

  buildRestoreCommand(layout: Layout): string[] {
    const args: string[] = [];
    layout.tabs.forEach((tab, index) => {
      if (index > 0) {
        args.push(';', 'sp', '-V');
      }
      if (tab.profile) {
        args.push('-p', tab.profile);
      }
      if (tab.cwd) {
        args.push('-d', tab.cwd);
      }
    });
    return args;
  }
}

export class AgentManager {
  private readonly claims = new Map<string, AgentClaim>();

  listAgents(): AgentClaim[] {
    return [...this.claims.values()];
  }

  claim(agentId: string, paneId: number, role = 'worker') {
    for (const [currentAgentId, claim] of this.claims.entries()) {
      if (claim.pane_id === paneId && currentAgentId !== agentId) {
        return { ok: false, error: `Pane ${paneId} already claimed by ${currentAgentId}` };
      }
    }

    const claim: AgentClaim = {
      agent_id: agentId,
      pane_id: paneId,
      role,
      claimed_at: new Date().toISOString(),
      last_command: null,
    };
    this.claims.set(agentId, claim);
    return { ok: true, claim };
  }

  release(agentId: string) {
    if (!this.claims.has(agentId)) {
      return { ok: false, error: 'No claim found' };
    }
    this.claims.delete(agentId);
    return { ok: true };
  }

  recordCommand(agentId: string, command: string): void {
    const claim = this.claims.get(agentId);
    if (!claim) {
      return;
    }
    claim.last_command = {
      text: command,
      at: new Date().toISOString(),
    };
  }
}

export class MacroManager {
  private recordingState = false;
  private recordBuffer: MacroStep[] = [];

  constructor(private readonly macrosDir: string) {
    ensureDirectory(macrosDir);
  }

  get recording(): boolean {
    return this.recordingState;
  }

  listMacros() {
    return readdirSync(this.macrosDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => {
        const detail = readJsonFile<MacroDetail>(join(this.macrosDir, entry.name), {
          name: basename(entry.name, '.json'),
          steps: [],
          created: 0,
        });
        return {
          name: detail.name,
          steps: detail.steps.length,
          created: detail.created ?? null,
        };
      });
  }

  getMacro(name: string): MacroDetail | null {
    const filePath = join(this.macrosDir, `${name}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    return readJsonFile<MacroDetail>(filePath, { name, steps: [], created: 0 });
  }

  saveMacro(name: string, steps: MacroStep[]): string {
    const detail: MacroDetail = {
      name,
      steps,
      created: Date.now(),
    };
    const filePath = join(this.macrosDir, `${name}.json`);
    writeJsonFile(filePath, detail);
    return filePath;
  }

  deleteMacro(name: string): boolean {
    const filePath = join(this.macrosDir, `${name}.json`);
    if (!existsSync(filePath)) {
      return false;
    }
    unlinkSync(filePath);
    return true;
  }

  async executeMacro(
    name: string,
    executor: ActionExecutor,
    windowHandle: number,
    paneId: number | null,
  ): Promise<MacroRunResult> {
    const macro = this.getMacro(name);
    if (!macro) {
      return { ok: false, error: `Macro not found: ${name}` };
    }

    const results: Array<Record<string, unknown>> = [];
    let changesStructure = false;

    for (let index = 0; index < macro.steps.length; index += 1) {
      const step = macro.steps[index];
      if (index > 0 && step.delay_ms > 0) {
        await new Promise((resolve) => setTimeout(resolve, step.delay_ms));
      }
      const result = await executor.execute(step.action_id, windowHandle, paneId, step.args);
      results.push({ step: index, action: step.action_id, ...result });
      if (result.changes_structure) {
        changesStructure = true;
      }
      if (!result.ok) {
        break;
      }
    }

    return {
      ok: results.every((result) => result.ok !== false),
      macro: name,
      steps_run: results.length,
      steps_total: macro.steps.length,
      results,
      changes_structure: changesStructure,
    };
  }

  startRecording(): void {
    this.recordingState = true;
    this.recordBuffer = [];
  }

  stopRecording(): MacroStep[] {
    this.recordingState = false;
    const steps = [...this.recordBuffer];
    this.recordBuffer = [];
    return steps;
  }

  recordStep(actionId: string, args?: Record<string, unknown>): void {
    if (!this.recordingState) {
      return;
    }
    this.recordBuffer.push({
      action_id: actionId,
      args,
      delay_ms: 500,
    });
  }
}

export class WatcherManager {
  private readonly watchers = new Map<string, Watcher>();
  private readonly previousBuffers = new Map<string, string>();

  constructor(private readonly storagePath: string) {
    const stored = readJsonFile<{ watchers?: Watcher[] }>(storagePath, { watchers: [] });
    for (const watcher of stored.watchers ?? []) {
      this.watchers.set(watcher.id, watcher);
    }
  }

  private save(): void {
    writeJsonFile(this.storagePath, { watchers: [...this.watchers.values()] });
  }

  listWatchers(): Watcher[] {
    return [...this.watchers.values()];
  }

  addWatcher(input: {
    name: string;
    pane_id: number;
    window_handle: number;
    pattern: string;
    action?: string;
    trigger_action_id?: string | null;
  }): Watcher {
    const watcher: Watcher = {
      id: createId(),
      name: input.name,
      pane_id: input.pane_id,
      window_handle: input.window_handle,
      pattern: input.pattern,
      action: input.action ?? 'notify',
      trigger_action_id: input.trigger_action_id ?? null,
      enabled: true,
      match_count: 0,
      last_match: null,
    };
    this.watchers.set(watcher.id, watcher);
    this.save();
    return watcher;
  }

  removeWatcher(watcherId: string): boolean {
    const deleted = this.watchers.delete(watcherId);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  toggleWatcher(watcherId: string): Watcher | null {
    const watcher = this.watchers.get(watcherId);
    if (!watcher) {
      return null;
    }
    watcher.enabled = !watcher.enabled;
    this.save();
    return watcher;
  }

  checkOutput(paneId: number, windowHandle: number, bufferText: string): WatcherMatchEvent[] {
    const key = `${windowHandle}-${paneId}`;
    const previous = this.previousBuffers.get(key) ?? '';
    if (previous === bufferText) {
      return [];
    }
    this.previousBuffers.set(key, bufferText);

    const currentLines = bufferText
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    if (currentLines.length === 0) {
      return [];
    }

    let newLines = currentLines;
    if (previous) {
      const previousLines = previous
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
      const previousCounts = new Map<string, number>();
      for (const line of previousLines) {
        previousCounts.set(line, (previousCounts.get(line) ?? 0) + 1);
      }
      newLines = [];
      for (const line of currentLines) {
        const count = previousCounts.get(line) ?? 0;
        if (count > 0) {
          previousCounts.set(line, count - 1);
        } else {
          newLines.push(line);
        }
      }
    }

    if (newLines.length === 0) {
      return [];
    }

    const matches: WatcherMatchEvent[] = [];
    for (const watcher of this.watchers.values()) {
      if (!watcher.enabled || watcher.pane_id !== paneId || watcher.window_handle !== windowHandle) {
        continue;
      }

      let expression: RegExp;
      try {
        expression = new RegExp(watcher.pattern);
      } catch {
        continue;
      }

      for (const line of newLines) {
        const match = expression.exec(line);
        if (!match) {
          continue;
        }
        watcher.match_count += 1;
        watcher.last_match = match[0] ?? null;
        matches.push({
          type: 'watcher_match',
          watcher_id: watcher.id,
          watcher_name: watcher.name,
          pane_id: paneId,
          window_handle: windowHandle,
          matched_text: match[0] ?? watcher.pattern,
          line,
          action: watcher.action,
          trigger_action_id: watcher.trigger_action_id ?? null,
        });
      }
    }

    if (matches.length > 0) {
      this.save();
    }
    return matches;
  }
}

export class SchedulerManager {
  private readonly jobs = new Map<string, ScheduledJob>();
  private readonly history: JobRun[] = [];
  private settings: SchedulerSettings = {
    enabled: true,
    max_concurrent_jobs: 3,
    history_retention_days: 30,
    poll_interval_ms: 1000,
  };
  private actionExecutor: ActionExecutor | null = null;
  private macroManager: MacroManager | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(private readonly paths: AppPaths) {
    ensureDirectory(paths.schedulesDir);
    for (const entry of readdirSync(paths.schedulesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const job = readJsonFile<ScheduledJob | null>(join(paths.schedulesDir, entry.name), null);
      if (job) {
        this.jobs.set(job.id, job);
      }
    }

    const storedHistory = readJsonFile<JobRun[]>(paths.historyPath, []);
    this.history.push(...storedHistory);
    this.settings = {
      ...this.settings,
      ...readJsonFile<Partial<SchedulerSettings>>(paths.settingsPath, {}),
    };
  }

  setExecutors(actionExecutor: ActionExecutor, macroManager: MacroManager): void {
    this.actionExecutor = actionExecutor;
    this.macroManager = macroManager;
  }

  listJobs(): ScheduledJob[] {
    return [...this.jobs.values()];
  }

  getJob(jobId: string): ScheduledJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  createJob(input: Omit<ScheduledJob, 'id' | 'status' | 'last_run' | 'next_run' | 'run_count' | 'created_at' | 'updated_at'>): ScheduledJob {
    const now = new Date().toISOString();
    const job: ScheduledJob = {
      ...input,
      id: createId(),
      status: 'idle',
      last_run: null,
      next_run: this.computeNextRun(input.trigger),
      run_count: 0,
      created_at: now,
      updated_at: now,
    };
    this.jobs.set(job.id, job);
    this.saveJob(job);
    return job;
  }

  updateJob(jobId: string, updates: Record<string, unknown>): ScheduledJob | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    Object.assign(job, updates);
    job.updated_at = new Date().toISOString();
    if (updates.trigger) {
      job.next_run = this.computeNextRun(job.trigger);
    }
    this.saveJob(job);
    return job;
  }

  deleteJob(jobId: string): boolean {
    const deleted = this.jobs.delete(jobId);
    if (!deleted) {
      return false;
    }
    const filePath = join(this.paths.schedulesDir, `${jobId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    return true;
  }

  pauseJob(jobId: string): ScheduledJob | null {
    return this.updateJob(jobId, { status: 'paused' });
  }

  resumeJob(jobId: string): ScheduledJob | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    job.status = 'idle';
    job.next_run = this.computeNextRun(job.trigger);
    job.updated_at = new Date().toISOString();
    this.saveJob(job);
    return job;
  }

  getHistory(jobId?: string, limit?: number): JobRun[] {
    const filtered = jobId
      ? this.history.filter((run) => run.job_id === jobId)
      : [...this.history];
    filtered.sort((left, right) => right.started_at.localeCompare(left.started_at));
    return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
  }

  getSettings(): SchedulerSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<SchedulerSettings>): SchedulerSettings {
    this.settings = {
      ...this.settings,
      ...updates,
    };
    writeJsonFile(this.paths.settingsPath, this.settings);
    return this.getSettings();
  }

  start(): void {
    if (this.tickTimer) {
      return;
    }
    this.tickTimer = setInterval(() => {
      void this.tick();
    }, 1000);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  async executeJob(jobId: string, triggeredBy: JobRun['triggered_by'] = 'schedule'): Promise<JobRun | null> {
    const job = this.jobs.get(jobId);
    if (!job || !job.enabled || job.status === 'paused') {
      return null;
    }
    if (!this.actionExecutor || !this.macroManager) {
      throw new Error('Scheduler executors are not configured');
    }

    job.status = 'running';
    this.saveJob(job);

    let run: JobRun;
    try {
      if (job.action.type === 'macro') {
        const result = await this.macroManager.executeMacro(
          job.action.macro_name,
          this.actionExecutor,
          job.target_window_handle ?? 0,
          job.target_pane_id ?? null,
        );
        run = this.recordRun(job.id, {
          status: result.ok ? 'completed' : 'failed',
          triggered_by: triggeredBy,
          output: result.results ? JSON.stringify(result.results) : null,
          error: result.error ?? null,
          steps_run: result.steps_run,
          steps_total: result.steps_total,
        });
      } else {
        const result = await this.actionExecutor.execute(
          job.action.action_id,
          job.target_window_handle ?? 0,
          job.target_pane_id ?? null,
          job.action.args,
        );
        run = this.recordRun(job.id, {
          status: result.ok ? 'completed' : 'failed',
          triggered_by: triggeredBy,
          output: JSON.stringify(result),
          error: result.error ?? null,
        });
      }
    } catch (error) {
      run = this.recordRun(job.id, {
        status: 'failed',
        triggered_by: triggeredBy,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    job.status = 'idle';
    job.last_run = run.completed_at;
    job.run_count += 1;
    job.next_run = this.computeNextRun(job.trigger);
    this.saveJob(job);
    return run;
  }

  async handleWatcherMatch(watcherId: string): Promise<JobRun[]> {
    const results: JobRun[] = [];
    for (const job of this.jobs.values()) {
      if (job.enabled && job.status !== 'paused' && job.trigger.type === 'watcher' && job.trigger.watcher_id === watcherId) {
        const result = await this.executeJob(job.id, 'watcher');
        if (result) {
          results.push(result);
        }
      }
    }
    return results;
  }

  async handleEvent(
    eventType: string,
    paneId: number,
    windowHandle: number,
    metadata: Record<string, unknown>,
  ): Promise<JobRun[]> {
    const results: JobRun[] = [];
    for (const job of this.jobs.values()) {
      if (!(job.enabled && job.status !== 'paused' && job.trigger.type === 'event')) {
        continue;
      }
      if (job.trigger.event !== eventType) {
        continue;
      }
      const filter = job.trigger.pane_filter;
      if (filter?.pane_id && filter.pane_id !== paneId) {
        continue;
      }
      if (filter?.window_handle && filter.window_handle !== windowHandle) {
        continue;
      }
      const result = await this.executeJob(job.id, 'event');
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  private recordRun(
    jobId: string,
    partial: Partial<JobRun> & Pick<JobRun, 'status' | 'triggered_by'>,
  ): JobRun {
    const now = new Date().toISOString();
    const run: JobRun = {
      id: createId(),
      job_id: jobId,
      started_at: now,
      completed_at: now,
      status: partial.status,
      output: partial.output ?? null,
      error: partial.error ?? null,
      triggered_by: partial.triggered_by,
      steps_run: partial.steps_run,
      steps_total: partial.steps_total,
    };
    this.history.push(run);
    const cutoff = Date.now() - this.settings.history_retention_days * 24 * 60 * 60 * 1000;
    const retained = this.history
      .filter((item) => new Date(item.started_at).getTime() >= cutoff)
      .slice(-500);
    this.history.splice(0, this.history.length, ...retained);
    writeJsonFile(this.paths.historyPath, this.history);
    return run;
  }

  private saveJob(job: ScheduledJob): void {
    writeJsonFile(join(this.paths.schedulesDir, `${job.id}.json`), job);
  }

  private computeNextRun(trigger: Trigger): string | null {
    if (trigger.type !== 'schedule') {
      return null;
    }

    const schedule = trigger.schedule;
    const now = new Date();
    if (schedule.type === 'cron') {
      return nextCronRun(schedule.expression, now);
    }
    if (schedule.type === 'interval') {
      const delta =
        schedule.unit === 'days'
          ? schedule.every * 24 * 60 * 60 * 1000
          : schedule.unit === 'hours'
            ? schedule.every * 60 * 60 * 1000
            : schedule.every * 60 * 1000;
      return new Date(now.getTime() + delta).toISOString();
    }
    return schedule.at || null;
  }

  private async tick(): Promise<void> {
    if (this.tickInFlight || !this.settings.enabled) {
      return;
    }
    this.tickInFlight = true;
    try {
      const now = Date.now();
      const running = [...this.jobs.values()].filter((job) => job.status === 'running').length;
      const limit = this.settings.max_concurrent_jobs;
      let runningCount = running;
      for (const job of this.jobs.values()) {
        if (runningCount >= limit) {
          break;
        }
        if (!(job.enabled && job.status === 'idle' && job.trigger.type === 'schedule' && job.next_run)) {
          continue;
        }
        if (new Date(job.next_run).getTime() <= now) {
          void this.executeJob(job.id, 'schedule');
          runningCount += 1;
        }
      }
    } finally {
      this.tickInFlight = false;
    }
  }
}

export class StatePoller {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastState: WtState | null = null;

  constructor(
    private readonly automation: TerminalAutomation,
    private readonly watcherManager: WatcherManager,
    private readonly schedulerManager: SchedulerManager,
    private readonly emit: (message: StreamMessage) => void,
    private readonly intervalMs = 750,
  ) {}

  getState(): WtState {
    return this.lastState ?? { windows: [] };
  }

  async forcePoll(): Promise<void> {
    const state = await this.automation.getState();
    await this.publishState(state);
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.running = true;
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.intervalMs);
    void this.pollOnce();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.running) {
      return;
    }
    try {
      const state = await this.automation.getState();
      await this.publishState(state);
      await this.checkWatchers();
    } catch {
    }
  }

  private async publishState(state: WtState): Promise<void> {
    if (JSON.stringify(this.lastState) === JSON.stringify(state)) {
      return;
    }

    const events = detectEvents(this.lastState, state);
    this.lastState = state;
    this.emit({ type: 'state', data: state });

    for (const event of events) {
      await this.schedulerManager.handleEvent(
        event.type as never,
        event.pane_id,
        event.window_handle,
        event.metadata,
      );
    }
  }

  private async checkWatchers(): Promise<void> {
    const watchers = this.watcherManager.listWatchers().filter((watcher) => watcher.enabled);
    if (watchers.length === 0) {
      return;
    }

    const keys = new Map<string, { paneId: number; windowHandle: number }>();
    for (const watcher of watchers) {
      const key = `${watcher.window_handle}-${watcher.pane_id}`;
      keys.set(key, { paneId: watcher.pane_id, windowHandle: watcher.window_handle });
    }

    for (const { paneId, windowHandle } of keys.values()) {
      try {
        const bufferText = await this.automation.readBuffer(windowHandle, paneId);
        if (!bufferText) {
          continue;
        }
        const matches = this.watcherManager.checkOutput(paneId, windowHandle, bufferText);
        for (const match of matches) {
          this.emit(match);
          if (match.action === 'trigger') {
            await this.schedulerManager.handleWatcherMatch(match.watcher_id);
          }
        }
      } catch {
      }
    }
  }
}

export interface RuntimeServices {
  layouts: LayoutManager;
  agents: AgentManager;
  macros: MacroManager;
  watchers: WatcherManager;
  scheduler: SchedulerManager;
  poller: StatePoller;
}

export function createRuntimeServices(
  paths: AppPaths,
  automation: TerminalAutomation,
  wtCli: WtCli,
  actionExecutor: ActionExecutor,
  emit: (message: StreamMessage) => void,
): RuntimeServices {
  const layouts = new LayoutManager(paths.layoutsDir);
  const agents = new AgentManager();
  const macros = new MacroManager(paths.macrosDir);
  const watchers = new WatcherManager(paths.watchersPath);
  const scheduler = new SchedulerManager(paths);
  scheduler.setExecutors(actionExecutor, macros);
  const poller = new StatePoller(automation, watchers, scheduler, emit);

  return {
    layouts,
    agents,
    macros,
    watchers,
    scheduler,
    poller,
  };
}

