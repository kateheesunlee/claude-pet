// Spawns `log stream` to catch macOS notifications addressed to Claude Desktop
// in real time. Much lower latency than polling Claude's sidebar AX tree.
//
// macOS's usernoted daemon logs every notification it processes. We filter to
// lines mentioning Claude's bundle ID. No special permission required — `log`
// streams the current user's logs by default.
const { spawn } = require('child_process');

const BUNDLE_ID = 'com.anthropic.claudefordesktop';
// Debounce: usernoted often emits multiple lines per single notification
// (scheduled → received → presented → posted). Coalesce them.
const DEBOUNCE_MS = 1500;

function startWatcher({ onClaudeNotification, debug = false }) {
  // Broad predicate: any log mentioning Claude's bundle ID. Covers usernoted,
  // NotificationCenter, UserNotificationsCore, etc. Trade-off: may match
  // unrelated lines, but debounce + first-screen warmup smooth that out.
  const predicate = `eventMessage CONTAINS "${BUNDLE_ID}"`;

  const proc = spawn('log', [
    'stream',
    '--predicate', predicate,
    '--info',
    '--style', 'compact',
  ]);

  let lastFireAt = 0;
  let buffer = '';

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      if (debug) console.log('[notif-watcher]', line);
      const now = Date.now();
      if (now - lastFireAt < DEBOUNCE_MS) continue;
      lastFireAt = now;
      onClaudeNotification(line);
    }
  });

  proc.stderr.on('data', (chunk) => {
    console.error('[notif-watcher stderr]', chunk.toString().trim());
  });

  proc.on('exit', (code) => {
    console.log('[notif-watcher] exited with code', code);
  });

  return {
    stop: () => {
      try { proc.kill(); } catch {}
    },
  };
}

module.exports = { startWatcher };
