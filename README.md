# Status Update Cleaner — deployment guide

A simple tool for project managers. Paste your raw notes from a call or coffee chat — get back a structured stakeholder update in seconds. Built with Claude AI and deployed on Vercel.

This turns messy notes into a structured stakeholder update. It has two parts:

- `index.html` — the page people use (already built)
- `api/generate.js` — a small backend function that holds your real API key
  and talks to Claude. The key never touches the browser.

You do **not** need to know how to code to deploy this. Follow the steps below.

## 1. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up
   or log in. This is separate from your regular claude.ai account.
2. Add a payment method and, if you can, set a monthly spending limit —
   Settings → Billing. Given the cost per generation is roughly a cent or
   two, a $10–20/month limit is plenty of headroom while testing.
3. Go to **API Keys** and create a new key. Copy it somewhere safe — you
   won't be able to see it again after you leave the page.

## 2. Get a free Vercel account

Go to [vercel.com](https://vercel.com) and sign up (the free "Hobby" tier
covers this comfortably).

## 3. Deploy

The easiest path is connecting a GitHub repo:

1. Create a new, empty repository on [github.com](https://github.com).
2. Upload the contents of this folder (`index.html`, `api/generate.js`,
   `package.json`) to that repository.
3. In Vercel, click **Add New → Project**, and import that GitHub repo.
4. Before clicking Deploy, open **Environment Variables** and add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: the key you copied in step 1
5. Click **Deploy**. Vercel gives you a live URL
   (something like `status-update-cleaner.vercel.app`) within a minute or two.

If you'd rather not use GitHub, Vercel's CLI also works — from a terminal,
inside this folder: `npx vercel`, follow the prompts, then set the same
environment variable in the Vercel dashboard afterward and redeploy.

## 4. Test it

Open your live URL, paste in some notes, click Generate. It should behave
exactly like the version you tested inside Claude — except this one keeps
working after this conversation ends, and other people can use it too.

## Things worth knowing before sharing it widely

- **CORS is currently wide open** (`Access-Control-Allow-Origin: *`). Fine
  for testing; once you have a real domain, tighten this in
  `api/generate.js` to just that domain.
- **The rate limiter is basic.** It's in-memory, so it resets whenever the
  function cold-starts and doesn't coordinate across multiple instances.
  It'll blunt casual abuse but won't stop someone determined. If this gets
  real traffic, the next step is a persistent store like Upstash Redis
  (has a free tier, pairs well with Vercel) — happy to wire that in when
  you're there.
- **Notes are capped at 4000 characters** per request, mainly to keep any
  one request's cost predictable.
