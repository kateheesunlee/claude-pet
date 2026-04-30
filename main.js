const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
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
  const menu = Menu.buildFromTemplate([
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

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  createWindow();
  buildTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
