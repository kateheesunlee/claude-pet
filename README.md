# 🐶 Claude Pet

> 데스크탑 한 켠에 사는 클로드 강아지. Claude Code가 응답을 마치거나 권한을 물어볼 때 쪼르르 따라와서 알려주고, 가끔 놀아달라고 조릅니다.

---

## 무엇을 위한 앱인가요?

Claude Code(CLI)를 백그라운드에서 돌리다 보면 응답이 끝났는지, 권한 프롬프트가 떠 있는지 놓치기 쉬워요. Claude Pet은 그런 순간을 **시각적으로 즉시** 알려주는 작은 데스크탑 펫입니다.

- ✅ 응답이 끝나면 → 녹색 말풍선과 함께 강아지가 따라옴
- 🚨 권한을 물어보면 → 빨간 말풍선으로 강하게 보챔
- 🔔 일반 알림이 오면 → 파란 말풍선
- 🐾 강아지를 클릭하면 → Claude Desktop 앱으로 포커스 (또는 환경변수로 Cursor 등 에디터 지정 시 해당 워크스페이스로 점프)
- 그 외 시간엔 가만히 앉아서 꼬리 흔들거나 5분 뒤 잠들음 (zZz)

---

## 설치 & 실행

### 사전 준비
- macOS (Sonoma+ 권장)
- Node.js 18+
- Claude Code CLI (선택 — 펫은 CLI 없어도 동작하지만, 진짜 가치는 훅 연동에서 나와요)

### 첫 실행
```bash
cd /Users/katelee/Projects/ClaudePet
npm install
npm start
```

개발/디버깅 시:
```bash
npm run dev                       # 콘솔 로그 보임 (터미널에 [hook] 등)
CLAUDE_PET_DEVTOOLS=1 npm run dev # + 렌더러 DevTools 열림
```

### macOS Accessibility 권한
첫 실행 시 macOS가 권한 다이얼로그를 띄워요. **허용**해주세요.

다이얼로그를 못 받았거나 실수로 거부했다면:
1. 시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용
2. 목록에 **Electron**이 있는지 확인 → 있으면 토글 ON
3. 없으면 `+` 버튼 → `Cmd+Shift+G` →
   ```
   /Users/katelee/Projects/ClaudePet/node_modules/electron/dist/Electron.app
   ```
4. 추가 후 토글 ON, 펫 재시작

### Claude Code 훅 연결 (핵심)
펫이 진짜로 유용해지려면 Claude Code의 hook을 펫의 HTTP 서버(`localhost:47625`)에 연결해야 합니다. 프로젝트의 [`.claude/settings.json`](.claude/settings.json)에 이미 셋업되어 있어요:

- **Stop** → 응답 완료 시 펫 알림
- **Notification** → macOS 레벨 알림 시 펫 알림
- **PermissionRequest** → 권한 다이얼로그 뜰 때 펫 알림 (가장 중요!)

다른 프로젝트에서도 사용하고 싶으면 같은 설정을 `~/.claude/settings.json`(글로벌)이나 해당 프로젝트의 `.claude/settings.json`에 복사하세요.

---

## 🐾 펫 트리거 룰

펫이 언제 어떻게 반응하는지 한눈에:

| 이벤트 | Bubble 색 | 메시지 예시 | 발동 조건 | 긴급도 |
|---|---|---|---|---|
| 응답 완료 | 🟢 녹색 | `✅ ClaudePet 끝!` | Claude Code `Stop` 훅 | 일반 (8초) |
| 권한 요청 | 🔴 빨강 | `🚨 Bash 허락해줘!` | Claude Code `PermissionRequest` 훅 | **Urgent** (10분 안전 타이머) |
| 일반 알림 | 🔵 파랑 | `🔔 <메시지>` | Claude Code `Notification` 훅 | Urgent |
| 일반 bother | 🟠 코랄 | `야! 놀아줘 🐾` | 트레이 "Bother now" / Demo timer | 일반 |
| 긍정 반응 | 🩷 핑크 | `헤헤 🐶`, `여기가 좋아? 🏠` | 클릭 답례, 쓰담쓰담 끝, 드래그 끝, 잠깸 | (지속 안 함) |

