const pet = document.getElementById('pet');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');

const BOTHER_DURATION_MS = 8_000;
const URGENT_SAFETY_MS = 10 * 60 * 1000;  // urgent auto-clears after this if untouched
const SLEEP_AFTER_MS = 5 * 60 * 1000;
let sleepTimer = null;
let isUrgent = false;

const BOTHER_LINES = [
  '야! 놀아줘 🐾',
  '멍멍! 여기 좀 봐!',
  '심심해... 놀아줘',
  '아직이야...?',
  '왈! 왈! 왈!',
];

let state = 'idle';
let endBotherTimer = null;
let bubbleTimer = null;

// Petting detection — back-and-forth strokes (3 horizontal direction reversals).
// Strict on purpose: a click or a single hover-glide must not flip the dog.
const STROKE_MIN_PX = 10;             // a stroke must be at least this long to count
const REVERSALS_NEEDED = 3;           // direction reversals to enter petting
const RESET_INACTIVITY_MS = 800;      // wipe stroke counter after this idle gap
const PETTING_HOLD_MS = 600;          // exit petting if no movement for this long
let lastMouseX = null;
let lastMouseY = null;
let lastDir = null;                   // 'left' | 'right' | null
let strokeLen = 0;                    // px accumulated in current direction
let reversalCount = 0;
let strokeResetTimer = null;
let pettingHoldTimer = null;

// Walk-toward-cursor (bother mode)
const PET_W = 140;
const PET_H = 140;
const WALK_SPEED = 4.5;               // px per frame (~270 px/sec at 60fps)
const ARRIVE_DISTANCE = 90;           // stop within this many px of cursor
let petX = 0;
let petY = 0;
let targetX = null;
let targetY = null;
let walkRAF = null;

// Drag-to-move-home
const DRAG_THRESHOLD = 5;             // px before mousedown becomes a drag (vs click)
const HOME_STORAGE_KEY = 'claudePetHome';
let isDragging = false;
let dragStartX = null;
let dragStartY = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let suppressNextClick = false;
let homeX = null;                     // null = use CSS default (bottom-right corner)
let homeY = null;

function setState(next) {
  pet.classList.remove(`state-${state}`);
  state = next;
  pet.classList.add(`state-${state}`);
}

function resetSleepTimer() {
  if (state === 'sleeping') wakeUp();
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (state === 'idle') goToSleep();
  }, SLEEP_AFTER_MS);
}

function goToSleep() {
  if (state !== 'idle') return;
  setState('sleeping');
  bubble.classList.add('hidden');
}

function wakeUp() {
  if (state !== 'sleeping') return;
  setState('idle');
  showBubble(pickLine(['음...?', '어어!', '하암... 🐶']), 1500, 'happy');
}

function forceSleep() {
  if (state === 'sleeping') return;
  if (state === 'bother') stopBother();
  if (state === 'petted') stopPetting(true);
  clearTimeout(sleepTimer);
  sleepTimer = null;
  setState('sleeping');
  bubble.classList.add('hidden');
}

const BUBBLE_TONES = ['default', 'success', 'info', 'urgent', 'happy'];
function showBubble(text, durationMs = 2500, tone = 'default') {
  clearTimeout(bubbleTimer);
  bubbleText.textContent = text;
  // Reset tone classes, then apply the chosen one. 'default' = no class (coral).
  for (const t of BUBBLE_TONES) bubble.classList.remove(`tone-${t}`);
  if (tone !== 'default') bubble.classList.add(`tone-${tone}`);
  bubble.classList.remove('hidden');
  bubbleTimer = setTimeout(() => {
    bubble.classList.add('hidden');
  }, durationMs);
}

