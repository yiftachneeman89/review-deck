# Switching on accounts (about 5 minutes, free)

GitHub Pages only serves files, so accounts live in a free Supabase project.
Until `account-config.js` is filled in, Review Deck works exactly as before and shows no account buttons.

1. Go to <https://supabase.com>, click **Start your project**, and sign in with GitHub.
2. **New project**: any name (e.g. `review-deck`), a database password (you won't need it again), the region closest to you. Free plan.
3. When it's ready: **SQL Editor → New query**, paste all of `tools/account-setup.sql`, click **Run**. It should say "Success".
4. **Authentication → URL Configuration**: set **Site URL** to `https://yiftachneeman89.github.io/review-deck/account.html`.
5. Optional: **Authentication → Sign In / Providers → Email**: turn off **Confirm email** if you don't want to click a link in an email after signing up.
6. **Project Settings → API** (or **Data API**): copy the **Project URL** and the **anon public** key into `account-config.js`.
7. Publish (commit and push).

The anon key is meant to be public: the SQL turns on row-level security, so each account can only read and change its own row and its own project file.

What an account stores: every `rd.` / `cc.` / `sm.` / `dc.` setting from the browser (progress, quiz rounds, cached Gemini answers, your Gemini key) and the project files you picked. Free plan limits: 500 MB database, 1 GB files, 50 MB per file. A free project pauses after a week with no use at all; opening it again in the Supabase dashboard wakes it up.