### 일반 bother vs Urgent bother

| | 일반 | Urgent |
|---|---|---|
| 자동 종료 | 8초 | 10분 (안전 타이머) |
| 시각 강조 | 보통 | 빨간 펄스 점 + 강조 클래스 |
| 5분 idle 후 sleep | 활성 | **freeze** (계속 깨어있음) |
| 다운그레이드 | — | 진행 중 일반 트리거 와도 urgent 유지 |

> 💡 **팁**: Urgent 상태에선 펫을 클릭하거나 쓰다듬어야 풀려요. 사용자가 그 순간 안 보고 있을 위험이 큰 시점이라 일부러 끈질김.

---

## 🐶 펫과 인터랙션하기

| 액션 | 결과 |
|---|---|
| 마우스 호버 | 자고 있던 펫이 깨어남 |
| 펫 클릭 (Claude Code 알림 직후) | Claude Desktop 앱으로 포커스 (기본). `CLAUDE_PET_TERMINAL_APP` 지정 시 해당 앱에서 세션 `cwd` 열기 |
| 펫 클릭 (그 외) | bother 중이면 dismiss. 평상시엔 짧은 답례 ("쓰담쓰담?", "🐾", "왈!") |
| 펫 드래그 | 새 위치로 이동, 그 자리가 **영구 홈**으로 저장됨 (재시작해도 유지) |
| 호버한 채로 좌↔우 3번 휘젓기 | **쓰담쓰담 모드** — 배 뒤집고 하트 날림 |
| 마우스 떼기 (쓰담 중) | 즉시 일어남 |
| 5분 동안 아무 인터랙션 없음 | 잠듦 (zZz) — Urgent bother 중엔 안 잠 |

### 펫의 상태(state)

- 🟢 **idle**: 가만히 앉아 숨쉬고 꼬리 흔듦 (평상시)
- 🐾 **bother**: 콩콩 뛰면서 커서 따라옴 + 말풍선
- 🩷 **petted**: 배 뒤집고 발버둥 + 하트
- 💤 **sleeping**: zZz, 호버하면 깸
- 🚨 **urgent** (modifier): bother + 빨간 강조

---

## 🎛 트레이 메뉴 (메뉴바 🐶 아이콘)

| 항목 | 동작 |
|---|---|
| `Hook: listening on :47625` | 훅 서버 상태 표시 (클릭 불가) |
| `Bother now` | 즉시 일반 bother 발동 (테스트용) |
| `Sleep now` | 펫 즉시 재우기 |
| `Toggle pet` | 펫 숨기기 / 다시 보이기 |
| `Demo timer: ON/OFF` | 30초마다 자동 bother (시연/테스트용) |
| `Quit` | 종료 |

---

## 🏗 작동 원리 (간단히)

```
Claude Code (CLI)
       │
       │ 훅 발화 (Stop / Notification / PermissionRequest)
       ▼
   [.claude/settings.json hook]
       │
       │ curl POST http://127.0.0.1:47625/claude-code/<event>
       ▼
   [Electron 메인 프로세스: HTTP 서버]
       │
       │ IPC 'claude-code-<event>'
       ▼
   [Renderer (투명 윈도우 위 강아지 DOM)]
       │
       │ 상태 전이 (idle → bother → ...)
       ▼
   사용자 화면 위 시각/애니메이션
```

### 파일 구조
```
ClaudePet/
├── main.js                       # Electron 메인 + 훅 HTTP 서버 + 트레이
├── preload.js                    # Renderer ↔ 메인 IPC 브릿지
├── renderer/
│   ├── index.html                # 강아지 DOM 구조
│   ├── pet.js                    # 상태 머신, 마우스/훅 처리, 애니메이션
│   └── style.css                 # 강아지 모양 + bubble 톤 시스템
├── .claude/settings.json         # Claude Code 훅 설정 (curl POST)
└── .claude/skills/test-pet/      # /test-pet 스킬 (3초 후 테스트 메시지)
```

