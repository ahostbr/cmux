import { execFile, spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { cpus } from 'os';
import { promisify } from 'util';
import type { ExecuteResponse, ProcessGroup, WtShell, WtState } from '../shared/types';

const execFileAsync = promisify(execFile);
const POWERSHELL_PATH =
  'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const WT_PATH = 'wt.exe';
export const OWNED_WINDOW_HANDLE = -9001;
const DEFAULT_SHELL = process.env.ComSpec || 'C:\\WINDOWS\\System32\\cmd.exe';
const SHELL_NAMES = new Set([
  'powershell.exe',
  'pwsh.exe',
  'cmd.exe',
  'bash.exe',
  'wsl.exe',
  'zsh.exe',
  'fish.exe',
  'nu.exe',
  'claude.exe',
]);

interface RawRect {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

interface RawPane {
  id: number;
  title: string;
  focused: boolean;
  class_name: string;
  control_type: string;
  automation_id?: string;
  rect?: RawRect | null;
  has_text_pattern?: boolean;
}

interface RawShell {
  pid: number;
  name: string;
  cmdline?: string | null;
  cwd?: string | null;
  cpu_seconds?: number | null;
  memory_bytes?: number | null;
  create_time?: string | null;
}

interface RawWindow {
  handle: number;
  title: string;
  pid: number;
  panes: RawPane[];
  shells: RawShell[];
}

interface RawState {
  windows: RawWindow[];
}

interface OwnedTerminalSession {
  id: number;
  process: ChildProcessWithoutNullStreams;
  cwd: string;
  command: string;
  title: string;
  createdAt: string;
  buffer: string;
  exited: boolean;
}

async function runPowerShellJson<T>(
  script: string,
  args?: unknown,
  timeout = 8000,
): Promise<T> {
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
  const env = {
    ...process.env,
    CMUX_WINDOWS_ARGS: args ? JSON.stringify(args) : '',
  };

  const { stdout, stderr } = await execFileAsync(
    POWERSHELL_PATH,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
    {
      env,
      windowsHide: true,
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const trimmed = stdout.trim();
  if (!trimmed) {
    if (stderr.trim()) {
      throw new Error(stderr.trim());
    }
    return undefined as T;
  }

  return JSON.parse(trimmed) as T;
}

async function runCommand(
  command: string,
  args: string[],
  timeout = 5000,
): Promise<ExecuteResponse> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout,
      stderr,
      returncode: 0,
    };
  } catch (error) {
    const details = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };
    return {
      ok: false,
      error: details.message,
      stdout: details.stdout,
      stderr: details.stderr,
      returncode:
        typeof details.code === 'number' ? details.code : undefined,
    };
  }
}

const TERMINAL_STATE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Management

function Get-Panes([int]$handle) {
  $window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle)
  if (-not $window) {
    return @()
  }

  $descendants = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )

  $panes = @()
  $paneId = 0
  foreach ($child in $descendants) {
    try {
      $current = $child.Current
      $className = [string]$current.ClassName
      $controlType = $current.ControlType.ProgrammaticName
      if ($controlType -eq 'ControlType.Pane' -or $className -like '*TermControl*') {
        $rect = $current.BoundingRectangle
        $panes += [pscustomobject]@{
          id = $paneId
          title = [string]$current.Name
          class_name = $className
          control_type = $controlType
          automation_id = [string]$current.AutomationId
          focused = [bool]$current.HasKeyboardFocus
          rect = if ($rect) {
            [pscustomobject]@{
              left = [int]$rect.Left
              top = [int]$rect.Top
              right = [int]$rect.Right
              bottom = [int]$rect.Bottom
            }
          } else {
            $null
          }
          has_text_pattern = $className -like '*TermControl*'
        }
        $paneId += 1
      }
    } catch {
    }
  }

  return $panes
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty,
  'CASCADIA_HOSTING_WINDOW_CLASS'
)
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)

$processRows = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, CreationDate
$childrenByParent = @{}
foreach ($row in $processRows) {
  $parentId = [int]$row.ParentProcessId
  if (-not $childrenByParent.ContainsKey($parentId)) {
    $childrenByParent[$parentId] = New-Object System.Collections.ArrayList
  }
  [void]$childrenByParent[$parentId].Add($row)
}

