# 🐶 Claude Pet

> A little Claude puppy that lives in the corner of your desktop. It comes running over to let you know when Claude Code finishes a response or asks for permission, and occasionally begs you to play.

> 🇰🇷 한국어 README는 [README.ko.md](README.ko.md) 를 보세요.
>
> 

https://github.com/user-attachments/assets/1dc5a60a-21e4-4e2e-a405-c7a08301aea1



---

## What it's for

If you run Claude Code (CLI) in the background, it's easy to miss when a response wraps up or when a permission prompt is sitting there waiting for you. Claude Pet is a tiny desktop pet that flags those moments **visually and instantly**.

- ✅ Response done → green bubble, the pup trots over
- 🚨 Permission requested → red bubble, more insistent
- 🔔 Generic notification → blue bubble
- 🐾 Click the pup → focuses Claude Desktop (or jumps to your editor's workspace if you've set the env var)
- The rest of the time it sits there breathing, wagging its tail, and falls asleep after 5 minutes (zZz)

---

## Install & run

### Prerequisites
- macOS (Sonoma or later recommended)
- Node.js 18+
- Claude Code CLI (optional — the pet runs without it, but the real value comes from hook integration)

### First run
```bash
cd /path/to/ClaudePet
npm install
npm start
```

For development / debugging:
```bash
npm run dev                       # console logs visible in your terminal ([hook] etc.)
CLAUDE_PET_DEVTOOLS=1 npm run dev # + opens renderer DevTools
```

### macOS Accessibility permission
On first launch macOS will pop a permission dialog. Click **Allow**.

If you missed the dialog or accidentally denied it:
1. System Settings → Privacy & Security → Accessibility
2. Look for **Electron** in the list — if present, toggle it ON
3. If not present, click `+` → `Cmd+Shift+G` →
   ```
   /path/to/ClaudePet/node_modules/electron/dist/Electron.app
   ```
4. Add it, toggle ON, restart the pet

### Connecting Claude Code hooks (the important bit)
The pet only becomes really useful once Claude Code's hooks are wired into the pet's local HTTP server (`localhost:47625`). **One click on the "✨ Auto-install" button on first launch** does this for you.

The auto-installer adds these 5 hooks to the global `~/.claude/settings.json` (each tagged with `# claudepet-hook-v1` so they can be cleanly removed later):

- **Stop** → 💬 the pet trots over when Claude finishes responding
- **Notification** → blue bubble for macOS-level notifications
- **PermissionRequest** → 🚨 red urgent bubble when a permission dialog appears
- **PreToolUse / PostToolUse** → used to debounce auto-approved permission checks so they don't false-trigger urgent

Re-open the onboarding or remove hooks any time from the tray 🐶 menu: **`Show onboarding…`** / **`Uninstall global hooks…`**.

---

## 🐾 Trigger rules

When and how the pet reacts, at a glance:

| Event | Bubble color | Example | Trigger | Urgency |
|---|---|---|---|---|
| Response done | 🟢 green | `💬 ClaudePet replied!` | Claude Code `Stop` hook | normal (8s) |
| Permission ask | 🔴 red | `🚨 Allow Bash!` | Claude Code `PermissionRequest` hook | **urgent** (10-min safety timer) |
| Notification | 🔵 blue | `🔔 <message>` | Claude Code `Notification` hook | urgent |
| Generic bother | 🟠 coral | `Hey! Play with me 🐾` | Tray "Bother now" / Demo timer | normal |
| Happy reaction | 🩷 pink | `Hehe 🐶`, `Like it here? 🏠` | Click reply, end of petting, end of drag, waking up | (transient) |

### Normal bother vs Urgent bother

| | Normal | Urgent |
|---|---|---|
| Auto-clear | 8s | 10 min (safety timer) |
| Visual emphasis | regular | red pulse + emphasis class |
| 5-min idle → sleep | active | **frozen** (stays awake) |
| Downgrade | — | new normal-tone events don't downgrade urgent |

> 💡 **Tip**: An urgent bother only clears when you click or pet the pup. The pet stays insistent on purpose — it's the moment you're most likely to be looking away.

---

## 🐶 Interacting with the pet

| Action | Result |
|---|---|
| Mouse hover | Wakes up a sleeping pet |
| Click (right after a Claude Code event) | Focuses Claude Desktop (default). With `CLAUDE_PET_TERMINAL_APP` set, opens the session's `cwd` in that app instead |
| Click (otherwise) | Dismisses an active bother. Otherwise a quick reply ("Pet me?", "🐾", "Woof!") |
| Drag the pet | Moves it to a new spot — that becomes its **permanent home** (persists across restarts) |
| Hover + flick left↔right 3 times | **Petting mode** — belly up, hearts everywhere |
| Move mouse away (while petting) | Pup gets up immediately |
| 5 min with no interaction | Falls asleep (zZz) — never sleeps during urgent bother |

### Pet states

- 🟢 **idle**: sitting, breathing, tail wagging (default)
- 🐾 **bother**: hopping toward the cursor + bubble
- 🩷 **petted**: belly up + hearts
- 💤 **sleeping**: zZz, hover to wake
- 🚨 **urgent** (modifier): bother + red emphasis

