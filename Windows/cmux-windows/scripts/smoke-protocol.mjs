#!/usr/bin/env node
import net from 'node:net';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pipe = process.env.CMUX_WINDOWS_PIPE || process.env.CMUX_SOCKET_PATH || process.env.CMUX_SOCKET || '\\\\.\\pipe\\cmux-windows';

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipe);
    let buffer = '';

    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ id: method, method, params })}\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          socket.end();
          resolve(JSON.parse(line));
          return;
        }
        newline = buffer.indexOf('\n');
      }
    });

    socket.on('error', (error) => {
      reject(new Error(`could not connect to ${pipe}: ${error.message}`));
    });
  });
}

function assertOk(response, label) {
  if (!response?.ok) {
    throw new Error(`${label} failed: ${JSON.stringify(response)}`);
  }
  return response.result;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const capabilities = assertOk(await call('capabilities'), 'capabilities');
  for (const method of ['surface.list', 'right_sidebar.status.set', 'browser.open_split', 'browser.snapshot', 'browser.eval', 'browser.screenshot', 'debug.window.screenshot']) {
    if (!capabilities.methods.includes(method)) {
      throw new Error(`missing capability: ${method}`);
    }
  }

  assertOk(await call('right_sidebar.status.set', { id: 'smoke', label: 'Smoke', value: 'ok' }), 'status.set');
  const statuses = assertOk(await call('right_sidebar.status.list'), 'status.list');
  if (!statuses.statuses.some((status) => status.id === 'smoke' && status.value === 'ok')) {
    throw new Error(`status was not reflected in sidebar state: ${JSON.stringify(statuses)}`);
  }

  const browser = assertOk(await call('browser.open_split', { url: 'https://example.com' }), 'browser.open_split');
  if (browser.state.url !== 'https://example.com/') {
    throw new Error(`browser URL was not normalized: ${JSON.stringify(browser)}`);
  }

  const urlState = assertOk(await call('browser.url.get'), 'browser.url.get');
  if (urlState.url !== 'https://example.com/') {
    throw new Error(`browser URL did not round-trip: ${JSON.stringify(urlState)}`);
  }

  assertOk(await call('browser.wait', { state: 'load', timeout_ms: 10000 }), 'browser.wait');
  const browserEval = assertOk(await call('browser.eval', { code: 'document.title' }), 'browser.eval');
  if (typeof browserEval.value !== 'string' || !browserEval.value.toLowerCase().includes('example')) {
    throw new Error(`browser eval did not read the page title: ${JSON.stringify(browserEval)}`);
  }
  const browserSnapshot = assertOk(await call('browser.snapshot', { max_chars: 5000 }), 'browser.snapshot');
  if (!browserSnapshot.snapshot?.text?.includes('Example Domain')) {
    throw new Error(`browser snapshot did not include page text: ${JSON.stringify(browserSnapshot)}`);
  }
  const browserScreenshot = assertOk(await call('browser.screenshot'), 'browser.screenshot');
  if (browserScreenshot.mime_type !== 'image/png' || typeof browserScreenshot.data_base64 !== 'string' || browserScreenshot.data_base64.length < 1000) {
    throw new Error('browser screenshot response was not a PNG payload');
  }

  const owned = assertOk(await call('surface.create'), 'surface.create');
  assertOk(await call('surface.send_text', { surface_id: owned.surface_id, text: 'echo owned-smoke{ENTER}' }), 'surface.send_text owned');
  await delay(1000);
  const ownedRead = assertOk(await call('debug.terminal.read_text', { surface_id: owned.surface_id }), 'debug.terminal.read_text owned');
  if (!ownedRead.text?.includes('owned-smoke')) {
    throw new Error(`owned terminal did not echo input: ${JSON.stringify(ownedRead)}`);
  }

  const screenshot = assertOk(await call('debug.window.screenshot'), 'debug.window.screenshot');
  if (screenshot.mime_type !== 'image/png' || typeof screenshot.data_base64 !== 'string' || screenshot.data_base64.length < 1000) {
    throw new Error('screenshot response was not a PNG payload');
  }
  const screenshotPath = join(tmpdir(), 'cmux-windows-smoke.png');
  await writeFile(screenshotPath, Buffer.from(screenshot.data_base64, 'base64'));

  console.log(JSON.stringify({
    ok: true,
    pipe,
    methods: capabilities.methods.length,
    browser_url: urlState.url,
    browser_title: browserEval.value,
    owned_surface: owned.surface_id,
    screenshot_path: screenshotPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
