@echo off
rem Sets up a Windows scheduled task that opens Review Deck once a day,
rem the first time you sign in, unlock or wake the PC.
rem To undo:  schtasks /delete /tn MorningReviewDeck /f
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dir = '%~dp0'.TrimEnd('\');" ^
  "$action = New-ScheduledTaskAction -Execute ((Get-Command pythonw).Source) -Argument 'open_morning.py' -WorkingDirectory $dir;" ^
  "$me = \"$env:USERDOMAIN\$env:USERNAME\";" ^
  "$cls = Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger;" ^
  "$unlock = New-CimInstance -CimClass $cls -ClientOnly -Property @{StateChange = 8; UserId = $me; Enabled = $true};" ^
  "$wcls = Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskEventTrigger;" ^
  "$wake = New-CimInstance -CimClass $wcls -ClientOnly -Property @{Enabled = $true; Subscription = '<QueryList><Query Id=\"0\" Path=\"System\"><Select Path=\"System\">*[System[Provider[@Name=''Microsoft-Windows-Power-Troubleshooter''] and EventID=1]]</Select></Query></QueryList>'};" ^
  "$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $me), $unlock, $wake);" ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew;" ^
  "Register-ScheduledTask -TaskName MorningReviewDeck -Action $action -Trigger $triggers -Settings $settings -Force | Out-Null"
if errorlevel 1 (echo Setup failed.) else (echo Done. Review Deck will open the first time you sign in, unlock or wake the PC each day.)
pause