$runtimeMap = @{}
foreach ($proc in Get-Process -ErrorAction SilentlyContinue) {
  $startTime = $null
  try {
    $startTime = $proc.StartTime.ToUniversalTime().ToString('o')
  } catch {
  }

  $runtimeMap[[int]$proc.Id] = [pscustomobject]@{
    id = [int]$proc.Id
    cpu = if ($null -ne $proc.CPU) { [double]$proc.CPU } else { 0.0 }
    memory = if ($null -ne $proc.WorkingSet64) { [double]$proc.WorkingSet64 } else { 0.0 }
    start = $startTime
  }
}

$shellNames = @(
  'powershell.exe', 'pwsh.exe', 'cmd.exe', 'bash.exe',
  'wsl.exe', 'zsh.exe', 'fish.exe', 'nu.exe', 'claude.exe'
)

function Get-DescendantProcesses([int]$processId) {
  $result = @()
  $queue = New-Object 'System.Collections.Generic.Queue[object]'
  if ($childrenByParent.ContainsKey($processId)) {
    foreach ($child in $childrenByParent[$processId]) {
      $queue.Enqueue($child)
    }
  }

  while ($queue.Count -gt 0) {
    $item = $queue.Dequeue()
    $result += $item
    $itemPid = [int]$item.ProcessId
    if ($childrenByParent.ContainsKey($itemPid)) {
      foreach ($child in $childrenByParent[$itemPid]) {
        $queue.Enqueue($child)
      }
    }
  }

  return $result
}

$output = @{ windows = @() }
foreach ($window in $windows) {
  $current = $window.Current
  $windowHandle = [int]$current.NativeWindowHandle
  $windowPid = [int]$current.ProcessId
  $shells = @()

  foreach ($proc in (Get-DescendantProcesses $windowPid)) {
    $name = [string]$proc.Name
    if ($shellNames -contains $name.ToLowerInvariant()) {
      $runtime = $runtimeMap[[int]$proc.ProcessId]
      $shells += [pscustomobject]@{
        pid = [int]$proc.ProcessId
        name = $name
        cmdline = if ($null -ne $proc.CommandLine) { [string]$proc.CommandLine } else { '' }
        cwd = ''
        cpu_seconds = if ($runtime) { [double]$runtime.cpu } else { 0.0 }
        memory_bytes = if ($runtime) { [double]$runtime.memory } else { 0.0 }
        create_time = if ($runtime -and $runtime.start) {
          $runtime.start
        } elseif ($proc.CreationDate) {
          try {
            [System.Management.ManagementDateTimeConverter]::ToDateTime($proc.CreationDate).ToUniversalTime().ToString('o')
          } catch {
            $null
          }
        } else {
          $null
        }
      }
    }
  }

  $output.windows += [pscustomobject]@{
    handle = $windowHandle
    title = [string]$current.Name
    pid = $windowPid
    panes = Get-Panes $windowHandle
    shells = $shells
  }
}

$output | ConvertTo-Json -Depth 8 -Compress
`;

const BUFFER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$argsData = if ($env:CMUX_WINDOWS_ARGS) { $env:CMUX_WINDOWS_ARGS | ConvertFrom-Json } else { $null }
$windowHandle = [int]$argsData.windowHandle
$paneId = [int]$argsData.paneId

function Get-TargetElement([int]$handle, [int]$targetPaneId) {
  $window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle)
  if (-not $window) {
    return $null
  }

  $descendants = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )

  $currentPaneId = 0
  foreach ($child in $descendants) {
    try {
      $current = $child.Current
      $className = [string]$current.ClassName
      $controlType = $current.ControlType.ProgrammaticName
      if ($controlType -eq 'ControlType.Pane' -or $className -like '*TermControl*') {
        if ($currentPaneId -eq $targetPaneId) {
          return $child
        }
        $currentPaneId += 1
      }
    } catch {
    }
  }

  return $null
}

$target = Get-TargetElement $windowHandle $paneId
if (-not $target) {
  @{ buffer_b64 = $null } | ConvertTo-Json -Compress
  exit 0
}

$valuePattern = $null
$textPattern = $null
$result = $null
if ($target.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
  $result = [string]$valuePattern.Current.Value
} elseif ($target.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$textPattern)) {
  $result = [string]$textPattern.DocumentRange.GetText(-1)
} else {
  $result = [string]$target.Current.Name
}

@{
  buffer_b64 = if ($null -ne $result) {
    [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([string]$result))
  } else {
    $null
  }
} | ConvertTo-Json -Compress
`;
const SEND_KEYS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$argsData = if ($env:CMUX_WINDOWS_ARGS) { $env:CMUX_WINDOWS_ARGS | ConvertFrom-Json } else { $null }
$windowHandle = [int]$argsData.windowHandle
$paneId = [int]$argsData.paneId
$keys = if ($argsData.keys) { [string]$argsData.keys } else { $null }
$focusOnly = if ($null -ne $argsData.focusOnly) { [bool]$argsData.focusOnly } else { $false }

