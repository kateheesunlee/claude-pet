const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const STATE_SCRIPT = path.join(__dirname, 'state.applescript');
const PROBE_SCRIPT = path.join(__dirname, 'probe.applescript');
const PROBE_TREE_SCRIPT = path.join(__dirname, 'probe-tree.applescript');
const ACTIVATE_SCRIPT = path.join(__dirname, 'activate-claude.applescript');

function runScript(scriptPath, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      [scriptPath],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const parts = [];
          if (err.killed) parts.push('killed=true');
          if (err.signal) parts.push('signal=' + err.signal);
          if (err.code !== undefined && err.code !== null) parts.push('code=' + err.code);
          if (stderr && stderr.trim()) parts.push('stderr=' + stderr.trim());
          return reject(new Error(`${err.message} [${parts.join(', ')}]`));
        }
        resolve(stdout.trim());
      }
    );
  });
}

function parseStateOutput(out) {
  // Format: "state=<token>|badge=<text>|err=<message>"
  const m = out.match(/state=([^|]*)\|badge=([^|]*)\|err=(.*)/s);
  if (!m) return { state: 'error', badge: '', err: 'unparseable: ' + out };
  return { state: m[1].trim(), badge: m[2].trim(), err: m[3].trim() };
}

function isPermissionError(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes('not allowed assistive access') ||
    t.includes('-1728') ||
    t.includes('-25211')
  );
}

async function getClaudeState() {
  const t0 = Date.now();
  try {
    const out = await runScript(STATE_SCRIPT, 20000);
    const elapsed = Date.now() - t0;
    if (elapsed > 3000) {
      console.warn(`[detector] slow run: ${elapsed}ms`);
    }
    const parsed = parseStateOutput(out);
    if (isPermissionError(parsed.err)) {
      return { state: 'no-permission', badge: '' };
    }
    if (parsed.state === 'error') {
      console.error('[detector] AppleScript error:', parsed.err);
    }
    return parsed;
  } catch (e) {
    const elapsed = Date.now() - t0;
    if (isPermissionError(e.message)) {
      return { state: 'no-permission', badge: '' };
    }
    console.error(`[detector] runScript threw after ${elapsed}ms:`, e.message);
    return { state: 'error', badge: '', err: e.message };
  }
}

async function probeClaude() {
  const out = await runScript(PROBE_SCRIPT, 15000);
  const file = path.join(os.tmpdir(), `claude-pet-probe-${Date.now()}.txt`);
  fs.writeFileSync(file, out, 'utf8');
  return { output: out, file };
}

async function probeTree() {
  const out = await runScript(PROBE_TREE_SCRIPT, 30000);
  const file = path.join(os.tmpdir(), `claude-pet-tree-${Date.now()}.txt`);
  fs.writeFileSync(file, out, 'utf8');
  return { output: out, file };
}

async function activateClaude() {
  // Use `open -a` (LaunchServices) instead of AppleScript `tell ... to activate`.
  // The latter requires macOS Automation permission (separate from Accessibility)
  // and tends to silently fail. `open` just brings the app to front.
  return new Promise((resolve, reject) => {
    execFile('open', ['-a', 'Claude'], { timeout: 3000 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error((stderr || '').trim() || err.message));
      resolve();
    });
  });
}

module.exports = { getClaudeState, probeClaude, probeTree, activateClaude };
