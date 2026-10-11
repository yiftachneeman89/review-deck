"""Opens Review Deck in its own Edge app window, once per day.

Run by the "MorningReviewDeck" scheduled task (see tools/enable-morning.bat) on sign-in, unlock and wake.
Pass --now to open it regardless of whether it already opened today.
"""
import datetime
import os
import subprocess
import sys
from pathlib import Path

URL = "https://yiftachneeman89.github.io/review-deck/"
STATE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "ReviewDeck" / "last_opened.txt"


def edge():
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        exe = Path(base or "") / "Microsoft" / "Edge" / "Application" / "msedge.exe"
        if base and exe.exists():
            return str(exe)
    return None


def main():
    today = datetime.date.today().isoformat()
    if "--now" not in sys.argv and STATE.exists() and STATE.read_text().strip() == today:
        return
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(today)
    exe = edge()
    if exe:
        subprocess.Popen([exe, f"--app={URL}"])
    else:
        os.startfile(URL)


if __name__ == "__main__":
    main()
