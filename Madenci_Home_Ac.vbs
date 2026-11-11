Set WshShell = CreateObject("WScript.Shell")
' Check if port 3000 is running, if not start it silently
WshShell.Run "cmd /c cd /d C:\Users\gocguvamiri\.gemini\antigravity\scratch\madenci-home && npm.cmd start", 0, False
WScript.Sleep 1500
WshShell.Run "http://localhost:3000"