function Get-TargetElement([int]$handle, [int]$targetPaneId) {
  $window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle)
  if (-not $window) {
    return $null
  }

  $descendants = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )

  $currentPaneId = 0
  foreach ($child in $descendants) {
    try {
      $current = $child.Current
      $className = [string]$current.ClassName
      $controlType = $current.ControlType.ProgrammaticName
      if ($controlType -eq 'ControlType.Pane' -or $className -like '*TermControl*') {
        if ($currentPaneId -eq $targetPaneId) {
          return $child
        }
        $currentPaneId += 1
      }
    } catch {
    }
  }

  return $null
}

$target = Get-TargetElement $windowHandle $paneId
if (-not $target) {
  $false | ConvertTo-Json -Compress
  exit 0
}

try {
  $target.SetFocus()
  Start-Sleep -Milliseconds 80
  if (-not $focusOnly -and $keys) {
    [System.Windows.Forms.SendKeys]::SendWait($keys)
  }
  $true | ConvertTo-Json -Compress
} catch {
  $false | ConvertTo-Json -Compress
}
`;

const COMMAND_PALETTE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$argsData = if ($env:CMUX_WINDOWS_ARGS) { $env:CMUX_WINDOWS_ARGS | ConvertFrom-Json } else { $null }
$windowHandle = [int]$argsData.windowHandle
$paneId = [int]$argsData.paneId
$actionName = [string]$argsData.actionName
$actionArgs = $argsData.args

function Get-TargetElement([int]$handle, [int]$targetPaneId) {
  $window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle)
  if (-not $window) {
    return $null
  }

  $descendants = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )

  $currentPaneId = 0
  foreach ($child in $descendants) {
    try {
      $current = $child.Current
      $className = [string]$current.ClassName
      $controlType = $current.ControlType.ProgrammaticName
      if ($controlType -eq 'ControlType.Pane' -or $className -like '*TermControl*') {
        if ($currentPaneId -eq $targetPaneId) {
          return $child
        }
        $currentPaneId += 1
      }
    } catch {
    }
  }

  return $null
}

$target = Get-TargetElement $windowHandle $paneId
if (-not $target) {
  $false | ConvertTo-Json -Compress
  exit 0
}

try {
  $target.SetFocus()
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait('^+p')
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait($actionName)
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')

  if ($actionArgs) {
    Start-Sleep -Milliseconds 300
    foreach ($prop in $actionArgs.PSObject.Properties) {
      if ($prop.Name -eq 'tab_index') {
        continue
      }
      if ($null -ne $prop.Value -and [string]$prop.Value -ne '') {
        [System.Windows.Forms.SendKeys]::SendWait([string]$prop.Value)
        Start-Sleep -Milliseconds 100
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
      }
    }
  }

  $true | ConvertTo-Json -Compress
} catch {
  $false | ConvertTo-Json -Compress
}
`;

const SPLIT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$argsData = if ($env:CMUX_WINDOWS_ARGS) { $env:CMUX_WINDOWS_ARGS | ConvertFrom-Json } else { $null }
$windowHandle = [int]$argsData.windowHandle
$paneId = [int]$argsData.paneId
$direction = if ($argsData.direction) { [string]$argsData.direction } else { 'vertical' }

function Get-PaneCount([int]$handle) {
  $window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle)
  if (-not $window) {
    return 0
  }
  $descendants = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  $count = 0
  foreach ($child in $descendants) {
    try {
      $current = $child.Current
      $className = [string]$current.ClassName
      $controlType = $current.ControlType.ProgrammaticName
      if ($controlType -eq 'ControlType.Pane' -or $className -like '*TermControl*') {
        $count += 1
      }
    } catch {
    }
  }
  return $count
}

