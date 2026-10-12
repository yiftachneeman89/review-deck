"""Opens Review Deck in its own Edge app window, once per day.

Run by the "MorningReviewDeck" scheduled task (see tools/enable-morning.bat) on sign-in, unlock and wake.
Pass --now to open it regardless of whether it already opened today.

With --evening (the "EveningReviewDeck" task, tools/enable-evening.bat) it opens the streak reminder
instead: once a day, from 20:00 on. The page closes itself if today's quiz is already done.
"""
import datetime
import os
import subprocess
import sys
from pathlib import Path

URL = "https://yiftachneeman89.github.io/review-deck/"
EVENING_FROM = 20  # hour
STATE_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "ReviewDeck"


def edge():
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        exe = Path(base or "") / "Microsoft" / "Edge" / "Application" / "msedge.exe"
        if base and exe.exists():
            return str(exe)
    return None


def main():
    evening = "--evening" in sys.argv
    now = datetime.datetime.now()
    if evening and now.hour < EVENING_FROM and "--now" not in sys.argv:
        return
    state = STATE_DIR / ("last_evening.txt" if evening else "last_opened.txt")
    today = now.date().isoformat()
    if "--now" not in sys.argv and state.exists() and state.read_text().strip() == today:
        return
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(today)
    url = URL + ("?evening=1" if evening else "")
    exe = edge()
    if exe:
        subprocess.Popen([exe, f"--app={url}"])
    else:
        os.startfile(url)


if __name__ == "__main__":
    main()
