const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

// Which app to bring to front when the user clicks the pet to "go to the
// session". By default we focus Claude Desktop (the app the hook most likely
// came from). If CLAUDE_PET_TERMINAL_APP is set (Cursor, iTerm, Terminal,
// Warp, "Visual Studio Code", etc.), we open the session's cwd in that app
// instead — for users who run Claude Code from a terminal/editor.
const TERMINAL_APP = process.env.CLAUDE_PET_TERMINAL_APP || null;

// Claude Desktop notification watcher is currently disconnected — see git
// history for the wiring. Focusing on Claude Code (CLI) hook integration first.

const HOOK_PORT = 47625;

let mainWindow = null;
let tray = null;
let hookServer = null;
let hookServerStatus = 'starting...';
let demoTimerEnabled = false;
let demoTimerHandle = null;
const DEMO_INTERVAL_MS = 30_000;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    type: 'panel',
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setHiddenInMissionControl?.(true);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--dev') && process.env.CLAUDE_PET_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Matches Claude Code's session_id format (RFC 4122 UUID).
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Spacing between the activate / deep-link / re-activate steps. ~120ms is
// empirically enough for the activate's Apple Event to land before the URL
// handler runs, and for the URL handler to settle before we re-foreground.
const FOCUS_STEP_DELAY_MS = 120;

ipcMain.on('focus-claude-session', (_event, info) => {
  // info: { cwd, sessionId } from the most recent hook payload.
  const { cwd, sessionId } = info || {};

  // Terminal/editor mode (CLAUDE_PET_TERMINAL_APP set) — open cwd in that app
  if (TERMINAL_APP) {
    const args = cwd && typeof cwd === 'string'
      ? ['-a', TERMINAL_APP, cwd]
      : ['-a', TERMINAL_APP];
    console.log(`[focus] open ${args.join(' ')}`);
    execFile('open', args, { timeout: 3000 }, (err, _stdout, stderr) => {
      if (err) console.error('[focus] failed:', (stderr || '').trim() || err.message);
    });
    return;
  }

  // Default: bring Claude Desktop to the front, then deep-link the session.
  //
  // ORDER MATTERS. `activateClaudeDesktop()` issues the Apple Events that
  // switch Spaces (incl. fullscreen) and unminimize the Dock-stashed window.
  // Those events MUST land before the URL apple event from
  // `shell.openExternal`, otherwise the URL's own (weak, current-Space)
  // activation races against ours and the cross-fullscreen-Space switch
  // silently loses. ~120ms is enough for the activate to take effect on the
  // systems tested without being perceptibly laggy.
  //
  // Caveat about `claude://resume?session=<uuid>`: Claude Desktop's URL
  // handler imports the CLI session as a `local_<uuid>` sidebar entry. If
  // the user is ALREADY running Claude Code inside Claude Desktop's CC pane
  // for that same session_id, the import coexists with the live entry and
  // the user sees their messages flow in two views of the same JSONL.
  // We're keeping the deep-link anyway because session-precise navigation
  // is more valuable than avoiding the duplicate entry.
  console.log('[focus] activate Claude');
  activateClaudeDesktop();
  if (sessionId && typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId)) {
    const url = `claude://resume?session=${sessionId}`;
    setTimeout(() => {
      console.log(`[focus] openExternal ${url}`);
      shell.openExternal(url).catch((err) => {
        console.error('[focus] openExternal failed:', err?.message || err);
      });
      // Re-activate AFTER the URL settles. In a fullscreen Space the URL
      // handler can silently kick focus back off — observed: deep link
      // delivers (target session is correct on manual open), but the window
      // never came forward. A second activate post-URL pulls it back.
      setTimeout(() => {
        console.log('[focus] re-activate Claude (post deep-link)');
        activateClaudeDesktop();
      }, FOCUS_STEP_DELAY_MS);
    }, FOCUS_STEP_DELAY_MS);
  }
});

// Bring Claude.app fully forward — across Spaces (incl. fullscreen) and out
// of the Dock if minimized — without spawning a fresh instance.
//
// Three mechanisms, because no single one covers every state:
//
//   1. `open -a Claude` — the standard launch/activate path. Handles the
//      ordinary cases (cmd+H hidden, in another non-fullscreen Space).
//
//   2. `osascript "tell <app> to activate"` — Apple Event that makes the
//      WindowServer switch to whichever Space the app's frontmost window is
//      on, INCLUDING a fullscreen Space. `open -a` alone doesn't reliably
//      cross fullscreen Space boundaries.
//
//   3. System Events AX call to clear `AXMinimized` on every Claude window
//      that has it set. The Apple Event scripting suite path
//      (`set miniaturized of windows to false`) returns -10006 because
//      Claude.app doesn't implement that suite (Electron). Going through
//      the accessibility process bypasses the app's missing dictionary —
//      it pokes the windows via the AX layer instead. Requires
//      Accessibility permission for the pet (separate from Automation);
//      first invocation will trigger the system prompt. Wrapped in `try`
//      so a missing permission or a not-yet-running app falls through
//      silently rather than spamming the console.
//
// (We previously tried `open -n -a Claude` to trigger the second-instance
// handler — which DOES call win.restore() — but on some configurations it
// spawned a parallel instance instead. AX is the reliable path.)
const ACTIVATE_APPLESCRIPT =
  'tell application "Claude" to activate\n' +
  'try\n' +
  '  tell application "System Events"\n' +
  '    tell process "Claude"\n' +
  '      set value of attribute "AXMinimized" of (windows whose value of attribute "AXMinimized" is true) to false\n' +
  '    end tell\n' +
  '  end tell\n' +
  'end try';

