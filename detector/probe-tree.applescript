-- Depth-limited UI tree walker for Claude Desktop.
-- Avoids `entire contents` (which times out on Claude's deep DOM).
property outputLines : {}
property maxDepth : 25

on run
	set my outputLines to {}
	try
		tell application "System Events"
			set claudeProcs to (every process whose bundle identifier is "com.anthropic.claudefordesktop")
			if (count of claudeProcs) is 0 then
				return "STATUS: not-running"
			end if
			set claudeProc to item 1 of claudeProcs
			set end of my outputLines to "STATUS: ok"
			try
				set end of my outputLines to ("PROC: " & (name of claudeProc as string))
			end try
			try
				set end of my outputLines to ("WINDOWS: " & (count of windows of claudeProc))
			end try
			set end of my outputLines to "---TREE---"
			my walkElement(claudeProc, 0, "")
		end tell
	on error errMsg number errNum
		if errNum is -1728 or errNum is -25211 then
			return "STATUS: no-permission"
		end if
		set end of my outputLines to ("ERROR: " & errNum & " " & errMsg)
	end try
	set AppleScript's text item delimiters to linefeed
	return (my outputLines) as text
end run

on walkElement(elem, depth, pathStr)
	if depth > maxDepth then return
	tell application "System Events"
		set roleStr to "?"
		try
			set roleStr to (role of elem) as string
		end try
		set nameStr to ""
		try
			set nameStr to (name of elem) as string
		end try
		set descStr to ""
		try
			set descStr to (description of elem) as string
		end try
		set valStr to ""
		try
			set rawVal to value of elem
			set valStr to rawVal as string
			if (length of valStr) > 80 then
				set valStr to (text 1 thru 80 of valStr) & "..."
			end if
		end try
		set kids to {}
		try
			set kids to UI elements of elem
		end try
	end tell
	-- Skip noisy "missing value" placeholder strings
	if nameStr is "missing value" then set nameStr to ""
	if descStr is "missing value" then set descStr to ""
	if valStr is "missing value" then set valStr to ""
	-- Skip the menu bar entirely — no signal there for unread sessions
	if roleStr is "AXMenuBar" then return
	set indentStr to ""
	repeat depth times
		set indentStr to indentStr & "  "
	end repeat
	set entry to (indentStr & pathStr & " [" & roleStr & "]")
	if nameStr is not "" then set entry to (entry & " name=" & nameStr)
	if descStr is not "" then set entry to (entry & " desc=" & descStr)
	if valStr is not "" then set entry to (entry & " val=" & valStr)
	set end of my outputLines to entry
	if depth < maxDepth then
		set kidsCount to count of kids
		repeat with i from 1 to kidsCount
			try
				my walkElement(item i of kids, depth + 1, (pathStr & "/" & i))
			end try
		end repeat
	end if
end walkElement
