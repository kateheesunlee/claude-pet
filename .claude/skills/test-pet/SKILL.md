---
name: test-pet
description: Wait 3 seconds, then send a short identifiable test message. Used to test the Claude Pet's notification detection — the user backgrounds Claude Desktop, runs this skill, and watches whether the pet reacts when the response arrives. Triggers on phrases like "test pet", "trigger pet", "send test notification", "테스트 메시지", or the slash command /test-pet.
---

# Test Pet Notification

The user is testing the Claude Pet desktop app's notification detection. Your only job:

1. Use the Bash tool to run `sleep 3` (gives the user time to background Claude Desktop)
2. Reply with a short, clearly-identifiable test message — exactly one line, including the bell emoji and a recognizable phrase.

Example output (adapt the wording but keep it short):

> 🔔 테스트 알림 도착! Claude Pet이 반응했나요?

Constraints:
- Do NOT add follow-up questions, explanations, or commentary beyond the one test line.
- Do NOT skip the sleep — the delay is essential for the user to set up the test.
- If the user passes an argument like `5s`, use that duration instead of 3 seconds.
