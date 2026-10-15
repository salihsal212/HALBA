# HALBA — the arena where talent gets seen

A real, deployable social app: login, profiles, and posting with photos and
video. Free to run: **Supabase** (database + login + file storage) +
**Cloudflare Pages** (hosting) + **GitHub Actions** (builds the Android APK).

```
Web app  ->  Cloudflare Pages (free)  https://halba.pages.dev
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

## 3. Deploy the web app (Cloudflare Pages)

Already set up: the GitHub repo is connected to Cloudflare Pages, so
**every push to `main` redeploys the site automatically** in ~30 seconds.

- Live URL: **https://halba.pages.dev**
- Build command: none. Output directory: `/` (root).
- Custom domain later: Cloudflare dashboard → Workers & Pages → halba →
  Custom domains.
- On a phone, the browser offers **Add to Home screen** — that installs it
  like an app (PWA).

> Supabase CORS: no setup needed — the publishable key works from any origin.

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
| `supabase/migration-002-claps-comments.sql` | Claps + typed comments (applied) |
| `supabase/migration-003-profiles-teams.sql` | Username/photo/about + teams with approval (applied) |
| `supabase/migration-004-signup-fields.sql` | DOB/gender/nationality/residence + private contact table (applied) |
| `supabase/migration-005-support.sql` | Support (one-way follow) (applied) |
| `supabase/migration-006-guardian.sql` | Ages 3+, guardian-managed flag for under-13s (applied) |
| `supabase/seed-demo.sql` | 12 fictional demo talents with posts, claps, comments, supports, 2 teams (applied; re-runnable; login `<username>@demo.halba.app` / `Halba2026!`; remove with `delete from auth.users where email like '%@demo.halba.app'`) |
| `manifest.webmanifest` / `sw.js` / `icons/` | PWA: installable, instant-open |
| `capacitor.config.json` / `package.json` / `scripts/copy-www.js` | Android wrapper |
| `.github/workflows/android-apk.yml` | Cloud APK builder |

## 6. Features in this MVP

- Email + password signup with name, city, and skill
- Feed of all posts, newest first (text, photo, or video ≤ 50MB)
- Clap (one per person) on posts; delete your own posts
- Typed comments — Appreciate, Suggest, or Ask — so fans, peers, and learners each have a way in
- Profiles: photo, unique @username, about, date of birth (ages 3+; only birth year and age bracket are public; under-13 accounts are guardian-managed with guardian name and mobile kept private), gender, nationality, country of residence, city, skill; optional mobile number kept in a private table only the owner can read; tap any name to open a profile
- Teams: anyone creates a team (page) and becomes its admin; players request to join, the admin approves or declines; approved teams show on the player's profile
- Support (one-way follow): Support button on profiles, supporters / supporting counts, tap to see the list
- Arena tools: search people by name, @username or talent; filter the feed by talent (list of talents members actually use, with counts)
- Talent suggestions while typing (signup, edit profile, create team): talents already on HALBA first, then a list of common ones; spelling is normalised so filters group correctly
- About HALBA page (from login screen and profile)
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
