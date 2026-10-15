# Switching on accounts (Firebase, about 3 minutes)

Accounts use the IntuiTeacher Guitar Firebase project (`firestorelearning-d6dc8`), in a new Firestore
collection called **review deck**. It only uses Authentication and Firestore, so the free Spark plan is enough.
Until `account-config.js` has an `apiKey`, Review Deck works as before and shows no account buttons.

1. <https://console.firebase.google.com> → the IntuiTeacher Guitar project → ⚙ **Project settings** → **Your apps** → **Add app** → **Web** (`</>`). Name it `Review Deck`, no hosting. Copy `apiKey` and `appId` from the config it shows into `account-config.js`.
2. **Authentication → Sign-in method**: make sure **Email/Password** is on, and turn on **Anonymous** (the phone uses it when you scan the QR code).
3. **Authentication → Settings → Authorized domains**: add `yiftachneeman89.github.io`.
4. **Firestore Database → Rules**: paste `tools/firestore-rules.txt` *inside* the existing `match /databases/{database}/documents { … }` block, next to the guitar app's rules (don't replace them), then **Publish**.
5. Publish Review Deck (commit and push).

Review Deck accounts share the user list with IntuiTeacher Guitar, so the same email and password work in both.

What's stored, per account: `review deck/{uid}` (owner, email, linked phones, timestamps),
`…/state/*` (every `rd.` / `cc.` / `sm.` / `dc.` setting: progress, quiz rounds, cached Gemini answers, your Gemini key),
`…/project/*` (the project files, gzipped, in parts under 1 MB) and `…/links/*` (Open on phone codes).
