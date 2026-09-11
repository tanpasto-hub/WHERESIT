# Where'd I Put It

A personal thing-finder app. Add items and where you put them, then find them later by typing or by voice — with AI matching so "specs" finds "glasses" and "where's my passport?" pulls up the right entry.

Runs on any device (phone, tablet, laptop). Installs to your phone's home screen like a real app. Each user has their own private list.

**Stack:** Next.js + Supabase (database + login) + Google Gemini (AI matching) + Vercel (hosting). Everything is free tier.

---

## Before you start

You'll need free accounts on these — sign up in a new tab, don't do anything else yet:

1. **GitHub** — https://github.com (stores your code)
2. **Supabase** — https://supabase.com (database + login, sign in with GitHub)
3. **Google AI Studio** — https://aistudio.google.com (Gemini API key)
4. **Vercel** — https://vercel.com (hosts the app, sign in with GitHub)

And install these on your computer:

1. **Node.js** — https://nodejs.org — download the "LTS" version and run the installer, defaults are fine. This lets your computer run the app.
2. **VS Code** — https://code.visualstudio.com — a code editor. Free.
3. **Git** — On Mac it's already there. On Windows: https://git-scm.com/download/win, defaults are fine.

After installing Node, open a terminal (Mac: **Terminal** app; Windows: **PowerShell** or **Command Prompt**) and check it worked:

```
node --version
```

You should see something like `v20.11.0`. If you see "command not found," close the terminal, reopen it, and try again.

---

## Step 1 — Get the code onto your computer

Unzip the project folder somewhere you'll remember (e.g. `Documents/wdipi`). Open **VS Code**, then **File → Open Folder** and pick that folder.

Open the built-in terminal in VS Code: **Terminal → New Terminal**. You'll run all commands here.

Install the dependencies:

```
npm install
```

This downloads all the libraries the app uses. Takes 1–2 minutes. You'll see a `node_modules` folder appear — that's normal.

---

## Step 2 — Set up Supabase (database + login)

