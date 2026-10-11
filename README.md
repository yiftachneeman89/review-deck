# Review Deck

### 👉 [**Open Review Deck**](https://yiftachneeman89.github.io/review-deck/) 👈

Three tools for reviewing your own project, in one place, and installable as a desktop app:

| | |
|---|---|
| [**Code Check**](https://yiftachneeman89.github.io/code-check/) | Quiz yourself on your own code. The card shows how much of the code you know and have mastered, your streak, today's goal and the last 7 days. |
| [**Screen Map**](https://yiftachneeman89.github.io/screen-map/) | Your Android app as a flow chart. The card shows how many screens and connections your app has, where it starts and how many buttons it has. |
| [**Design Critic**](https://yiftachneeman89.github.io/design-critic/) | A design review that doesn't go easy on you. The card shows your grade and score, open blockers, major and minor issues, and fix progress. |

All the sites live on the same GitHub Pages address, so they share the browser's storage. Nothing is uploaded.

## Install it as an app

Open the site in Edge or Chrome and click **Install app** (or the install icon in the address bar). Review Deck then opens in its own window, and the three tools open inside it. Each tool has a **← Review Deck** link to come back.

## Open it every morning

Run `tools/enable-morning.bat` once. It creates a Windows scheduled task that opens Review Deck in its own window the first time you sign in, unlock or wake the PC each day. To undo it: `schtasks /delete /tn MorningReviewDeck /f`.

## Sign in once

The first time you open Review Deck it asks for your project folder and your Gemini API key. The project is saved in the browser and shared by all three tools: Code Check quizzes you on it, Screen Map draws it, and Design Critic reviews it. None of the tools has its own upload or sign-in; **New code** on the home screen switches all three to a new version of the project.

The home screen has a **White / Black** switch.
