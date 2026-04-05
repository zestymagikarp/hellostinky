# HelloStinky — Deployment Guide
## From zero to app on your phone in ~15 minutes

---

## What you'll need (all free)
- A **Supabase** account → supabase.com
- A **Vercel** account → vercel.com
- A **GitHub** account → github.com
- Your **Anthropic API key** → console.anthropic.com

---

## Step 1 — Set up Supabase (5 min)

1. Go to **supabase.com** → New project
2. Give it a name like "hellostinky", pick a region close to you, set a password
3. Wait ~2 minutes for it to provision
4. Go to **SQL Editor** → New query
5. Open `supabase-schema.sql` from this folder, paste the entire contents, click **Run**
6. You should see "Success" — this creates all your tables
7. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

---

## Step 2 — Put the code on GitHub (3 min)

1. Go to **github.com** → New repository → name it "hellostinky" → Create
2. On your computer, open Terminal in the `hellostinky` folder and run:

```bash
git init
git add .
git commit -m "Initial HelloStinky app"
git remote add origin https://github.com/YOUR_USERNAME/hellostinky.git
git push -u origin main
```

_(Replace YOUR_USERNAME with your GitHub username)_

---

## Step 3 — Deploy to Vercel (3 min)

1. Go to **vercel.com** → Add New Project
2. Import your `hellostinky` GitHub repository
3. Vercel will detect it's a Vite project automatically — don't change any settings
4. Before clicking Deploy, click **Environment Variables** and add these 3 variables:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL from Step 1 |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key from Step 1 |
| `VITE_ANTHROPIC_KEY` | Your Anthropic API key |

5. Click **Deploy** — takes about 1 minute
6. Vercel gives you a URL like `https://hellostinky-abc123.vercel.app` — that's your app!

---

## Step 4 — Add to home screen (1 min per device)

**iPhone:**
1. Open Safari (must be Safari, not Chrome)
2. Go to your Vercel URL
3. Tap the Share button (box with arrow) → "Add to Home Screen"
4. Name it "HelloStinky" → Add
5. It now appears as an app icon on your home screen!

**Android:**
1. Open Chrome
2. Go to your Vercel URL
3. Tap the 3-dot menu → "Add to Home screen"
4. Done!

**Desktop:**
Just bookmark the URL — or in Chrome, click the install icon in the address bar.

---

## Step 5 — Invite your partner

1. Open the app → create your account
2. You'll be prompted to create a household — do that
3. You'll see a **6-letter invite code** (e.g. `AB12CD`)
4. Send that code to your partner via text
5. They download the app, create their account, choose "Join with code", enter the code
6. You're now in the same household — picks sync in real time!

---

## How it works day-to-day

- Every Monday, a fresh seasonal menu of 15-20 meals is curated for your household
- You each browse the menu and tap "Add to box" on meals you want
- The **Household box** tab shows both of your picks combined
- Go to **Grocery list** and tap "Build grocery list" to get a combined, optimized shopping list
- Check items off as you shop — both of you see the same list
- Add your own recipes in **My recipes**, or upload recipe PDFs — they get folded into future menus

---

## Updating the app later

Any time you want to make changes to the code, just push to GitHub:
```bash
git add .
git commit -m "Update something"
git push
```
Vercel automatically redeploys within ~30 seconds.

---

## Troubleshooting

**"Invalid API key" error** → Double-check your environment variables in Vercel. Make sure there are no spaces.

**Partner can't join** → Make sure they're entering the exact 6-character code. Codes are case-insensitive.

**Menu not generating** → Check your Anthropic API key has credits. You can test it at console.anthropic.com.

**Picks not syncing in real time** → Make sure you ran the full SQL schema — the last line enables realtime on the picks table.