function activateClaudeDesktop() {
  execFile(
    'open', ['-a', 'Claude'],
    { timeout: 3000 },
    (err, _stdout, stderr) => {
      if (err) console.error('[focus] open -a failed:', (stderr || '').trim() || err.message);
    },
  );
  execFile(
    'osascript', ['-e', ACTIVATE_APPLESCRIPT],
    { timeout: 3000 },
    (err, _stdout, stderr) => {
      if (err) console.error('[focus] activate failed:', (stderr || '').trim() || err.message);
    },
  );
}

ipcMain.on('set-interactive', (_event, interactive) => {
  if (!mainWindow) return;
  if (interactive) {
    mainWindow.setIgnoreMouseEvents(false);
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
});

let cursorPollTimer = null;
ipcMain.on('start-cursor-tracking', () => {
  if (cursorPollTimer) return;
  cursorPollTimer = setInterval(() => {
    if (!mainWindow) return;
    const point = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    mainWindow.webContents.send('cursor-pos', {
      x: point.x - bounds.x,
      y: point.y - bounds.y,
    });
  }, 60);
});
ipcMain.on('stop-cursor-tracking', () => {
  if (cursorPollTimer) clearInterval(cursorPollTimer);
  cursorPollTimer = null;
});

function buildTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle('🐶');
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: `Hook: ${hookServerStatus}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Bother now',
      click: () => mainWindow?.webContents.send('force-bother'),
    },
    {
      label: 'Sleep now',
      click: () => mainWindow?.webContents.send('force-sleep'),
    },
    {
      label: 'Toggle pet',
      click: () => mainWindow?.webContents.send('toggle-visibility'),
    },
    {
      label: demoTimerEnabled ? 'Demo timer: ON (every 30s)' : 'Demo timer: OFF',
      type: 'checkbox',
      checked: demoTimerEnabled,
      click: () => {
        demoTimerEnabled = !demoTimerEnabled;
        if (demoTimerEnabled) startDemoTimer();
        else stopDemoTimer();
        rebuildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function startDemoTimer() {
  if (demoTimerHandle) return;
  demoTimerHandle = setInterval(() => {
    mainWindow?.webContents.send('force-bother');
  }, DEMO_INTERVAL_MS);
}

function stopDemoTimer() {
  if (demoTimerHandle) clearInterval(demoTimerHandle);
  demoTimerHandle = null;
}

function dispatchHook(url, payload, res) {
  // No window means the renderer is gone — caller should retry, or just know
  // it landed in a dropped session.
  if (!mainWindow || mainWindow.isDestroyed()) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end('{"ok":false,"error":"pet window not ready"}');
    return;
  }
  if (url === '/claude-code/stop') {
    console.log('[hook] Stop', payload?.session_id?.slice(0, 8) || '', payload?.cwd || '');
    mainWindow.webContents.send('claude-code-stop', payload);
  } else if (url === '/claude-code/notification') {
    console.log('[hook] Notification', payload?.message || payload?.session_id?.slice(0, 8) || '');
    mainWindow.webContents.send('claude-code-notification', payload);
  } else if (url === '/claude-code/permission-request') {
    console.log('[hook] PermissionRequest', payload?.tool_name || payload?.session_id?.slice(0, 8) || '');
    mainWindow.webContents.send('claude-code-permission-request', payload);
  } else if (url === '/claude-code/pre-tool-use') {
    // PreToolUse is used as a "Claude is still working" heartbeat — the
    // renderer uses it to cancel a pending urgent that turned out to be
    // auto-approved. We don't log it to keep the console clean.
    mainWindow.webContents.send('claude-code-pre-tool-use', payload);
  } else {
    res.writeHead(404); res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"ok":true}');
}

function startHookServer() {
  hookServer = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405); res.end(); return;
    }
    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      body += chunk;
      if (body.length > 1_000_000) {
        aborted = true;
        res.writeHead(413); res.end();
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) return;
      let payload = null;
      if (body.trim()) {
        try { payload = JSON.parse(body); } catch { payload = { raw: body.slice(0, 200) }; }
      }
      dispatchHook(req.url || '', payload, res);
    });
  });

  hookServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      hookServerStatus = `port ${HOOK_PORT} in use`;
      console.error(`[hook] port ${HOOK_PORT} already in use — Claude Code hooks will not reach the pet`);
    } else {
      hookServerStatus = `error: ${err.message}`;
      console.error('[hook] server error:', err.message);
    }
    rebuildTrayMenu();
  });

  hookServer.listen(HOOK_PORT, '127.0.0.1', () => {
    hookServerStatus = `listening on :${HOOK_PORT}`;
    console.log(`[hook] listening on http://127.0.0.1:${HOOK_PORT}`);
    rebuildTrayMenu();
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  createWindow();
  buildTray();
  startHookServer();
});

app.on('before-quit', () => {
  hookServer?.close();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
