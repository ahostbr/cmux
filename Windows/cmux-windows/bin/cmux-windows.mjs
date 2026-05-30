#!/usr/bin/env node
import net from 'node:net';
import { writeFile } from 'node:fs/promises';

let pipe = process.env.CMUX_WINDOWS_PIPE || process.env.CMUX_SOCKET_PATH || process.env.CMUX_SOCKET || '\\\\.\\pipe\\cmux-windows';
const args = [];

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === '--socket') {
    const value = process.argv[index + 1];
    if (!value) {
      console.error('--socket requires a value');
      process.exit(1);
    }
    pipe = value;
    index += 1;
    continue;
  }
  if (arg === '--password' || arg === '--id-format' || arg === '--window') {
    index += 1;
    continue;
  }
  if (arg === '--json' || arg === '--no-focus') {
    continue;
  }
  args.push(arg);
}

function usage() {
  return [
    'cmux-windows [--socket <pipe>] <command> [args]',
    '',
    'Commands:',
    '  ping',
    '  capabilities',
    '  identify',
    '  version',
    '  rpc <method> [json-params]',
    '  events',
    '  list-windows',
    '  current-window',
    '  focus-window <window_id>',
    '  close-window <window_id>',
    '  list-workspaces',
    '  current-workspace',
    '  new-window [cwd]',
    '  select-workspace <workspace_id>',
    '  close-workspace <workspace_id>',
    '  list-panes',
    '  list-pane-surfaces <pane_id>',
    '  list-panels',
    '  list-surfaces',
    '  tree',
    '  read-screen [surface_id]',
    '  send [surface_id] <text>',
    '  send-panel [surface_id] <text>',
    '  send-key [surface_id] <key>',
    '  send-key-panel [surface_id] <key>',
    '  focus-pane <pane_id>',
    '  focus-surface <surface_id>',
    '  close-surface <surface_id>',
    '  refresh-surfaces',
    '  surface-health',
    '  trigger-flash [surface_id] [message]',
    '  new-split [surface_id] [vertical|horizontal]',
    '  new-pane [surface_id] [vertical|horizontal]',
    '  new-surface [cwd]',
    '  new-workspace [cwd]',
    '  notify <message>',
    '  list-notifications',
    '  dismiss-notification <id>|--all-read',
    '  mark-notification-read <id>|--all',
    '  open-notification <id>',
    '  jump-to-unread',
    '  clear-notifications',
    '  right-sidebar <toggle|show|hide|mode|focus|set|files|find|vault|sessions|feed|dock>',
    '  sidebar-state',
    '  set-status <id> <label> [value]',
    '  clear-status [id]',
    '  list-status',
    '  set-progress <id> <label> <value> [total]',
    '  clear-progress [id]',
    '  log <message>',
    '  clear-log',
    '  list-log',
    '  set-app-focus <true|false>',
    '  simulate-app-active',
    '  debug-app-activate',
    '  window-screenshot [path]',
    '  browser <open|navigate|back|forward|reload|get-url|snapshot|eval|wait|click|type|fill|press|screenshot|get|is|find|cookies|storage|highlight>',
    '',
    `Pipe: ${pipe}`,
  ].join('\n');
}