function pickLine(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

function startBother(customMessage = null, urgent = false, tone = null) {
  // Default tone: urgent → red, else → coral. Hook handlers can override.
  const effectiveTone = tone || (urgent ? 'urgent' : 'default');
  if (state === 'bother') {
    // Already bothering — refresh bubble + timer. Upgrade to urgent if needed,
    // never downgrade.
    const upgrading = urgent && !isUrgent;
    if (upgrading) {
      isUrgent = true;
      pet.classList.add('urgent');
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    const dur = isUrgent ? URGENT_SAFETY_MS : BOTHER_DURATION_MS - 500;
    if (customMessage) showBubble(customMessage, dur, effectiveTone);
    clearTimeout(endBotherTimer);
    endBotherTimer = setTimeout(stopBother, isUrgent ? URGENT_SAFETY_MS : BOTHER_DURATION_MS);
    return;
  }
  if (state === 'sleeping') wakeUp();

  if (urgent) {
    isUrgent = true;
    pet.classList.add('urgent');
    clearTimeout(sleepTimer);     // freeze sleep while urgent
    sleepTimer = null;
  } else {
    resetSleepTimer();
  }
  setState('bother');
  const message = customMessage || pickLine(BOTHER_LINES);
  showBubble(message, urgent ? URGENT_SAFETY_MS : BOTHER_DURATION_MS - 500, effectiveTone);

  // Capture current visual position and switch to absolute left/top so we can walk
  const rect = pet.getBoundingClientRect();
  petX = rect.left;
  petY = rect.top;
  pet.classList.add('walking');
  pet.style.left = `${petX}px`;
  pet.style.top = `${petY}px`;

  window.petAPI?.startCursorTracking();
  if (!walkRAF) walkRAF = requestAnimationFrame(walkStep);

  // chained chatter — re-roll line halfway through (skip when custom or urgent)
  if (!customMessage && !urgent) {
    setTimeout(() => {
      if (state === 'bother') {
        showBubble(pickLine(BOTHER_LINES), 3000, effectiveTone);
      }
    }, BOTHER_DURATION_MS / 2);
  }

  clearTimeout(endBotherTimer);
  endBotherTimer = setTimeout(stopBother, urgent ? URGENT_SAFETY_MS : BOTHER_DURATION_MS);
}

function stopBother() {
  if (state === 'idle') return;
  setState('idle');
  bubble.classList.add('hidden');

  if (isUrgent) {
    isUrgent = false;
    pet.classList.remove('urgent');
    resetSleepTimer();   // urgent had frozen sleep; resume the countdown now
  }

  window.petAPI?.stopCursorTracking();
  targetX = targetY = null;
  if (walkRAF) cancelAnimationFrame(walkRAF);
  walkRAF = null;

  returnHome();
}

function returnHome() {
  pet.classList.remove('facing-left');
  if (homeX !== null && homeY !== null) {
    pet.classList.add('walking');
    pet.style.left = `${homeX}px`;
    pet.style.top = `${homeY}px`;
    petX = homeX;
    petY = homeY;
  } else {
    pet.classList.remove('walking');
    pet.style.left = '';
    pet.style.top = '';
  }
}

function loadHome() {
  try {
    const saved = localStorage.getItem(HOME_STORAGE_KEY);
    if (!saved) return;
    const { x, y } = JSON.parse(saved);
    if (typeof x !== 'number' || typeof y !== 'number') return;
    // clamp in case window size shrunk since last run
    homeX = Math.max(0, Math.min(window.innerWidth - PET_W, x));
    homeY = Math.max(0, Math.min(window.innerHeight - PET_H, y));
    returnHome();
  } catch {}
}

function saveHome() {
  try {
    localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify({ x: homeX, y: homeY }));
  } catch {}
}

function walkStep() {
  if (state !== 'bother') {
    walkRAF = null;
    return;
  }
  if (targetX !== null) {
    const cx = petX + PET_W / 2;
    const cy = petY + PET_H / 2;
    const dx = targetX - cx;
    const dy = targetY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > ARRIVE_DISTANCE) {
      petX += (dx / dist) * WALK_SPEED;
      petY += (dy / dist) * WALK_SPEED;
      petX = Math.max(0, Math.min(window.innerWidth - PET_W, petX));
      petY = Math.max(0, Math.min(window.innerHeight - PET_H, petY));
      pet.style.left = `${petX}px`;
      pet.style.top = `${petY}px`;
      pet.classList.toggle('facing-left', dx < 0);
    }
  }
  walkRAF = requestAnimationFrame(walkStep);
}

// Receive cursor positions from main while bothering
window.petAPI?.onCursorPos(({ x, y }) => {
  targetX = x;
  targetY = y;
});


function startPetting() {
  if (state === 'petted') return;
  if (state === 'sleeping') wakeUp();
  resetSleepTimer();
  // petting is a positive interaction — also resolves any active urgent
  if (isUrgent) {
    isUrgent = false;
    pet.classList.remove('urgent');
  }
  clearTimeout(endBotherTimer);
  bubble.classList.add('hidden');
  setState('petted');
}

function stopPetting(silent = false) {
  if (state !== 'petted') return;
  setState('idle');
  clearTimeout(pettingHoldTimer);
  pettingHoldTimer = null;
  if (!silent) {
    showBubble(pickLine(['헤헤 🐶', '좋아 좋아 🐾', '한 번 더!']), 1500, 'happy');
  }
}

function resetStrokeTracking() {
  lastDir = null;
  strokeLen = 0;
  reversalCount = 0;
  clearTimeout(strokeResetTimer);
  strokeResetTimer = null;
}