---

## 🧪 테스트 & 디버깅

### Hook 서버 동작 확인
```bash
# 펫에게 직접 Stop 이벤트 보내보기
curl -X POST http://127.0.0.1:47625/claude-code/stop \
  -H 'content-type: application/json' \
  -d '{"cwd":"/Users/me/test","session_id":"abc"}'
```
응답 `{"ok":true}`와 함께 펫이 녹색 말풍선으로 따라와야 정상.

### Hook 로그 확인
모든 hook 이벤트는 `/tmp/claude-pet-hook.log`에 기록됩니다:
```bash
tail -f /tmp/claude-pet-hook.log
```

### 포트 확인
```bash
lsof -nP -iTCP:47625 -sTCP:LISTEN
```
Electron이 LISTEN 중이면 정상.

### `/test-pet` 스킬
Claude Code 안에서 `/test-pet` 입력하면 3초 후 테스트 메시지를 보내요. Claude를 백그라운드로 보내고 펫이 반응하는지 확인 가능.

---

## ⚠️ 알려진 한계

- **macOS 전용**: AppKit, Accessibility API, Apple-specific 훅 사용. Linux/Windows 미지원.
- **포트 47625 고정**: 이미 쓰이는 환경이면 펫의 hook 서버가 못 뜸 (트레이 라벨에 표시됨). 필요시 [`main.js`](main.js)의 `HOOK_PORT` 상수 변경.
- **권한이 즉시 반영 안 됨**: Accessibility 권한 토글 후엔 펫 재시작 필요.
- **Permission prompt에만 반응**: Claude Code가 *내부적으로 막혀 있는* 다른 시점(예: long tool execution)은 별도 신호 없이는 감지 못 함.
- **Claude Desktop 통합은 비활성**: 초기 PoC에서 Claude Desktop 사이드바/dock 뱃지 폴링을 시도했었지만 현재 [main.js](main.js)에선 비연결. CLI 훅 통합이 훨씬 정확해서 그쪽으로 단일화.

---

### 클릭 → 세션으로 점프

Claude Code 훅 (Stop / Notification / PermissionRequest) 직후에 펫을 클릭하면, **기본은 Claude Desktop 앱을 포그라운드로** 가져와요. (`open -a Claude`)

CLI를 터미널/에디터에서 돌리는 경우엔 환경변수로 해당 앱을 지정하면, 클릭 시 그 앱에서 세션의 `cwd`가 열려요:

```bash
CLAUDE_PET_TERMINAL_APP=Cursor npm start
# 또는: iTerm, Terminal, Warp, "Visual Studio Code" 등
```

내부적으론 `open -a "$앱" "$cwd"`를 실행하므로, `open -a`로 처리 가능한 앱이면 다 됨.

## 🛣 향후 개선 아이디어

- [ ] Stop 훅에서 `last_assistant_message` 길이/내용 보고 펫 동작 차별화 (질문 vs 단순 보고)
- [ ] 사용자 정의 톤/메시지 지원
- [ ] Multi-monitor 위치 기억
- [ ] `SubagentStop`도 별도 톤으로 (현재는 미연결)

---

## 🐾 만든 사람의 메모

이 펫은 **PoC**입니다. Claude Code의 hook 시스템을 학습하고, "내가 잠시 자리 비운 사이 Claude가 뭘 했는지/뭘 묻고 있는지"를 시각적으로 캐치하는 게 목적이었어요. 동작을 추가/수정하기 매우 쉽게 짜뒀으니 (각 핸들러는 [pet.js](renderer/pet.js) 끝부분에 모여있음), 자유롭게 손질해 쓰세요. 🐶