function parseJson(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid JSON params: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseBoolean(raw, label) {
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new Error(`${label} must be true or false`);
}

function helpResult(command) {
  const usageByCommand = {
    'right-sidebar': 'Usage: cmux right-sidebar <command> [flags]',
    'set-status': 'Usage: cmux set-status <id> <label> [value]',
    'clear-status': 'Usage: cmux clear-status [id]',
    'list-status': 'Usage: cmux list-status',
    'set-progress': 'Usage: cmux set-progress <id> <label> <value> [total]',
    'clear-progress': 'Usage: cmux clear-progress [id]',
    'log': 'Usage: cmux log <message>',
    'clear-log': 'Usage: cmux clear-log',
    'list-log': 'Usage: cmux list-log',
    'sidebar-state': 'Usage: cmux sidebar-state',
    'set-app-focus': 'Usage: cmux set-app-focus <true|false>',
    'simulate-app-active': 'Usage: cmux simulate-app-active',
    'browser': 'Usage: cmux browser <command> [args]',
  };
  return { local: true, result: { usage: usageByCommand[command] ?? usage() } };
}

function requestFor(argv) {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return null;
    case '--version':
    case '-v':
    case 'version':
      return { local: true, result: { app: 'cmux Windows', version: '0.1.0' } };
    case 'ping':
      return { method: 'ping', params: {} };
    case 'capabilities':
      return { method: 'capabilities', params: {} };
    case 'identify':
      return { method: 'identify', params: {} };
    case 'events':
      return { method: 'events.stream', params: {}, stream: true };
    case 'rpc':
      if (!rest[0]) throw new Error('rpc requires a method');
      return { method: rest[0], params: parseJson(rest[1] ?? '{}') };
    case 'list-windows':
      return { method: 'window.list', params: {} };
    case 'current-window':
      return { method: 'window.current', params: {} };
    case 'focus-window':
      if (!rest[0]) throw new Error('focus-window requires a window id');
      return { method: 'window.focus', params: { window_id: rest[0] } };
    case 'close-window':
      if (!rest[0]) throw new Error('close-window requires a window id');
      return { method: 'window.close', params: { window_id: rest[0] } };
    case 'list-workspaces':
      return { method: 'workspace.list', params: {} };
    case 'current-workspace':
      return { method: 'workspace.current', params: {} };
    case 'new-window':
      return { method: 'window.create', params: rest[0] ? { cwd: rest[0] } : {} };
    case 'select-workspace':
      if (!rest[0]) throw new Error('select-workspace requires a workspace id');
      return { method: 'workspace.select', params: { workspace_id: rest[0] } };
    case 'close-workspace':
      if (!rest[0]) throw new Error('close-workspace requires a workspace id');
      return { method: 'workspace.close', params: { workspace_id: rest[0] } };
    case 'list-panes':
      return { method: 'pane.list', params: {} };
    case 'list-pane-surfaces':
      if (!rest[0]) throw new Error('list-pane-surfaces requires a pane id');
      return { method: 'pane.surfaces', params: { pane_id: rest[0] } };
    case 'list-surfaces':
    case 'list-panels':
      return { method: 'surface.list', params: {} };
    case 'tree':
      return { method: 'debug.layout', params: {} };
    case 'read-screen':
      return { method: 'debug.terminal.read_text', params: rest[0] ? { surface_id: rest[0] } : {} };
    case 'send':
    case 'send-panel': {
      if (rest.length === 0) throw new Error('send requires text');
      const first = rest[0];
      const hasSurface = first.startsWith('surface:');
      return {
        method: 'surface.send_text',
        params: hasSurface
          ? { surface_id: first, text: rest.slice(1).join(' ') }
          : { text: rest.join(' ') },
      };
    }
    case 'send-key':
    case 'send-key-panel': {
      if (rest.length === 0) throw new Error('send-key requires a key');
      const first = rest[0];
      const hasSurface = first.startsWith('surface:');
      return {
        method: 'surface.send_key',
        params: hasSurface
          ? { surface_id: first, key: rest.slice(1).join(' ') }
          : { key: rest.join(' ') },
      };
    }
    case 'focus-pane':
      if (!rest[0]) throw new Error('focus-pane requires a pane id');
      return { method: 'pane.focus', params: { pane_id: rest[0] } };
    case 'focus-surface':
    case 'focus-panel':
      if (!rest[0]) throw new Error(`${command} requires a surface id`);
      return { method: 'surface.focus', params: { surface_id: rest[0] } };
    case 'close-surface':
      if (!rest[0]) throw new Error('close-surface requires a surface id');
      return { method: 'surface.close', params: { surface_id: rest[0] } };
    case 'refresh-surfaces':
      return { method: 'surface.refresh', params: {} };
    case 'surface-health':
    case 'debug-terminals':
    case 'top':
      return { method: 'surface.health', params: {} };
    case 'trigger-flash': {
      const surface = rest.find((value) => value.startsWith('surface:'));
      const message = rest.filter((value) => value !== surface).join(' ');
      return {
        method: 'surface.trigger_flash',
        params: { ...(surface ? { surface_id: surface } : {}), ...(message ? { message } : {}) },
      };
    }
    case 'new-split': {
      const surface = rest.find((value) => value.startsWith('surface:'));
      const direction = rest.find((value) => value === 'horizontal' || value === 'vertical') ?? 'vertical';
      return { method: 'surface.split', params: { ...(surface ? { surface_id: surface } : {}), direction } };
    }
    case 'new-pane': {
      const surface = rest.find((value) => value.startsWith('surface:'));
      const direction = rest.find((value) => value === 'horizontal' || value === 'vertical') ?? 'vertical';
      return { method: 'pane.create', params: { ...(surface ? { surface_id: surface } : {}), direction } };
    }
    case 'new-surface':
      return { method: 'surface.create', params: rest[0] ? { cwd: rest[0] } : {} };
    case 'new-workspace':
      return { method: 'workspace.create', params: rest[0] ? { cwd: rest[0] } : {} };
    case 'notify':
      if (rest.length === 0) throw new Error('notify requires a message');
      return { method: 'notification.create', params: { message: rest.join(' ') } };
    case 'list-notifications':
      return { method: 'notification.list', params: {} };
    case 'dismiss-notification':
      if (rest[0] === '--all-read') return { method: 'notification.dismiss', params: { all_read: true } };
      if (!rest[0]) throw new Error('dismiss-notification requires a notification id or --all-read');
      return { method: 'notification.dismiss', params: { notification_id: rest[0] } };
    case 'mark-notification-read':
      if (rest[0] === '--all') return { method: 'notification.mark_read', params: { all: true } };
      if (!rest[0]) throw new Error('mark-notification-read requires a notification id or --all');
      return { method: 'notification.mark_read', params: { notification_id: rest[0] } };
    case 'open-notification':
      if (!rest[0]) throw new Error('open-notification requires a notification id');
      return { method: 'notification.open', params: { notification_id: rest[0] } };
    case 'jump-to-unread':
      return { method: 'notification.jump_to_unread', params: {} };
    case 'clear-notifications':
      return { method: 'notification.clear', params: rest[0] ? { notification_id: rest[0] } : {} };
    case 'right-sidebar': {
      const subcommand = rest[0] ?? 'mode';
      if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') return helpResult('right-sidebar');
      if (subcommand === 'toggle') return { method: 'right_sidebar.toggle', params: {} };
      if (subcommand === 'show') return { method: 'right_sidebar.set', params: { visible: true } };
      if (subcommand === 'hide') return { method: 'right_sidebar.set', params: { visible: false } };
      if (subcommand === 'mode') return { method: 'right_sidebar.state', params: {} };
      if (subcommand === 'focus') return { method: 'right_sidebar.set', params: { visible: true } };
      if (subcommand === 'set') return { method: 'right_sidebar.set', params: { mode: rest[1] ?? 'sessions', visible: true } };
      if (['files', 'find', 'vault', 'sessions', 'feed', 'dock'].includes(subcommand)) {
        return { method: 'right_sidebar.set', params: { mode: subcommand, visible: true } };
      }
      throw new Error(`unknown right-sidebar subcommand: ${subcommand}`);
    }
    case 'sidebar-state':
      return { method: 'right_sidebar.state', params: {} };
    case 'set-status':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('set-status');
      if (!rest[0] || !rest[1]) throw new Error('set-status requires id and label');
      return { method: 'right_sidebar.status.set', params: { id: rest[0], label: rest[1], ...(rest[2] ? { value: rest.slice(2).join(' ') } : {}) } };
    case 'clear-status':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('clear-status');
      return { method: 'right_sidebar.status.clear', params: rest[0] ? { id: rest[0] } : {} };
    case 'list-status':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('list-status');
      return { method: 'right_sidebar.status.list', params: {} };
    case 'set-progress':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('set-progress');
      if (!rest[0] || !rest[1] || !rest[2]) throw new Error('set-progress requires id, label, and value');
      return {
        method: 'right_sidebar.progress.set',
        params: {
          id: rest[0],
          label: rest[1],
          value: Number(rest[2]),
          ...(rest[3] ? { total: Number(rest[3]) } : {}),
        },
      };
    case 'clear-progress':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('clear-progress');
      return { method: 'right_sidebar.progress.clear', params: rest[0] ? { id: rest[0] } : {} };
    case 'log':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('log');
      if (rest.length === 0) throw new Error('log requires a message');
      return { method: 'right_sidebar.log.append', params: { message: rest.join(' ') } };
    case 'clear-log':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('clear-log');
      return { method: 'right_sidebar.log.clear', params: {} };
    case 'list-log':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('list-log');
      return { method: 'right_sidebar.log.list', params: {} };
    case 'set-app-focus':
      if (rest[0] === '--help' || rest[0] === '-h') return helpResult('set-app-focus');
      if (!rest[0]) throw new Error('set-app-focus requires true or false');
      return { method: 'app.focus_override.set', params: { focused: parseBoolean(rest[0], 'set-app-focus') } };
    case 'simulate-app-active':
      return { method: 'app.simulate_active', params: {} };
    case 'debug-app-activate':
      return { method: 'debug.app.activate', params: {} };
    case 'window-screenshot':
      return { method: 'debug.window.screenshot', params: {}, saveScreenshot: rest[0] };
    case 'browser': {
      const subcommand = rest[0];
      if (!subcommand || subcommand === '--help' || subcommand === '-h' || subcommand === 'help') return helpResult('browser');
      if (subcommand === 'snapshot') return { method: 'browser.snapshot', params: {} };
      if (subcommand === 'eval') {
        if (!rest[1]) throw new Error('browser eval requires JavaScript');
        return { method: 'browser.eval', params: { code: rest.slice(1).join(' ') } };
      }
      if (subcommand === 'wait') {
        const mode = rest[1] ?? 'load';
        const value = rest.slice(2).join(' ');
        if (mode === 'load') return { method: 'browser.wait', params: { state: 'load' } };
        if (['selector', 'text', 'url', 'predicate'].includes(mode)) {
          if (!value) throw new Error(`browser wait ${mode} requires a value`);
          return { method: 'browser.wait', params: { [mode]: value } };
        }
        return { method: 'browser.wait', params: { selector: rest.slice(1).join(' ') } };
      }
      if (['click', 'dblclick', 'hover', 'focus', 'check', 'uncheck', 'scroll-into-view', 'highlight'].includes(subcommand)) {
        if (!rest[1]) throw new Error(`browser ${subcommand} requires a selector`);
        return { method: `browser.${subcommand.replaceAll('-', '_')}`, params: { selector: rest.slice(1).join(' ') } };
      }
      if (['type', 'fill'].includes(subcommand)) {
        if (!rest[1] || !rest[2]) throw new Error(`browser ${subcommand} requires selector and text`);
        return { method: `browser.${subcommand}`, params: { selector: rest[1], text: rest.slice(2).join(' ') } };
      }
      if (subcommand === 'press' || subcommand === 'key') {
        if (!rest[1]) throw new Error(`browser ${subcommand} requires a key`);
        return { method: `browser.${subcommand}`, params: { key: rest.slice(1).join(' ') } };
      }
      if (subcommand === 'select') {
        if (!rest[1] || !rest[2]) throw new Error('browser select requires selector and value');
        return { method: 'browser.select', params: { selector: rest[1], value: rest.slice(2).join(' ') } };
      }
      if (subcommand === 'scroll') {
        const first = rest[1];
        if (first && /^-?\d+$/.test(first)) {
          return { method: 'browser.scroll', params: { x: Number(first), y: Number(rest[2] ?? 600) } };
        }
        return { method: 'browser.scroll', params: { ...(first ? { selector: first } : {}), y: Number(rest[2] ?? 600) } };
      }
      if (subcommand === 'screenshot') return { method: 'browser.screenshot', params: {}, saveScreenshot: rest[1] };
      if (subcommand === 'get') {
        const kind = rest[1] ?? 'text';
        return { method: 'browser.get', params: { kind, ...(rest[2] ? { selector: rest[2] } : {}), ...(rest[3] ? { attr: rest[3] } : {}) } };
      }
      if (subcommand === 'is') {
        if (!rest[1] || !rest[2]) throw new Error('browser is requires a state and selector');
        return { method: 'browser.is', params: { kind: rest[1], selector: rest.slice(2).join(' ') } };
      }
      if (subcommand === 'find') {
        if (rest[1] === '--text') return { method: 'browser.find', params: { text: rest.slice(2).join(' ') } };
        return { method: 'browser.find', params: rest[1] ? { selector: rest.slice(1).join(' ') } : {} };
      }
      if (subcommand === 'cookies') {
        const action = rest[1] ?? 'get';
        return { method: 'browser.cookies', params: { action, ...(rest[2] ? { name: rest[2] } : {}), ...(rest[3] ? { value: rest.slice(3).join(' ') } : {}) } };
      }
      if (subcommand === 'storage') {
        const action = rest[1] ?? 'get';
        return { method: 'browser.storage', params: { action, ...(rest[2] ? { key: rest[2] } : {}), ...(rest[3] ? { value: rest.slice(3).join(' ') } : {}) } };
      }
      if (subcommand === 'addscript' || subcommand === 'addinitscript') {
        if (!rest[1]) throw new Error(`browser ${subcommand} requires JavaScript`);
        return { method: `browser.${subcommand}`, params: { code: rest.slice(1).join(' ') } };
      }
      if (subcommand === 'addstyle') {
        if (!rest[1]) throw new Error('browser addstyle requires CSS');
        return { method: 'browser.addstyle', params: { css: rest.slice(1).join(' ') } };
      }
      if (subcommand === 'identify') return { method: 'browser.identify', params: {} };
      const browserMethods = {
        open: 'browser.open_split',
        'open-split': 'browser.open_split',
        new: 'browser.open_split',
        navigate: 'browser.navigate',
        goto: 'browser.navigate',
        back: 'browser.back',
        forward: 'browser.forward',
        reload: 'browser.reload',
        url: 'browser.url.get',
        'get-url': 'browser.url.get',
        'focus-webview': 'browser.focus_webview',
        'is-webview-focused': 'browser.is_webview_focused',
      };
      const method = browserMethods[subcommand];
      if (!method) throw new Error(`unknown browser subcommand: ${subcommand}`);
      return { method, params: rest[1] ? { url: rest[1] } : {} };
    }
    case 'open-browser':
      return { method: 'browser.open_split', params: rest[0] ? { url: rest[0] } : {} };
    case 'navigate':
      if (!rest[0]) throw new Error('navigate requires a URL');
      return { method: 'browser.navigate', params: { url: rest[0] } };
    case 'browser-back':
      return { method: 'browser.back', params: {} };
    case 'browser-forward':
      return { method: 'browser.forward', params: {} };
    case 'browser-reload':
      return { method: 'browser.reload', params: {} };
    case 'get-url':
      return { method: 'browser.url.get', params: {} };
    case 'focus-webview':
      return { method: 'browser.focus_webview', params: {} };
    case 'is-webview-focused':
      return { method: 'browser.is_webview_focused', params: {} };
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

function call(request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipe);
    let buffer = '';

    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ id: 'cli', method: request.method, params: request.params })}\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const message = JSON.parse(line);
          if (request.stream) {
            process.stdout.write(`${JSON.stringify(message)}\n`);
          } else {
            socket.end();
            resolve(message);
            return;
          }
        }
        newline = buffer.indexOf('\n');
      }
    });

    socket.on('error', (error) => {
      reject(new Error(`could not connect to ${pipe}: ${error.message}`));
    });

    socket.on('close', () => {
      if (request.stream) {
        resolve(null);
      }
    });
  });
}

try {
  const request = requestFor(args);
  if (!request) {
    console.log(usage());
    process.exit(0);
  }
  if (request.local) {
    console.log(JSON.stringify({ id: 'cli', ok: true, result: request.result }, null, 2));
    process.exit(0);
  }
  const response = await call(request);
  if (response) {
    if (request.saveScreenshot && response.ok !== false && response.result?.data_base64) {
      await writeFile(request.saveScreenshot, Buffer.from(response.result.data_base64, 'base64'));
      response.result.path = request.saveScreenshot;
      delete response.result.data_base64;
    }
    console.log(JSON.stringify(response, null, 2));
    if (response.ok === false) process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error(usage());
  process.exit(1);
}