function Get-TargetElement([int]$handle, [int]$targetPaneId) {
  $window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle)
  if (-not $window) {
    return $null
  }
  $descendants = $window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  $currentPaneId = 0
  foreach ($child in $descendants) {
    try {
      $current = $child.Current
      $className = [string]$current.ClassName
      $controlType = $current.ControlType.ProgrammaticName
      if ($controlType -eq 'ControlType.Pane' -or $className -like '*TermControl*') {
        if ($currentPaneId -eq $targetPaneId) {
          return $child
        }
        $currentPaneId += 1
      }
    } catch {
    }
  }
  return $null
}

$beforeCount = Get-PaneCount $windowHandle
$target = Get-TargetElement $windowHandle $paneId
if (-not $target) {
  $false | ConvertTo-Json -Compress
  exit 0
}

try {
  $target.SetFocus()
  Start-Sleep -Milliseconds 80
  if ($direction -eq 'horizontal') {
    [System.Windows.Forms.SendKeys]::SendWait('%+{-}')
  } else {
    [System.Windows.Forms.SendKeys]::SendWait('%+{=}')
  }

  Start-Sleep -Milliseconds 250
  $afterCount = Get-PaneCount $windowHandle
  ($afterCount -ge $beforeCount) | ConvertTo-Json -Compress
} catch {
  $false | ConvertTo-Json -Compress
}
`;

function normalizeRect(rect?: RawRect | null) {
  if (!rect) {
    return null;
  }

  return {
    left: Number(rect.left ?? 0),
    top: Number(rect.top ?? 0),
    right: Number(rect.right ?? 0),
    bottom: Number(rect.bottom ?? 0),
  };
}

function inferCwdFromCommandLine(cmdline: string): string {
  const patterns = [
    /-d\s+"([^"]+)"/i,
    /--cd\s+"([^"]+)"/i,
    /Set-Location(?:\s+-LiteralPath)?\s+'([^']+)'/i,
    /Set-Location(?:\s+-LiteralPath)?\s+"([^"]+)"/i,
    /cd\s+\/d\s+"([^"]+)"/i,
    /cd\s+"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = cmdline.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return '';
}

export class WtCli {
  private readonly wtPath = WT_PATH;

  async splitPane(options: {
    direction?: string;
    profile?: string;
    cwd?: string;
    window?: string;
    command?: string;
  }): Promise<ExecuteResponse> {
    const args = this.buildSplitCommand(options);
    return runCommand(this.wtPath, args);
  }

  buildSplitCommand(options: {
    direction?: string;
    profile?: string;
    cwd?: string;
    window?: string;
    command?: string;
  }): string[] {
    const args: string[] = [];
    if (options.window) {
      args.push('-w', options.window);
    }
    args.push('sp');
    args.push(options.direction === 'horizontal' ? '-H' : '-V');
    if (options.profile) {
      args.push('-p', options.profile);
    }
    if (options.cwd) {
      args.push('-d', options.cwd);
    }
    if (options.command) {
      args.push(options.command);
    }
    return args;
  }

  async newTab(options: {
    profile?: string;
    cwd?: string;
    window?: string;
    command?: string;
  }): Promise<ExecuteResponse> {
    const args = this.buildNewTabCommand(options);
    return runCommand(this.wtPath, args);
  }

  buildNewTabCommand(options: {
    profile?: string;
    cwd?: string;
    window?: string;
    command?: string;
  }): string[] {
    const args: string[] = [];
    if (options.window) {
      args.push('-w', options.window);
    }
    args.push('new-tab');
    if (options.profile) {
      args.push('-p', options.profile);
    }
    if (options.cwd) {
      args.push('-d', options.cwd);
    }
    if (options.command) {
      args.push(options.command);
    }
    return args;
  }

  async runCommand(args: string[]): Promise<ExecuteResponse> {
    return runCommand(this.wtPath, args);
  }
}

export class TerminalAutomation {
  private readonly cpuSamples = new Map<number, { cpuSeconds: number; at: number }>();
  private readonly ownedSessions = new Map<number, OwnedTerminalSession>();
  private nextOwnedPaneId = 1;

  constructor() {
    this.createOwnedSession({ title: 'cmux shell' });
  }

  async getState(): Promise<WtState> {
    const raw = await runPowerShellJson<RawState>(TERMINAL_STATE_SCRIPT);
    const seenPids = new Set<number>();

    const windows = (raw?.windows ?? []).map((window) => ({
      handle: Number(window.handle),
      title: window.title ?? '',
      pid: Number(window.pid),
      panes: (window.panes ?? []).map((pane) => ({
        id: Number(pane.id),
        title: pane.title ?? '',
        focused: Boolean(pane.focused),
        class_name: pane.class_name ?? '',
        control_type: pane.control_type ?? '',
        automation_id: pane.automation_id ?? '',
        rect: normalizeRect(pane.rect),
        has_text_pattern: Boolean(pane.has_text_pattern),
      })),
      shells: (window.shells ?? [])
        .filter((shell) => SHELL_NAMES.has((shell.name ?? '').toLowerCase()))
        .map((shell) => {
          seenPids.add(Number(shell.pid));
          return this.normalizeShell(shell);
        })
        .sort((left, right) => {
          const leftTime = new Date(left.create_time ?? 0).getTime();
          const rightTime = new Date(right.create_time ?? 0).getTime();
          return leftTime - rightTime;
        }),
    }));

    for (const pid of [...this.cpuSamples.keys()]) {
      if (!seenPids.has(pid)) {
        this.cpuSamples.delete(pid);
      }
    }

    const ownedWindow = this.ownedWindow();
    return { windows: ownedWindow ? [ownedWindow, ...windows] : windows };
  }

  async listProcesses(): Promise<ProcessGroup[]> {
    const state = await this.getState();
    return state.windows.map((window) => ({
      pid: window.pid,
      name: 'WindowsTerminal.exe',
      create_time: undefined,
      shells: window.shells,
    }));
  }

  async findWindows(): Promise<Array<{ handle: number; title: string; pid: number }>> {
    const state = await this.getState();
    return state.windows.map((window) => ({
      handle: window.handle,
      title: window.title,
      pid: window.pid,
    }));
  }

  async readBuffer(
    windowHandle: number,
    paneId: number,
    _shellPid?: number,
  ): Promise<string | null> {
    const owned = this.ownedSessions.get(paneId);
    if (windowHandle === OWNED_WINDOW_HANDLE && owned) {
      return owned.buffer;
    }

    const result = await runPowerShellJson<{ buffer_b64: string | null }>(BUFFER_SCRIPT, {
      windowHandle,
      paneId,
    }, 12000);
    return result?.buffer_b64
      ? Buffer.from(result.buffer_b64, 'base64').toString('utf8')
      : null;
  }

  async sendInput(windowHandle: number, paneId: number, text: string): Promise<boolean> {
    const owned = this.ownedSessions.get(paneId);
    if (windowHandle === OWNED_WINDOW_HANDLE && owned && !owned.exited) {
      const normalized = text.replace(/\{ENTER\}/gi, '\r\n');
      owned.process.stdin.write(normalized);
      return true;
    }

    return runPowerShellJson<boolean>(SEND_KEYS_SCRIPT, {
      windowHandle,
      paneId,
      keys: text,
      focusOnly: false,
    });
  }

  async sendShortcut(windowHandle: number, paneId: number, keys: string): Promise<boolean> {
    const owned = this.ownedSessions.get(paneId);
    if (windowHandle === OWNED_WINDOW_HANDLE && owned && !owned.exited) {
      if (/^\{?ENTER\}?$/i.test(keys)) {
        owned.process.stdin.write('\r\n');
        return true;
      }
      owned.process.stdin.write(keys);
      return true;
    }

    return runPowerShellJson<boolean>(SEND_KEYS_SCRIPT, {
      windowHandle,
      paneId,
      keys,
      focusOnly: false,
    });
  }

  async focusPane(windowHandle: number, paneId: number): Promise<boolean> {
    if (windowHandle === OWNED_WINDOW_HANDLE) {
      return this.ownedSessions.has(paneId);
    }

    return runPowerShellJson<boolean>(SEND_KEYS_SCRIPT, {
      windowHandle,
      paneId,
      focusOnly: true,
    });
  }

  async splitPane(
    windowHandle: number,
    paneId: number,
    direction = 'vertical',
  ): Promise<boolean> {
    if (windowHandle === OWNED_WINDOW_HANDLE && this.ownedSessions.has(paneId)) {
      this.createOwnedSession({ title: `cmux shell ${this.nextOwnedPaneId}` });
      return true;
    }

    return runPowerShellJson<boolean>(SPLIT_SCRIPT, {
      windowHandle,
      paneId,
      direction,
    });
  }

  async commandPaletteInvoke(
    windowHandle: number,
    paneId: number,
    actionName: string,
    args?: Record<string, unknown>,
  ): Promise<boolean> {
    if (windowHandle === OWNED_WINDOW_HANDLE) {
      return false;
    }

    return runPowerShellJson<boolean>(COMMAND_PALETTE_SCRIPT, {
      windowHandle,
      paneId,
      actionName,
      args: args ?? null,
    }, 12000);
  }

  createOwnedSession(options: { cwd?: string; command?: string; title?: string } = {}): OwnedTerminalSession {
    const id = this.nextOwnedPaneId++;
    const cwd = options.cwd || process.cwd();
    const command = options.command || DEFAULT_SHELL;
    const child = spawn(command, [], {
      cwd,
      env: process.env,
      windowsHide: true,
    });
    const session: OwnedTerminalSession = {
      id,
      process: child,
      cwd,
      command,
      title: options.title || `cmux shell ${id}`,
      createdAt: new Date().toISOString(),
      buffer: `> ${command}\r\n`,
      exited: false,
    };

    const append = (chunk: Buffer | string) => {
      session.buffer += chunk.toString();
      if (session.buffer.length > 200_000) {
        session.buffer = session.buffer.slice(-200_000);
      }
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => {
      append(`\r\n[cmux] terminal failed: ${error.message}\r\n`);
      session.exited = true;
    });
    child.on('exit', (code, signal) => {
      append(`\r\n[cmux] terminal exited code=${code ?? 'null'} signal=${signal ?? 'null'}\r\n`);
      session.exited = true;
    });

    this.ownedSessions.set(id, session);
    return session;
  }

  closePane(windowHandle: number, paneId: number): boolean {
    const owned = this.ownedSessions.get(paneId);
    if (windowHandle !== OWNED_WINDOW_HANDLE || !owned) {
      return false;
    }
    owned.process.kill();
    this.ownedSessions.delete(paneId);
    return true;
  }

  private normalizeShell(shell: RawShell): WtShell {
    const pid = Number(shell.pid);
    const cpuSeconds = Number(shell.cpu_seconds ?? 0);
    const memoryBytes = Number(shell.memory_bytes ?? 0);

    return {
      pid,
      name: shell.name ?? 'unknown',
      cmdline: shell.cmdline ?? '',
      cwd: shell.cwd || inferCwdFromCommandLine(shell.cmdline ?? ''),
      cpu_percent: this.computeCpuPercent(pid, cpuSeconds),
      memory_mb: Math.max(0, Math.round((memoryBytes / 1024 / 1024) * 10) / 10),
      create_time: shell.create_time ?? undefined,
    };
  }

  private computeCpuPercent(pid: number, cpuSeconds: number): number {
    const now = Date.now();
    const previous = this.cpuSamples.get(pid);
    this.cpuSamples.set(pid, { cpuSeconds, at: now });

    if (!previous) {
      return 0;
    }

    const elapsedSeconds = (now - previous.at) / 1000;
    if (elapsedSeconds <= 0) {
      return 0;
    }

    const cpuDelta = Math.max(0, cpuSeconds - previous.cpuSeconds);
    const normalized = (cpuDelta / elapsedSeconds / Math.max(1, cpus().length)) * 100;
    return Math.round(normalized * 10) / 10;
  }

  private ownedWindow(): WtState['windows'][number] | null {
    const sessions = [...this.ownedSessions.values()];
    if (sessions.length === 0) {
      return null;
    }

    return {
      handle: OWNED_WINDOW_HANDLE,
      title: 'cmux Windows owned terminals',
      pid: process.pid,
      panes: sessions.map((session, index) => ({
        id: session.id,
        title: session.title,
        focused: index === 0,
        class_name: 'OwnedTermControl',
        control_type: 'Pane',
        automation_id: `owned:${session.id}`,
        rect: null,
        has_text_pattern: true,
      })),
      shells: sessions.map((session) => ({
        pid: session.process.pid ?? process.pid,
        name: session.command.split(/[\\/]/).pop() || session.command,
        cmdline: session.command,
        cwd: session.cwd,
        cpu_percent: 0,
        memory_mb: 0,
        create_time: session.createdAt,
      })),
    };
  }
}


