# Review Deck

### 👉 [**Open Review Deck**](https://yiftachneeman89.github.io/review-deck/) 👈

Three tools for reviewing your own project, in one place, and installable as a desktop app:

| | |
|---|---|
| [**Code Check**](https://yiftachneeman89.github.io/code-check/) | Quiz yourself on your own code. The card shows how much of the code you know and have mastered, your streak, today's goal and the last 7 days. |
| [**Screen Map**](https://yiftachneeman89.github.io/screen-map/) | Your Android app as a flow chart. The card shows how many screens and connections your app has, where it starts and how many buttons it has. |
| [**Design Critic**](https://yiftachneeman89.github.io/design-critic/) | A design review that doesn't go easy on you. The card shows your grade and score, open blockers, major and minor issues, and fix progress. |

All the sites live on the same GitHub Pages address, so they share the browser's storage. Your project is kept in that storage (and in your account, if you sign up - see below), but it does not stay only there: Review Deck sends your code to Google Gemini, with your own key, to list your features, explain code and make puzzles. This happens automatically after you sign in and each time you open the hub (unless a check from the last 6 hours exists). Code Check sends quiz snippets and your answers to Gemini too. Your key goes only to Google.

## Install it as an app

Open the site in Edge or Chrome and click **Install app** (or the install icon in the address bar). Review Deck then opens in its own window, and the three tools open inside it. Each tool has a **← Review Deck** link to come back.

## Open it every morning

Run `tools/enable-morning.bat` once. It creates a Windows scheduled task that opens Review Deck in its own window the first time you sign in, unlock or wake the PC each day. To undo it: `schtasks /delete /tn MorningReviewDeck /f`.

## Sign in once

The first time you open Review Deck it asks for your project folder and your Gemini API key. The project is saved in the browser and shared by all three tools: Code Check quizzes you on it, Screen Map draws it, and Design Critic reviews it. None of the tools has its own upload or sign-in; **New code** on the home screen switches all three to a new version of the project.

The home screen has a **White / Black** switch.

## Accounts and your phone

**Log in** / **Sign up** (`account.html`) saves your project, progress, settings and Gemini key to an account, so they're safe and other devices get them. Anyone who used Review Deck before gets a one-time "Want to sign up to save your data?" pop-up (asked again after a week if you choose *Not now*). While you're signed in, Review Deck and the three tools save on their own; each device keeps what it changed and takes the rest from the account.

**Open on phone** on the home screen shows a QR code. Scan it and Review Deck opens on the phone already signed in, with your project and progress. Each code works once, for 10 minutes, and the phone shows up as linked to your account. The phone can't link a project folder, so new code reaches it through the account after Review Deck on your computer picks it up.

Accounts live in the IntuiTeacher Guitar Firebase project (Firestore collection `review deck`); see `tools/account-setup.md`. Your code and key are then stored there too, readable only by your account and the phones you linked.
