const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setInteractive: (interactive) => ipcRenderer.send('set-interactive', interactive),
  onForceBother: (cb) => ipcRenderer.on('force-bother', cb),
  onForceSleep: (cb) => ipcRenderer.on('force-sleep', cb),
  onToggleVisibility: (cb) => ipcRenderer.on('toggle-visibility', cb),
  onClaudeCodeStop: (cb) =>
    ipcRenderer.on('claude-code-stop', (_e, payload) => cb(payload)),
  onClaudeCodeNotification: (cb) =>
    ipcRenderer.on('claude-code-notification', (_e, payload) => cb(payload)),
  onClaudeCodePermissionRequest: (cb) =>
    ipcRenderer.on('claude-code-permission-request', (_e, payload) => cb(payload)),
  onClaudeCodePreToolUse: (cb) =>
    ipcRenderer.on('claude-code-pre-tool-use', (_e, payload) => cb(payload)),
  focusClaudeSession: (info) => ipcRenderer.send('focus-claude-session', info),
  startCursorTracking: () => ipcRenderer.send('start-cursor-tracking'),
  stopCursorTracking: () => ipcRenderer.send('stop-cursor-tracking'),
  onCursorPos: (cb) => ipcRenderer.on('cursor-pos', (_e, p) => cb(p)),
});

// Separate surface for the onboarding window — keeps it independent from petAPI
// (the pet window doesn't need this, and the onboarding window doesn't need
// the cursor-tracking / hook callbacks).
contextBridge.exposeInMainWorld('claudePet', {
  onboardingDone: () => ipcRenderer.send('onboarding-done'),
  hooks: {
    check:     (scope) => ipcRenderer.invoke('hooks-check',     scope),
    install:   (scope) => ipcRenderer.invoke('hooks-install',   scope),
    uninstall: (scope) => ipcRenderer.invoke('hooks-uninstall', scope),
  },
});
