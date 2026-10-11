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

## Moving progress from the desktop Code Check app

If you used the local *Morning Code Check* app, export its progress and import it here:

```
python tools/export_morning.py <path-to-IntuiteacherDailyQuiz> code-check-progress.json
```

Then click **Import progress file** in Review Deck. Your rounds, answers, scores, the project's code and the Gemini key move into Code Check. The export file contains your API key, so delete it after importing.
