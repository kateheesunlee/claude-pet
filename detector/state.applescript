-- Returns "state=<token>|badge=<unread-count>|err=<message>"
-- state tokens: not-running | idle | no-permission | error
-- badge: integer string of unread sessions (those whose AXButton name starts
-- with "Awaiting input"), empty when 0
--
-- Strategy: Claude Desktop's sidebar lists each session as an AXButton named
-- "<state> <title>" (e.g., "Idle Fix bug" or "Awaiting input Clean up").
-- We count only states that mean "user attention needed":
--   "Awaiting input ..."   = ● response arrived, awaiting user
--   "Ready ..."            = ● work ready for user review
-- Excluded (would otherwise be false positives during normal use):
--   "Idle ..."             = ○ no pending work
--   "Generating ..."       = currently generating, NOT user's turn yet
--   "Pull request merged ...", etc.
-- The path is hardcoded based on probe-tree output and is fragile to UI changes.
on run
	set phase to "init"
	set stateResult to "error"
	set badgeResult to ""
	set unreadCount to 0
	try
		tell application "System Events"
			set phase to "find-process"
			set claudeProcs to (every process whose bundle identifier is "com.anthropic.claudefordesktop")
			if (count of claudeProcs) is 0 then
				set stateResult to "not-running"
			else
				set claudeProc to item 1 of claudeProcs
				set stateResult to "idle"
				set phase to "find-window"
				-- Find the chat window (named "Claude"); skip the unnamed/hidden one
				set chatWindow to missing value
				repeat with w in windows of claudeProc
					try
						if (name of w as string) is "Claude" then
							set chatWindow to w
							exit repeat
						end if
					end try
				end repeat
				if chatWindow is not missing value then
					set phase to "walk-path"
					try
						-- Descend from /2/1 to the sessions list parent (/2/1/1/1/1/1/2/1/1/1/1/1/1/1/6/6)
						set node to UI element 1 of chatWindow
						set descendIndices to {1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 6, 6}
						repeat with idx in descendIndices
							set node to UI element (idx as integer) of node
						end repeat
						set phase to "count-sessions"
						-- Walk each session button; check name prefix for whitelisted states.
						set sessionEntries to UI elements of node
						repeat with i from 1 to (count of sessionEntries)
							try
								set entryNode to item i of sessionEntries
								set innerGroup to UI element 1 of entryNode
								set sessionBtn to UI element 1 of innerGroup
								set btnName to (name of sessionBtn) as string
								if btnName starts with "Awaiting" or btnName starts with "Ready" then
									set unreadCount to unreadCount + 1
								end if
							end try
						end repeat
					end try
				end if
			end if
		end tell
	on error errMsg number errNum
		if errNum is -1728 or errNum is -25211 then
			return "state=no-permission|badge=|err="
		end if
		return "state=error|badge=|err=" & errNum & " @" & phase & ": " & errMsg
	end try
	if unreadCount > 0 then set badgeResult to (unreadCount as string)
	return "state=" & stateResult & "|badge=" & badgeResult & "|err="
end run
