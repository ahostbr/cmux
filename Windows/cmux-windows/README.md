# cmux Windows

This is the Windows port scaffold for cmux, forked from the LiteWinTerminal prototype and rebranded as a cmux-owned Electron/Vite workspace app.

## What works

- Electron desktop shell with React 19, Tailwind, and workspace layouts.
- Windows Terminal discovery through UI Automation, plus an owned in-app shell backend for new cmux surfaces.
- Pane listing, buffer reads, focus, input, shortcuts, splits, macros, watchers, scheduler, and action palette.
- cmux-style JSON-lines control server over a Windows named pipe.
- Node CLI aliases exposed as `cmux` and `cmux-windows`.
- Sidebar status/progress/log updates bridged from the CLI into the live renderer.
- In-app browser surface backed by Electron WebView, controllable from the named-pipe protocol and CLI.
- App/debug helpers for activation and window screenshots.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

From the repository root:

```powershell
npm run windows:typecheck
npm run windows:build
npm run windows:smoke
npm run windows:dev
```

## Named-pipe protocol

The app listens on:

```text
\\.\pipe\cmux-windows
```

Override it with `CMUX_WINDOWS_PIPE` or `CMUX_SOCKET_PATH`.

Each request is one JSON object per line:

```json
{"id":"1","method":"surface.list","params":{}}
```

Each response is one JSON object per line:

```json
{"id":"1","ok":true,"result":{"surfaces":[]}}
```

Supported preview methods:

- `ping`
- `capabilities`
- `identify`
- `events.stream`
- `window.list`
- `window.current`
- `window.create`
- `window.focus`
- `window.close`
- `workspace.list`
- `workspace.current`
- `workspace.create`
- `workspace.select`
- `workspace.close`
- `pane.list`
- `pane.create`
- `pane.focus`
- `pane.surfaces`
- `surface.list`
- `surface.focus`
- `surface.send_text`
- `surface.send_key`
- `surface.split`
- `surface.create`
- `surface.close`
- `surface.refresh`
- `surface.trigger_flash`
- `surface.health`
- `app.focus_override.set`
- `app.simulate_active`
- `notification.create`
- `notification.create_for_surface`
- `notification.create_for_target`
- `notification.list`
- `notification.clear`
- `notification.dismiss`
- `notification.mark_read`
- `notification.open`
- `notification.jump_to_unread`
- `right_sidebar.state`
- `right_sidebar.set`
- `right_sidebar.toggle`
- `right_sidebar.status.set`
- `right_sidebar.status.clear`
- `right_sidebar.status.list`
- `right_sidebar.progress.set`
- `right_sidebar.progress.clear`
- `right_sidebar.log.append`
- `right_sidebar.log.clear`
- `right_sidebar.log.list`
- `browser.open_split`
- `browser.navigate`
- `browser.back`
- `browser.forward`
- `browser.reload`
- `browser.url.get`
- `browser.focus_webview`
- `browser.is_webview_focused`
- `browser.snapshot`
- `browser.eval`
- `browser.wait`
- `browser.click`
- `browser.dblclick`
- `browser.hover`
- `browser.focus`
- `browser.type`
- `browser.fill`
- `browser.press`
- `browser.key`
- `browser.scroll`
- `browser.screenshot`
- `browser.get`
- `browser.is`
- `browser.find`
- `debug.app.activate`
- `debug.terminal.read_text`
- `debug.terminal.is_focused`
- `debug.terminal.render_stats`
- `debug.layout`
- `debug.window.screenshot`
- `action.list`
- `action.execute`

## CLI

```powershell
node .\bin\cmux-windows.mjs --help
node .\bin\cmux-windows.mjs ping
node .\bin\cmux-windows.mjs list-surfaces
node .\bin\cmux-windows.mjs send surface:123456:0 "echo hello"
node .\bin\cmux-windows.mjs new-split surface:123456:0 vertical
node .\bin\cmux-windows.mjs surface-health
node .\bin\cmux-windows.mjs notify "Build finished"
node .\bin\cmux-windows.mjs set-status build Build ok
node .\bin\cmux-windows.mjs set-progress port Port 72 100
node .\bin\cmux-windows.mjs log "desktop bridge online"
node .\bin\cmux-windows.mjs open-browser https://github.com/manaflow-ai/cmux
node .\bin\cmux-windows.mjs navigate https://example.com
node .\bin\cmux-windows.mjs browser get-url
node .\bin\cmux-windows.mjs browser snapshot
node .\bin\cmux-windows.mjs browser eval "document.title"
node .\bin\cmux-windows.mjs browser screenshot $env:TEMP\cmux-browser.png
node .\bin\cmux-windows.mjs window-screenshot $env:TEMP\cmux-windows.png
node .\bin\cmux-windows.mjs events
```

The CLI currently prints JSON for scripting parity with cmux v2. It maps common cmux commands such as `list-windows`, `current-window`, `new-window`, `focus-window`, `close-window`, `list-workspaces`, `new-workspace`, `select-workspace`, `close-workspace`, `list-panes`, `list-pane-surfaces`, `list-surfaces`, `list-panels`, `tree`, `send`, `send-panel`, `send-key`, `focus-pane`, `focus-surface`, `close-surface`, `refresh-surfaces`, `surface-health`, `trigger-flash`, `new-split`, `new-pane`, `new-surface`, `read-screen`, notification commands, right-sidebar commands, status/progress/log commands, app-focus test commands, and screenshot capture onto the named-pipe protocol.

Browser command names (`browser`, `open-browser`, `navigate`, `browser-back`, `browser-forward`, `browser-reload`, `get-url`, `focus-webview`, and `is-webview-focused`) target the singleton browser surface in the workspace. The `browser` subcommands also expose first-pass DOM automation for snapshotting, JS evaluation, waiting, element click/type/fill/press/scroll checks, page/element reads, and WebView screenshot capture. The WebView keeps its own persistent Electron partition (`persist:cmux-browser`) so cookies and session state survive renderer reloads.

`npm run windows:smoke` expects a running cmux Windows app and verifies protocol capabilities, sidebar state propagation, browser navigation, URL round-tripping, DOM snapshot/eval automation, browser screenshots, and window screenshot capture against the named pipe.

## Porting direction

This app intentionally does not try to port AppKit, GhosttyKit, or the Swift CLI. The portable contract is cmux's v2 JSON protocol and workspace/surface model. Windows-specific implementation lives here behind named-pipe IPC, an owned in-app shell backend for new surfaces, and Windows Terminal UIA compatibility for already-running external terminals. Future work can replace the owned shell process backend with full ConPTY or Windows Terminal Control rendering without changing the external cmux protocol.
