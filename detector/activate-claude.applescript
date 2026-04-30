-- Brings Claude Desktop to the foreground.
-- Stretch goal (TODO): after activation, navigate to the session with the unread badge.
-- That requires probing Claude's sidebar AX structure to identify "unread" markers
-- (run the Probe Claude debug menu while you have an unread session to capture them).
tell application "Claude" to activate
