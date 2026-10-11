# Review Deck

### 👉 [**Open Review Deck**](https://yiftachneeman89.github.io/review-deck/) 👈

Three tools for reviewing your own project, in one place, and installable as a desktop app:

| | |
|---|---|
| [**Code Check**](https://yiftachneeman89.github.io/code-check/) | Quiz yourself on your own code. The card shows how much of the code you know and have mastered, your streak, today's goal and the last 7 days. |
| [**Screen Map**](https://yiftachneeman89.github.io/screen-map/) | Your Android app as a flow chart. The card shows how many screens and connections your app has, where it starts and how many buttons it has. |
| [**Design Critic**](https://yiftachneeman89.github.io/design-critic/) | A design review that doesn't go easy on you. The card shows your grade and score, open blockers, major and minor issues, and fix progress. |

The cards read each tool's own data in your browser. All the sites live on the same GitHub Pages address, so they share storage. Nothing is uploaded.

## Install it as an app

Open the site in Edge or Chrome and click **Install app** (or the install icon in the address bar). Review Deck then opens in its own window, and the three tools open inside it. Each tool has a **← Review Deck** link to come back.

## Open it every morning

Run `tools/enable-morning.bat` once. It creates a Windows scheduled task that opens Review Deck in its own window the first time you sign in, unlock or wake the PC each day. To undo it: `schtasks /delete /tn MorningReviewDeck /f`.

## One-time setup

The first time you open Review Deck it asks for two things, like Code Check's sign-in: your project folder and your Gemini API key. They're saved in the browser (and the browser is asked to keep them for good), so neither Review Deck nor Code Check asks again.

### Progress from the old desktop app

If you used the local *Morning Code Check* app, run this once:

```
python tools/export_morning.py <path-to-IntuiteacherDailyQuiz>
```

It writes `code-check-progress.json` (rounds, answers and scores only - no key, no code) into the root of your project folder. When you pick that folder during setup, the progress is found and added automatically.
