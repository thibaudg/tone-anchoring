# Tone Anchoring

A private, mobile-first web app for the Chinese tone-anchoring repository: search every character and word, read the mnemonic story, capture new things in an inbox for Claude, and see every change with undo. Static front end (no build step), hosted free on **GitHub Pages**. Same look as Matrix & Mind.

**It shares Matrix & Mind's Supabase project.** The free plan allows two active projects and both are in use, so the tone tables live in their own `tones` schema inside the Matrix & Mind project. Matrix & Mind's tables stay in `public` and aren't touched. Same login for both apps; two separate apps, each with its own web address and home-screen icon.

`config.js` already holds Matrix & Mind's project URL and publishable key. Add `?demo` to the URL for demo mode on sample data (nothing is saved).

---

## What's in here

| File | What it is |
|---|---|
| `index.html` | Markup: sign-in, repository, changes, sheets |
| `styles.css` | Design (Matrix & Mind style, tone colours) |
| `app.js` | All logic and Supabase calls, plus demo mode |
| `config.js` | Supabase URL + publishable key (Matrix & Mind's project, already filled in) |
| `vendor/supabase.js` | Supabase client library, bundled (same file as Matrix & Mind) |
| `manifest.webmanifest`, `icon.svg`, `*.png` | App icon (调 diào, "tone") and Add to Home Screen support |

The database schema is `../schema.sql` (one folder up).

---

## One-time setup (about 10 minutes)

All in the **Matrix & Mind** Supabase project.

### 1. Create the tables
1. **SQL Editor** → **New query**.
2. Paste the whole of `schema.sql` (one folder up) and click **Run**. You should see "Success".
   It only creates the `tones` schema and its tables, functions and rules. Nothing in `public` changes.

### 2. Let the app read the `tones` schema
**Project Settings** → **Data API** → **Exposed schemas**: add `tones` next to `public`, and save.
Without this, the app shows "Couldn't load your repository".

### 3. Allow your account into the tone data
You sign in with your **Matrix & Mind account**. In the **SQL Editor**, run (with that account's email):
```sql
insert into tones.owners (user_id)
select id from auth.users where email = 'YOUR_EMAIL'
on conflict do nothing;
```
Until this runs, you can sign in but the repository looks empty.

About sign-ups: Matrix & Mind has a "Create an account" button. If sign-ups are on for the project, anyone could create an account, but only accounts listed in `tones.owners` can see or change tone data. If you don't need new Matrix & Mind accounts either, turn sign-ups off: **Authentication** → **Sign In / Providers** → **Allow new users to sign up** → off.

### 4. Publish on GitHub Pages
1. New GitHub repo (e.g. `tone-anchoring`), separate from Matrix & Mind. Public is fine: no secrets live in these files, and your data stays in Supabase behind sign-in.
2. Push the files in this folder:
   ```bash
   git init
   git add .
   git commit -m "Tone Anchoring"
   git branch -M main
   git remote add origin https://github.com/<your-username>/tone-anchoring.git
   git push -u origin main
   ```
3. GitHub → **Settings** → **Pages** → Source: **Deploy from a branch** → `main`, `/ (root)` → **Save**.
4. After a minute: `https://<your-username>.github.io/tone-anchoring/`.
5. If Matrix & Mind uses email confirmation links, add this URL too under **Authentication → URL Configuration → Redirect URLs** (not needed for plain email + password sign-in).

### 5. On your iPhone
Open the URL in Safari → Share → **Add to Home Screen** (icon: 调). Sign in once with your Matrix & Mind account; it stays signed in.

---

## Connecting Claude

1. In Claude (web or desktop): **Settings → Connectors** → add **Supabase**, sign in, limit it to the Matrix & Mind project and to database features. Keep tool-call approval on.
2. It then works in the Claude mobile app too.
3. **Important, because the project is shared:** the Supabase connector can only be limited to a whole project, not to a schema. Claude could therefore also read Matrix & Mind's tables (matrices and thought records). Guardrails: keep approval on so you see every query, and keep the rule below in the Claude project instructions. The full fix is a custom connector that only offers actions on the `tones` tables (planned for later).
4. How Claude should work with the data:
   - **Only touch the `tones` schema.** Never read or change anything in `public` (Matrix & Mind).
   - **Process the inbox**: read `tones.inbox` rows with `status = 'pending'`. For each, insert or update `tones.entries`, then set the inbox row to `status = 'processed'`, `result_note` (e.g. "Added 消失", "Updated 等 · scene"), `entry_ids`, `processed_at = now()`. Use `dismissed` for items that lead to no change.
   - **Rework items** have `about_entry_id` set: that entry is the one to replace.
   - **Never shorten a story**; edit only what was asked.
   - Every change is recorded automatically in `tones.history` and can be undone from the app's Changes page.
   - Counts for a stats update: `select * from tones.repo_stats;`

---

## Using the app

- **Search** (always at the top): characters, pinyin with or without tone marks (`hao` finds hǎo, `jin3` finds only third-tone jin), meaning, story, components, tags, and inbox text. While searching, rows show a 2-line story preview.
- **Tap a row** to open it in place: full story, components, related words or characters, details, **Edit** (story and components) and **Rework** (sends a linked note to the inbox so Claude replaces the entry).
- **＋** adds anything to the inbox. Inbox items can be edited or deleted until Claude processes them.
- **⇅** groups by tone, radical, HSK level, date added or nothing; sorts by pinyin or recently changed; filters by tone. Remembered on each device.
- **⋯** shows the counts, **Changes** (who changed what, with Undo), **Export JSON** (full backup), and Sign out.
- The app reloads its data when you come back to it after 30 seconds away, so Claude's changes show up.

---

## Local preview
```bash
python3 -m http.server 8000
```
then open http://localhost:8000 (signs in to the real project) or http://localhost:8000/?demo for demo mode.

## Notes
- Every `git push` to `main` redeploys automatically.
- Schema `tones` (in the Matrix & Mind project): tables `entries` (one row per character reading or word), `inbox`, `history` (written by a database trigger), `owners` (who may use the app); view `repo_stats`; function `undo_change`.
