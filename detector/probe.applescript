-- Dumps the full AX tree of Claude's front window for debugging signal selection.
on run
	try
		tell application "System Events"
			if not (exists process "Claude") then return "STATUS: not-running"
			tell process "Claude"
				if (count of windows) is 0 then return "STATUS: no-window"
				tell front window
					set output to "STATUS: ok" & linefeed
					try
						set output to output & "WINDOW_TITLE: " & (name as string) & linefeed
					end try
					set output to output & "---ELEMENTS---" & linefeed
					try
						set elems to entire contents
						set output to output & "TOTAL: " & (count of elems) & linefeed
						set i to 0
						repeat with elem in elems
							set i to i + 1
							try
								set r to (role of elem) as string
								set n to ""
								try
									set n to (name of elem) as string
								end try
								set d to ""
								try
									set d to (description of elem) as string
								end try
								set t to ""
								try
									set t to (title of elem) as string
								end try
								set v to ""
								try
									set vv to value of elem
									set vc to class of vv as string
									if vc is "text" or vc is "string" or vc is "integer" or vc is "real" or vc is "boolean" then
										set v to vv as string
										if length of v > 120 then set v to (text 1 thru 120 of v) & "..."
									end if
								end try
								if n is not "" or d is not "" or t is not "" or v is not "" then
									set output to output & i & " " & r & " | name=" & n & " | desc=" & d & " | title=" & t & " | value=" & v & linefeed
								end if
							end try
						end repeat
					on error walkErr
						set output to output & "WALK_ERROR: " & walkErr & linefeed
					end try
					return output
				end tell
			end tell
		end tell
	on error errMsg number errNum
		if errNum is -1728 then return "STATUS: no-permission"
		return "STATUS: error: " & errMsg
	end try
end run