---

## 🎛 Tray menu (the 🐶 menubar icon)

| Item | What it does |
|---|---|
| `Hook server: listening on :47625` | Hook server status (informational) |
| `Hooks: ✓ installed (global)` | Hook install status (informational) |
| `Bother now` | Triggers a normal bother immediately (testing) |
| `Sleep now` | Puts the pet to sleep right away |
| `Toggle pet` | Hides / shows the pet |
| `Demo timer: ON/OFF` | Auto-bothers every 30s (demos / testing) |
| `Show onboarding…` | Reopens the onboarding window |
| `Install global hooks` / `Uninstall global hooks…` | Installs or removes the global hooks |
| `Quit` | Quit the app |

---

## 🏗 How it works

```
Claude Code (CLI)
       │
       │ hook fires (Stop / Notification / PermissionRequest / PreToolUse / PostToolUse)
       ▼
   [~/.claude/settings.json hook] ← installed by onboarding
       │
       │ curl POST http://127.0.0.1:47625/claude-code/<event>
       ▼
   [Electron main process: HTTP server]
       │
       │ IPC 'claude-code-<event>'
       ▼
   [Renderer (puppy DOM in a transparent window)]
       │
       │ state transition (idle → bother → ...)
       ▼
   visual / animation on the user's screen
```

### Project layout
```
ClaudePet/
├── main.js                       # Electron main + hook HTTP server + auto-installer + tray
├── preload.js                    # renderer ↔ main IPC bridge
├── renderer/
│   ├── index.html                # puppy DOM
│   ├── pet.js                    # state machine, mouse/hook handlers, animation
│   ├── style.css                 # puppy shape + bubble tone system
│   ├── onboarding.html           # 5-step first-run onboarding
│   ├── onboarding.css            # onboarding styles
│   └── onboarding.js             # step nav + auto-install wiring
└── .claude/skills/test-pet/      # /test-pet skill (sends a test message after 3s)
```

> Global hooks are installed into `~/.claude/settings.json` by the onboarding on first launch. There's no per-project `.claude/settings.json` — hook config is owned in one place (global) only.

---

## 🧪 Testing & debugging

### Verify the hook server
```bash
# Send a Stop event directly to the pet
curl -X POST http://127.0.0.1:47625/claude-code/stop \
  -H 'content-type: application/json' \
  -d '{"cwd":"/Users/me/test","session_id":"abc"}'
```
You should see `{"ok":true}` and the pup trotting over with a green bubble.

### Hook logs
The auto-installed global hooks run silently (no logging, for performance). To see payloads while debugging, run `npm run dev` — the main process prints summaries like `[hook] Stop ...` to the terminal.

If you need the full JSON payload, you can temporarily add a logging hook to `.claude/settings.local.json` (gitignored) that appends to `/tmp/claude-pet-hook.log`:
```bash
tail -f /tmp/claude-pet-hook.log
```

### Check the port
```bash
lsof -nP -iTCP:47625 -sTCP:LISTEN
```
If Electron is LISTENing, you're fine.

### `/test-pet` skill
Type `/test-pet` inside Claude Code — it sends a test message after 3 seconds. Background Claude Desktop and watch whether the pet reacts.

---

## ⚠️ Known limitations

- **macOS only**: uses AppKit, the Accessibility API, and Apple-specific hooks. Linux / Windows aren't supported.
- **Port 47625 is hardcoded**: if it's already in use, the pet's hook server won't bind (the tray label tells you). Edit the `HOOK_PORT` constant in [`main.js`](main.js) if needed.
- **Permission changes need a restart**: after toggling Accessibility permission, restart the pet.
- **Reacts to permission prompts only**: other moments where Claude Code is *internally* blocked (e.g. a long tool execution) aren't detected without an explicit signal.
- **Claude Desktop integration is disabled**: an early PoC polled Claude Desktop's sidebar / dock badge, but the wiring isn't active in [main.js](main.js) — CLI hook integration is more accurate, so the project consolidated on that.

---

### Click → jump to session

Right after a Claude Code hook (Stop / Notification / PermissionRequest), clicking the pet **brings Claude Desktop to the foreground by default** (`open -a Claude`).

If you run the CLI in a terminal / editor, set the env var so a click opens the session's `cwd` in that app instead:

```bash
CLAUDE_PET_TERMINAL_APP=Cursor npm start
# or: iTerm, Terminal, Warp, "Visual Studio Code", etc.
```

Internally it just runs `open -a "$APP" "$cwd"`, so anything `open -a` understands works.

## 🛣 Future ideas

- [ ] Differentiate pet behavior on `Stop` based on `last_assistant_message` length / content (question vs. simple status)
- [ ] User-customizable tone / messages
- [ ] Remember position per monitor (multi-monitor)
- [ ] Wire up `SubagentStop` with its own tone (currently unhandled)

---

## 🐾 A note from the maker

This pet is a **PoC**. The point was to learn Claude Code's hook system and to visually catch "what did Claude do / what is it asking me while I stepped away?". The handlers are deliberately easy to add to / tweak (each one lives at the bottom of [pet.js](renderer/pet.js)) — go nuts. 🐶