// Click handling — dog dismisses bother and shows a happy line
pet.addEventListener('mouseenter', () => {
  window.petAPI?.setInteractive(true);
  lastMouseX = lastMouseY = null;
  resetSleepTimer();
});
pet.addEventListener('mouseleave', () => {
  if (isDragging) return; // keep window interactive while dragging
  window.petAPI?.setInteractive(false);
  lastMouseX = lastMouseY = null;
  resetStrokeTracking();
  // immediate exit — user moved cursor away, dog gets up right away
  if (state === 'petted') stopPetting(true);
});

pet.addEventListener('mousemove', (e) => {
  if (isDragging) return;

  // Stroke-based petting detection
  if (lastMouseX !== null) {
    const dx = e.clientX - lastMouseX;
    const adx = Math.abs(dx);
    if (adx >= 1) {
      const dir = dx > 0 ? 'right' : 'left';
      if (dir === lastDir) {
        strokeLen += adx;
      } else {
        // direction changed — count it if the previous stroke was long enough
        if (strokeLen >= STROKE_MIN_PX && lastDir !== null) {
          reversalCount++;
          if (reversalCount >= REVERSALS_NEEDED && state !== 'petted') {
            startPetting();
          }
        }
        lastDir = dir;
        strokeLen = adx;
      }
      // wipe counter if user pauses too long between strokes
      clearTimeout(strokeResetTimer);
      strokeResetTimer = setTimeout(resetStrokeTracking, RESET_INACTIVITY_MS);
    }
  }
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  // Refresh petting hold — exit if user stops moving for a while (still hovered)
  if (state === 'petted') {
    clearTimeout(pettingHoldTimer);
    pettingHoldTimer = setTimeout(() => {
      if (state === 'petted') stopPetting();
    }, PETTING_HOLD_MS);
  }
});

// ==== Drag to move home ====
pet.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left button only
  resetSleepTimer();
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  const rect = pet.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
});

document.addEventListener('mousemove', (e) => {
  if (dragStartX === null) return;
  const moved = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
  if (!isDragging && moved > DRAG_THRESHOLD) {
    isDragging = true;
    pet.classList.add('dragging');
    // dragging interrupts other states
    if (state === 'bother') stopBother();
    if (state === 'petted') stopPetting(true);
  }
  if (isDragging) {
    petX = e.clientX - dragOffsetX;
    petY = e.clientY - dragOffsetY;
    petX = Math.max(0, Math.min(window.innerWidth - PET_W, petX));
    petY = Math.max(0, Math.min(window.innerHeight - PET_H, petY));
    pet.classList.add('walking');
    pet.style.left = `${petX}px`;
    pet.style.top = `${petY}px`;
  }
});

document.addEventListener('mouseup', () => {
  if (dragStartX === null) return;
  if (isDragging) {
    homeX = petX;
    homeY = petY;
    saveHome();
    pet.classList.remove('dragging');
    suppressNextClick = true;
    showBubble('여기가 좋아? 🏠', 1600, 'happy');
    // restore mouse-event ignoring if cursor is no longer over the pet
    const r = pet.getBoundingClientRect();
    const insidePet =
      lastMouseX !== null &&
      lastMouseX >= r.left && lastMouseX <= r.right &&
      lastMouseY >= r.top && lastMouseY <= r.bottom;
    if (!insidePet) window.petAPI?.setInteractive(false);
  }
  dragStartX = dragStartY = null;
  isDragging = false;
});

pet.addEventListener('click', () => {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  resetSleepTimer();
  if (state === 'petted') return; // petting takes priority
  if (state === 'sleeping') return; // wakeUp already triggered via resetSleepTimer

  // If a Claude Code hook left us with a session reference, clicking the pet
  // jumps there: by default deep-links into Claude Desktop via
  // claude://resume?session=<id>; with CLAUDE_PET_TERMINAL_APP set, opens the
  // session's cwd in that app. Consume it either way — one click, one nav.
  if (pendingFocus) {
    const info = pendingFocus;
    pendingFocus = null;
    window.petAPI?.focusClaudeSession(info);
    showBubble('데려다줄게! 🐾', 1500, 'happy');
    if (state === 'bother') stopBother();
    return;
  }

  if (state === 'bother') {
    stopBother();
    showBubble('헤헤 🐶', 1800, 'happy');
  } else {
    showBubble(pickLine(['쓰담쓰담?', '🐾', '왈!', '히힛']), 1500, 'happy');
  }
});

// Tray menu actions
window.petAPI?.onForceBother(() => startBother());
window.petAPI?.onForceSleep(() => forceSleep());
window.petAPI?.onToggleVisibility(() => {
  pet.classList.toggle('hidden-all');
});

