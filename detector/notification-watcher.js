// Spawns `log stream` to catch macOS notifications addressed to Claude Desktop
// in real time.
//
// Strategy:
//   1. Broad predicate at OS level: any log line mentioning Claude's bundle id.
//      `log` cannot do complex regex, so we keep this loose and refine in JS.
//   2. JS-level filter to only lines that mean "notification was actually
//      delivered to the user" (DELIVERED / posting / Banner). This rejects
//      lifecycle/internal noise, dismissals, schedule events.
//   3. Best-effort title/body extraction from NCNotificationContent log strings.
//   4. Auto-restart if `log stream` dies (it can — system sleep, process kill).
//   5. Built-in warmup: ignore first ~1.5s of events (initial drain).
//   6. Bounded buffer.
//   7. SIGTERM → SIGKILL fallback on stop.

const { spawn } = require('child_process');

const BUNDLE_ID = 'com.anthropic.claudefordesktop';

const DEBOUNCE_MS = 1500;          // coalesce multi-line bursts per single notification
const RESTART_DELAY_MS = 2000;     // backoff before respawn after unexpected exit
const STOP_TIMEOUT_MS = 800;       // SIGTERM grace before SIGKILL
const WARMUP_MS = 1500;            // ignore initial buffered events
const MAX_BUFFER = 1 << 20;        // 1 MiB stdout backlog cap

// JS-level filter: only fire on lines that indicate the notification was
// actually presented to the user.
//
// Markers are chosen to require explicit notification context. Bare words like
// "delivered" or "Banner" are too generic — they match unrelated lines such as
// ControlCenter's runningboard updates ("Update delivered for [app<...>]"),
// which fired false positives.
const DELIVERY_MARKERS = [
  'DELIVERED notification',     // UserNotificationsCore: "DELIVERED notification request"
  'NCNotificationContent',      // content struct dump (carries title/body)
  'NCNotificationRequest',      // dispatch object
  'posting alert',              // usernoted alert path
  'posting banner',             // usernoted banner path
];

// Subsystems that mention Claude's bundle id but are NOT about user-facing
// notifications. Hard-block these regardless of marker matches.
const SUBSYSTEM_BLOCKLIST = [
  'runningboard',     // process-lifecycle assertions / "Update delivered"
  'launchservices',   // app launch / activation events
];

function shouldFire(line) {
  for (const blocked of SUBSYSTEM_BLOCKLIST) {
    if (line.indexOf(blocked) !== -1) return false;
  }
  for (const m of DELIVERY_MARKERS) {
    if (line.indexOf(m) !== -1) return true;
  }
  return false;
}

function parseContent(line) {
  // Best-effort. NCNotificationContent dump looks like:
  //   ... title="Claude" subtitle="..." body="...">
  // Apple may change quoting/escaping; treat absence as fine.
  const t = line.match(/title="([^"]*)"/);
  const s = line.match(/subtitle="([^"]*)"/);
  const b = line.match(/body="([^"]*)"/);
  const out = {};
  if (t) out.title = t[1];
  if (s) out.subtitle = s[1];
  if (b) out.body = b[1];
  return Object.keys(out).length ? out : null;
}

function startWatcher({
  onClaudeNotification,
  debug = false,
  debounceMs = DEBOUNCE_MS,
} = {}) {
  let proc = null;
  let stopped = false;
  let lastFireAt = 0;
  let warmupUntil = 0;
  let restartTimer = null;

  const log = debug ? (...a) => console.log('[notif-watcher]', ...a) : () => {};

  const spawnOnce = () => {
    if (stopped) return;
    warmupUntil = Date.now() + WARMUP_MS;

    const predicate = `eventMessage CONTAINS "${BUNDLE_ID}"`;
    log('spawning log stream');
    proc = spawn('log', [
      'stream',
      '--predicate', predicate,
      '--info',
      '--style', 'compact',
    ]);

    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > MAX_BUFFER) {
        // Keep only the trailing window — better to drop history than OOM.
        buffer = buffer.slice(-MAX_BUFFER);
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        log('line:', line.slice(0, 160));

        const now = Date.now();
        if (now < warmupUntil) {
          log('  (warmup) skipped');
          continue;
        }
        if (!shouldFire(line)) {
          log('  (filtered: no marker or blocked subsystem) skipped');
          continue;
        }
        if (now - lastFireAt < debounceMs) {
          log('  (debounced) skipped');
          continue;
        }
        lastFireAt = now;
        const content = parseContent(line);
        log('  → fire', content ?? '(no content parsed)');
        try {
          onClaudeNotification({ raw: line, ...(content || {}) });
        } catch (e) {
          console.error('[notif-watcher] callback threw:', e);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error('[notif-watcher stderr]', text);
    });

    proc.on('exit', (code, signal) => {
      log('log stream exited', { code, signal });
      proc = null;
      if (!stopped) {
        restartTimer = setTimeout(spawnOnce, RESTART_DELAY_MS);
      }
    });

    proc.on('error', (err) => {
      console.error('[notif-watcher] spawn error:', err.message);
    });
  };

  spawnOnce();

  return {
    stop: () => {
      stopped = true;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      const p = proc;
      proc = null;
      if (!p) return;
      try { p.kill('SIGTERM'); } catch {}
      const killTimer = setTimeout(() => {
        try { p.kill('SIGKILL'); } catch {}
      }, STOP_TIMEOUT_MS);
      // Don't keep Node alive solely for the kill timer.
      if (killTimer.unref) killTimer.unref();
    },
  };
}

module.exports = { startWatcher };
