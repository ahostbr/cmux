export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WtPane {
  id: number;
  title: string;
  focused: boolean;
  class_name: string;
  control_type: string;
  automation_id?: string;
  rect: Rect | null;
  has_text_pattern?: boolean;
}

export interface WtShell {
  pid: number;
  name: string;
  cmdline: string;
  cwd: string;
  cpu_percent: number;
  memory_mb: number;
  create_time?: string;
}

export interface WtWindow {
  handle: number;
  title: string;
  pid: number;
  panes: WtPane[];
  shells: WtShell[];
}

export interface WtState {
  windows: WtWindow[];
}

export interface ProcessGroup {
  pid: number;
  name: string;
  create_time?: string;
  shells: WtShell[];
}

export interface ArgDef {
  name: string;
  label: string;
  type: 'string' | 'int' | 'choice';
  required: boolean;
  default: string | number | null;
  choices: string[] | null;
}

export interface ActionDef {
  id: string;
  name: string;
  category: string;
  method: 'shortcut' | 'cli' | 'palette';
  shortcut: string | null;
  palette_name: string | null;
  cli_command?: string | null;
  args: ArgDef[];
  changes_structure: boolean;
  description: string;
}

export interface ExecuteRequest {
  action_id: string;
  window: number;
  pane_id: number | null;
  args?: Record<string, string | number>;
}

export interface ExecuteResponse {
  ok: boolean;
  error?: string;
  action?: string;
  changes_structure?: boolean;
  stdout?: string;
  stderr?: string;
  returncode?: number;
}

export interface ActionsResponse {
  actions: ActionDef[];
  total: number;
}

export interface CategoriesResponse {
  categories: Record<string, number>;
}

export interface MacroStep {
  action_id: string;
  args?: Record<string, unknown>;
  delay_ms: number;
}

export interface MacroSummary {
  name: string;
  steps: number;
  created: number | null;
}

export interface MacroDetail {
  name: string;
  steps: MacroStep[];
  created: number;
}

export interface MacroRunResult {
  ok: boolean;
  macro?: string;
  steps_run?: number;
  steps_total?: number;
  results?: Array<Record<string, unknown>>;
  changes_structure?: boolean;
  error?: string;
}

export interface Layout {
  name: string;
  tabs: Array<{ profile: string; cwd: string }>;
}

export interface AgentClaim {
  agent_id: string;
  pane_id: number;
  role: string;
  claimed_at: string;
  last_command: { text: string; at: string } | null;
}

export interface Watcher {
  id: string;
  name: string;
  pane_id: number;
  window_handle: number;
  pattern: string;
  action: string;
  trigger_action_id?: string | null;
  enabled: boolean;
  match_count: number;
  last_match: string | null;
}

export interface WatcherMatchEvent {
  type: 'watcher_match';
  watcher_id: string;
  watcher_name: string;
  pane_id: number;
  window_handle: number;
  matched_text: string;
  line: string;
  action: string;
  trigger_action_id?: string | null;
}

export interface SidebarStatus {
  id: string;
  label: string;
  value?: string;
  color?: string;
  updated_at: string;
}

export interface SidebarProgress {
  id: string;
  label: string;
  value: number;
  total?: number;
  updated_at: string;
}

export interface SidebarLogEntry {
  id: string;
  message: string;
  level: string;
  created_at: string;
}

export interface SidebarState {
  visible: boolean;
  mode: string;
  statuses: SidebarStatus[];
  progress: SidebarProgress[];
  log: SidebarLogEntry[];
}

export interface RightSidebarStateEvent {
  type: 'right_sidebar_state';
  state: SidebarState;
}

export interface RightSidebarStatusEvent {
  type: 'right_sidebar_status';
  status: SidebarStatus;
}

export interface RightSidebarProgressEvent {
  type: 'right_sidebar_progress';
  progress: SidebarProgress;
}

export interface RightSidebarLogEvent {
  type: 'right_sidebar_log';
  entry: SidebarLogEntry;
}

export interface BrowserSurfaceState {
  visible: boolean;
  url: string;
  title: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  focused: boolean;
  webContentsId: number | null;
  updated_at: string;
}

export interface BrowserStateEvent {
  type: 'browser_state';
  state: BrowserSurfaceState;
}

export interface BrowserCommandEvent {
  type: 'browser_command';
  command: 'open' | 'navigate' | 'back' | 'forward' | 'reload' | 'focus';
  url?: string;
  state: BrowserSurfaceState;
}

export type ScheduleType = 'cron' | 'interval' | 'once';
export type TriggerType = 'schedule' | 'watcher' | 'event';
export type JobActionType = 'macro' | 'action';
export type JobStatus = 'idle' | 'running' | 'paused';
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type PaneEvent =
  | 'process_exit'
  | 'pane_created'
  | 'pane_closed'
  | 'focus_changed'
  | 'tab_switched';
export type TriggeredBy = 'schedule' | 'watcher' | 'event' | 'manual';

export interface CronSchedule {
  type: 'cron';
  expression: string;
  timezone?: string;
}

export interface IntervalSchedule {
  type: 'interval';
  every: number;
  unit: 'minutes' | 'hours' | 'days';
}

export interface OneTimeSchedule {
  type: 'once';
  at: string;
}

export type Schedule = CronSchedule | IntervalSchedule | OneTimeSchedule;

export interface ScheduleTrigger {
  type: 'schedule';
  schedule: Schedule;
}

export interface WatcherTrigger {
  type: 'watcher';
  watcher_id: string;
}

export interface EventTrigger {
  type: 'event';
  event: PaneEvent;
  pane_filter?: { pane_id?: number; window_handle?: number };
}

export type Trigger = ScheduleTrigger | WatcherTrigger | EventTrigger;

export interface MacroAction {
  type: 'macro';
  macro_name: string;
}

export interface ActionAction {
  type: 'action';
  action_id: string;
  args?: Record<string, unknown>;
}

export type JobAction = MacroAction | ActionAction;

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: Trigger;
  action: JobAction;
  target_pane_id?: number;
  target_window_handle?: number;
  status: JobStatus;
  last_run?: string | null;
  next_run?: string | null;
  run_count: number;
  tags?: string[];
  notify_on_start: boolean;
  notify_on_complete: boolean;
  notify_on_error: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobRun {
  id: string;
  job_id: string;
  started_at: string;
  completed_at?: string;
  status: RunStatus;
  output?: string | null;
  error?: string | null;
  triggered_by: TriggeredBy;
  steps_run?: number;
  steps_total?: number;
}

export interface SchedulerSettings {
  enabled: boolean;
  max_concurrent_jobs: number;
  history_retention_days: number;
  poll_interval_ms: number;
}

export type StreamMessage =
  | { type: 'state'; data: WtState }
  | WatcherMatchEvent
  | RightSidebarStateEvent
  | RightSidebarStatusEvent
  | RightSidebarProgressEvent
  | RightSidebarLogEvent
  | BrowserStateEvent
  | BrowserCommandEvent
  | { type: 'flash'; surface_id?: string | null; workspace_id?: string | null; message?: string | null }
  | { type: 'notification'; notification: unknown }
  | { type: 'app_focus_override'; focused: boolean | null }
  | { type: 'app_active'; simulated: boolean; at: string };