// When a Claude Code hook fires, remember session_id + cwd so a click on the
// pet can jump back to that session (deep link into Claude Desktop, or open
// the workspace in the configured terminal app).
let pendingFocus = null;

function rememberFocus(payload) {
  if (!payload) return;
  pendingFocus = {
    cwd: payload.cwd || null,
    sessionId: payload.session_id || null,
  };
}

// Claude Code (CLI) hook events forwarded from main's HTTP server.
// Each hook gets its own bubble border color via the `tone` arg; see the
// CSS `.tone-*` rules in style.css for the palette.
window.petAPI?.onClaudeCodeStop((payload) => {
  rememberFocus(payload);
  // Claude finished its whole response → any pending permission was clearly
  // not blocking. Drop the pending urgent before we transition to the
  // success-tone bother for "done".
  cancelPendingPermission();
  const cwd = payload?.cwd?.replace(/\/+$/, '').split('/').pop() || null;
  startBother(cwd ? `✅ ${cwd} 끝!` : '✅ Claude Code 끝!', false, 'success');
});

window.petAPI?.onClaudeCodeNotification((payload) => {
  rememberFocus(payload);
  // A non-permission notification means Claude is communicating something else
  // (e.g. session message). Cancel any pending PermissionRequest debounce so
  // we don't double-alert. (Permission-prompt notifications are handled below
  // and intentionally KEEP the urgent path — they ARE the blocking signal.)
  if (payload?.notification_type !== 'permission_prompt') {
    cancelPendingPermission();
  }
  // Claude Code routes events differently depending on where it runs:
  //   - Inside Claude Desktop's CC pane: permission asks fire the dedicated
  //     `PermissionRequest` hook (handled below).
  //   - Standalone CLI in a terminal: there's no `PermissionRequest` hook —
  //     permission asks come through as `Notification` with
  //     `notification_type: "permission_prompt"`. Same urgency, same UX
  //     intent, just a different transport. Detect that flavor here and
  //     route it through the urgent bubble path so terminal users get the
  //     same red "🚨 X 허락해줘!" treatment as Desktop users.
  if (payload?.notification_type === 'permission_prompt') {
    // Claude's message looks like: "Claude needs your permission to use <Tool>"
    const tool = payload?.message?.match(/\buse\s+([A-Za-z][\w-]*)/)?.[1] || null;
    startBother(tool ? `🚨 ${tool} 허락해줘!` : '🚨 권한 요청!', /* urgent */ true, 'urgent');
    return;
  }
  const msg = payload?.message;
  startBother(msg ? `🔔 ${msg}` : '🔔 알림!', /* urgent */ true, 'info');
});

// PermissionRequest fires for ANY permission check Claude Code does — including
// tools that are auto-allowed (allowlisted in settings, or under permission_mode
// like "acceptEdits"). The hook payload doesn't tell us whether the user is
// actually being prompted, so a naive implementation alerts the user even when
// no action is needed.
//
// Strategy: defer the urgent display by PERMISSION_DEBOUNCE_MS. If during that
// window Claude continues working (next PreToolUse, another PermissionRequest,
// or Stop), the request must have been auto-approved → cancel pending alert.
// Only if Claude truly pauses (no further hook activity) do we go urgent.
const PERMISSION_DEBOUNCE_MS = 1500;
let pendingPermissionTimer = null;
let pendingPermissionPayload = null;

function cancelPendingPermission() {
  if (pendingPermissionTimer) {
    clearTimeout(pendingPermissionTimer);
    pendingPermissionTimer = null;
    pendingPermissionPayload = null;
  }
}

window.petAPI?.onClaudeCodePermissionRequest((payload) => {
  rememberFocus(payload);
  // If a previous permission was pending, cancel it — the new one supersedes
  // (and the new one's existence proves Claude wasn't blocked on the old one).
  cancelPendingPermission();
  pendingPermissionPayload = payload;
  pendingPermissionTimer = setTimeout(() => {
    const p = pendingPermissionPayload;
    pendingPermissionPayload = null;
    pendingPermissionTimer = null;
    if (!p) return;
    const tool = p?.tool_name;
    startBother(tool ? `🚨 ${tool} 허락해줘!` : '🚨 권한 요청!', /* urgent */ true, 'urgent');
  }, PERMISSION_DEBOUNCE_MS);
});

// PreToolUse = Claude is about to invoke a tool, which means the previous
// permission check was resolved. If we had a pending urgent, kill it.
window.petAPI?.onClaudeCodePreToolUse?.(() => {
  cancelPendingPermission();
});

// Boot
setState('idle');
loadHome();
showBubble('안녕! 🐾', 3000);
resetSleepTimer();