1. Go to https://supabase.com and sign in.
2. Click **New project**.
3. Fill in:
   - **Name:** `wdipi` (or anything)
   - **Database Password:** click "Generate a password" and save it in your notes (you won't need it often, but keep it)
   - **Region:** pick the one closest to you
4. Click **Create new project**. Wait ~2 minutes for it to finish setting up.

### Create the database table

1. In the left sidebar click **SQL Editor**.
2. Click **New query**.
3. Open the file `schema.sql` in this project (it's in VS Code's file list on the left).
4. Copy the entire contents, paste into the Supabase SQL Editor, and click **Run** (bottom right).
5. You should see "Success. No rows returned." That's correct — you just created the `items` table.

### Get your Supabase keys

1. In the Supabase sidebar click **Settings** (gear icon at the bottom), then **API**.
2. Copy these two values somewhere temporary (a notepad):
   - **Project URL** — looks like `https://abcdefg.supabase.co`
   - **anon public** key (under "Project API keys") — a long string starting with `eyJ...`

### (Optional but recommended for setup) Turn off email confirmation

While you're testing, this makes life easier — you can sign in immediately after signing up without checking email.

1. In Supabase sidebar: **Authentication → Providers → Email**.
2. Scroll to **Confirm email**, toggle it **off**.
3. Click **Save**.

You can turn it back on later once the app is live.

---

## Step 3 — Get a Gemini API key (for the AI voice search)

1. Go to https://aistudio.google.com and sign in with a Google account.
2. Click **Get API key** in the left sidebar (or top right).
3. Click **Create API key**.
4. If it asks which project, pick any (or create a new one).
5. Copy the key. It starts with `AIza...`. Save it in your temporary notepad.

The free tier is plenty for personal use — a few thousand searches a day.

---

## Step 4 — Add your keys to the app

In VS Code, find the file `.env.local.example` in the file list. Right-click it → **Copy**, then **Paste**. Rename the copy to exactly `.env.local` (note the leading dot).

Open `.env.local` and paste your three values in place of the placeholders:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your key...
GEMINI_API_KEY=AIza...your key...
```

Save the file (Cmd+S / Ctrl+S).

> These are secrets. `.gitignore` already prevents `.env.local` from being uploaded to GitHub. Don't paste them anywhere public.

---

## Step 5 — Run the app on your computer

In the VS Code terminal:

```
npm run dev
```

You'll see:

```
▲ Next.js 14.2.15
- Local:        http://localhost:3000
```

Open http://localhost:3000 in your browser. You should see the login screen. Click **New here? Create an account**, enter any email and a password (6+ characters), and click **Create account**.

If email confirmation is off (Step 2), you'll be signed in right away. If it's on, check your email for the confirmation link, click it, then sign in.

**Try it:**
- Add an item ("Passport" → "top desk drawer, red pouch"). It saves to Supabase.
- Type a search ("where is my passport"). Gemini finds it.
- Click the mic (in Chrome/Edge/Safari) and speak. Voice-to-text → AI search.
- Refresh the page. Items still there.
- Open another browser or your phone on the same wifi (`http://your-computer-ip:3000`) — sign in, same items sync.

Press **Ctrl+C** in the terminal to stop the server when done.

**If something's broken here, don't push to the internet yet.** See the Troubleshooting section at the bottom.

---

## Step 6 — Put the code on GitHub

Vercel deploys from GitHub, so first push your code there.

1. Go to https://github.com/new (must be signed in).
2. **Repository name:** `wdipi` (or anything). Keep it **Private**. Don't tick any of the "Add a README" boxes. Click **Create repository**.
3. GitHub shows you commands. Ignore those; use these in your VS Code terminal instead:

```
git init
git add .
git commit -m "First commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/wdipi.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username. If it asks for a password, GitHub wants a "personal access token" — go to https://github.com/settings/tokens, click **Generate new token (classic)**, tick the **repo** box, generate, copy the token, use that as the password.

Refresh your GitHub repo page — you should see all your files. **Check that `.env.local` is NOT there.** If it is, something's wrong with `.gitignore`.

---

## Step 7 — Deploy to Vercel (put it on the internet)

1. Go to https://vercel.com/new and sign in with GitHub.
2. Under **Import Git Repository**, find `wdipi` and click **Import**. (If you don't see it, click "Adjust GitHub App Permissions" and grant Vercel access to the repo.)
3. Vercel auto-detects Next.js — don't change anything in **Framework Preset** or **Build Command**.
4. Expand **Environment Variables** and add all three from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
   - `GEMINI_API_KEY` = your Gemini key
5. Click **Deploy**. Wait ~2 minutes.

When it's done, Vercel shows a URL like `wdipi-xyz.vercel.app`. That's your live app. **Open it and sign in with the account you made earlier** — your items should already be there (same Supabase database).

### Tell Supabase about the new URL

1. In Supabase: **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel URL (`https://wdipi-xyz.vercel.app`).
3. Under **Redirect URLs**, add both `https://wdipi-xyz.vercel.app/**` and `http://localhost:3000/**`.
4. Click **Save**.

This makes sure email links work in both dev and production.

---

## Step 8 — Install it on your phone

On your phone, open the Vercel URL in the browser.

**iPhone (Safari):** Tap the **Share** button (square with an arrow) → scroll to **Add to Home Screen** → **Add**.

**Android (Chrome):** Tap the **⋮** menu → **Add to Home screen** or **Install app**.

Now there's an icon on your home screen. Tap it and it opens like a native app — no browser bars, mic works, everything syncs with your other devices.

---

## You're done

To keep improving the app: edit files in VS Code, test locally with `npm run dev`, then push changes:

```
git add .
git commit -m "what you changed"
git push
```

Vercel auto-deploys every push.

---

## Sharing with others

Anyone can go to your Vercel URL and sign up — they get their own private list. Supabase's row-level security means users can only see their own items.

---

## Troubleshooting

**"command not found: node" / "command not found: npm"**
Node isn't installed or your terminal was open before you installed it. Reinstall from nodejs.org, close every terminal, open a new one.

**`npm install` fails with permission errors**
On Mac/Linux, don't use `sudo`. Fix by running `sudo chown -R $(whoami) ~/.npm` once, then try again.

**App loads but shows a blank screen or "Application error"**
Check the browser console (right-click → **Inspect** → **Console** tab). Most likely `.env.local` values are wrong or missing. Stop the server (Ctrl+C), fix them, restart with `npm run dev`.

**Sign up says "Database error saving new user"**
The `items` table or its policies aren't set up. Re-run the SQL from `schema.sql` in Supabase.

**Sign up works, sign in fails with "Invalid login credentials"**
Email confirmation is still on and you haven't clicked the link. Either check email or turn off confirmation in Supabase (Step 2).

**Voice mic button doesn't appear**
The browser doesn't support the Web Speech API. Use Chrome, Edge, or Safari. On iPhone use Safari; on Android use Chrome.

**Voice button appears but nothing happens on tap**
The site needs mic permission. On phone: allow mic access when prompted. Voice recognition also needs HTTPS — it works on Vercel's URL but might not on `http://localhost` on some browsers.

**AI search says "AI search failed"**
Your Gemini key is wrong, missing, or the free-tier quota is used up. Double-check the key in Vercel → Settings → Environment Variables and redeploy.

**Deployed app can't sign in but local works**
You didn't add the Vercel URL to Supabase's allowed redirect URLs (Step 7 last section).

**Changed environment variables in Vercel but the app still uses the old ones**
Vercel needs to redeploy. Go to your project → **Deployments** → find the latest → **⋯** → **Redeploy**.

---

## File map

```
wdipi/
├── package.json           dependencies list
├── next.config.mjs        Next.js config
├── jsconfig.json          path aliases
├── .env.local.example     template for your secrets (copy to .env.local)
├── .gitignore             files git ignores
├── schema.sql             database setup — paste into Supabase SQL Editor
├── middleware.js          protects pages from unauthenticated users
├── app/
│   ├── layout.js          root HTML with PWA meta
│   ├── globals.css        styles + fonts
│   ├── page.js            main app screen
│   ├── login/page.js      login + signup screen
│   └── api/search/route.js  server route that calls Gemini
├── lib/
│   ├── supabase-browser.js  Supabase client for React components
│   └── supabase-server.js   Supabase client for server code
└── public/
    ├── manifest.json      PWA install manifest
    ├── icon-192.png       app icon (small)
    ├── icon-512.png       app icon (large)
    └── favicon.ico        browser tab icon
```
