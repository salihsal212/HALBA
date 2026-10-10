# HALBA — the arena where talent gets seen

A real, deployable social app: login, profiles, and posting with photos and
video. Free to run: **Supabase** (database + login + file storage) +
**GitHub Pages** (hosting) + **GitHub Actions** (builds the Android APK).

```
Web app  ->  GitHub Pages (free)
Backend  ->  Supabase free tier (auth, Postgres, 1GB storage, 50MB/file)
Android  ->  APK built automatically by GitHub Actions (free)
```

---

## 1. Set up Supabase (10 minutes, once)

1. Go to <https://supabase.com> → sign up free → **New project**
   (any name, e.g. `halba`; pick a strong database password and save it).
2. When the project is ready, open **SQL Editor → New query**, paste the
   whole contents of `supabase/schema.sql`, press **Run**.
   This creates the tables, security rules, and the `media` storage bucket.
3. Open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key
4. Paste both into `config.js` in this folder.
5. For easy testing: **Authentication → Providers → Email** →
   turn **off** "Confirm email". (Turn it back on before a public launch.)

## 2. Run it locally (optional)

Any static server works:

```
cd halba-app
python -m http.server 8000
# open http://localhost:8000
```

## 3. Deploy the web app (GitHub Pages)

1. Create a new GitHub repository (e.g. `halba`) and push this folder to it
   (`main` branch).
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: `main`, folder `/ (root)` → Save.
3. Your app is live at `https://<your-username>.github.io/halba/`.
   On a phone, the browser will offer **Add to Home screen** — that installs
   it like an app (PWA).

> Supabase CORS: no setup needed — the anon key works from any origin by
> default.

## 4. Get the Android APK

The GitHub Actions workflow in `.github/workflows/android-apk.yml` builds
the APK in the cloud on every push:

1. Push to `main` (step 3 already did this). The build also runs if you
   open **Actions → Build Android APK → Run workflow**.
2. Wait ~5–8 minutes, open the finished run, and download
   **halba-debug-apk** from the *Artifacts* section at the bottom.
3. Unzip it → `app-debug.apk`. Send it to any Android phone (WhatsApp,
   Drive, USB) and install it (allow "install from unknown sources").

Notes:
- This is a **debug APK** — perfect for testing and demos. Publishing on
  Google Play later needs a signed release build ($25 one-time Play
  Console fee) — ask Claude when you reach that stage.
- The APK contains the same web app, so it uses the values in `config.js`
  **at the time you pushed**. Change config → push → rebuild.

## 5. What's inside

| File | Purpose |
|---|---|
| `index.html` / `styles.css` / `app.js` | The whole app (no build step) |
| `config.js` | Your Supabase URL + anon key (the only file you must edit) |
| `supabase/schema.sql` | Database tables, security policies, storage bucket |
| `manifest.webmanifest` / `sw.js` / `icons/` | PWA: installable, instant-open |
| `capacitor.config.json` / `package.json` / `scripts/copy-www.js` | Android wrapper |
| `.github/workflows/android-apk.yml` | Cloud APK builder |

## 6. Features in this MVP

- Email + password signup with name, city, and skill
- Feed of all posts, newest first (text, photo, or video ≤ 50MB)
- Like / unlike; delete your own posts
- Profile page with post count and likes earned
- Row-level security: users can only write as themselves; everyone can read

## 7. Costs & limits (free tier)

- Supabase free: 500MB database, 1GB file storage, 50MB per file,
  50,000 monthly active users for auth. Enough for a pilot.
  When storage fills up, the upgrade is $25/month.
- A Supabase free project **pauses after ~1 week with zero traffic** —
  just press "Restore" in the dashboard, nothing is lost.

## 8. Security notes

- The `anon` key is designed to be public — safety comes from the
  row-level-security policies in `schema.sql`, which are already strict.
- Never share the `service_role` key from the Supabase dashboard.
