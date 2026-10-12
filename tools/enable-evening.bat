@echo off
rem Sets up a Windows scheduled task that reminds you about your Code Check streak in the evening:
rem at 20:00, or the first time you sign in, unlock or wake the PC after that. Once a day.
rem If today's quiz is already done the window says so and closes itself.
rem To undo:  schtasks /delete /tn EveningReviewDeck /f
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dir = '%~dp0'.TrimEnd('\');" ^
  "$action = New-ScheduledTaskAction -Execute ((Get-Command pythonw).Source) -Argument 'open_morning.py --evening' -WorkingDirectory $dir;" ^
  "$me = \"$env:USERDOMAIN\$env:USERNAME\";" ^
  "$cls = Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger;" ^
  "$unlock = New-CimInstance -CimClass $cls -ClientOnly -Property @{StateChange = 8; UserId = $me; Enabled = $true};" ^
  "$wcls = Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskEventTrigger;" ^
  "$wake = New-CimInstance -CimClass $wcls -ClientOnly -Property @{Enabled = $true; Subscription = '<QueryList><Query Id=\"0\" Path=\"System\"><Select Path=\"System\">*[System[Provider[@Name=''Microsoft-Windows-Power-Troubleshooter''] and EventID=1]]</Select></Query></QueryList>'};" ^
  "$triggers = @((New-ScheduledTaskTrigger -Daily -At 20:00), (New-ScheduledTaskTrigger -AtLogOn -User $me), $unlock, $wake);" ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew;" ^
  "Register-ScheduledTask -TaskName EveningReviewDeck -Action $action -Trigger $triggers -Settings $settings -Force | Out-Null"
if errorlevel 1 (echo Setup failed.) else (echo Done. At 20:00 Review Deck reminds you if today's quiz isn't done yet.)
pause
