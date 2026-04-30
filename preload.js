const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setInteractive: (interactive) => ipcRenderer.send('set-interactive', interactive),
  onForceBother: (cb) => ipcRenderer.on('force-bother', cb),
  onForceSleep: (cb) => ipcRenderer.on('force-sleep', cb),
  onToggleVisibility: (cb) => ipcRenderer.on('toggle-visibility', cb),
  startCursorTracking: () => ipcRenderer.send('start-cursor-tracking'),
  stopCursorTracking: () => ipcRenderer.send('stop-cursor-tracking'),
  onCursorPos: (cb) => ipcRenderer.on('cursor-pos', (_e, p) => cb(p)),
});
