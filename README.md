# Weekend Time Ledger — PWA

This is a weekend time tracker ported into a standalone installable PWA. No server, no
backend, no accounts — all data lives in the browser's `localStorage` on
whichever device you install it on.

## What it contains

- `Backed by real
  `localStorage` via `src/storagePolyfill.js`. 
- A manifest + service worker (`vite-plugin-pwa`) so it can be
  "installed" on your phone/desktop and works offline.
- **Data does not sync between devices.** Install it on your phone, and your
  phone has its own ledger. This matches how the original worked (per-browser
  storage) — just now it's real, permanent storage instead of a demo API.

## 1. Run it locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. To test the installed/offline behavior:

```bash
npm run build
npm run preview
```

## 2. Put it on GitHub

```bash
git init
git add .
git commit -m "Weekend Time Ledger PWA"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

Your repo can be public or private — it doesn't matter for what follows,
since the *build output* is what gets hosted, not the repo itself.

## 3. Host it privately — Cloudflare Workers + Cloudflare Access

Cloudflare has merged "Pages" into a unified **Workers & Pages** product.
New projects deploy as a Worker with static assets attached, using
`wrangler deploy` instead of the old "pick a build output directory" Pages
flow. This repo already includes `wrangler.jsonc`, which tells Wrangler
where the built files are (`./dist`) — that's the one piece the old
instructions were missing.

**A. Deploy the site**
1. Cloudflare dashboard → **Workers & Pages** → **Create** → connect your GitHub repo.
2. Build configuration (the "Settings" tab you're looking at):
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy` (default — leave it)
   - Root directory: `/`
3. Push to `main`. The build runs, Wrangler reads `wrangler.jsonc`, uploads
   `dist/` as static assets, and deploys. You'll get a URL like
   `weekend-time-ledger.<your-subdomain>.workers.dev` — check the
   **Domains** tab for the exact address. At this point it's still publicly
   reachable by anyone with the link, so don't stop here.

**B. Lock it down (Cloudflare Access)**
1. Same account → **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application domain: paste the `.workers.dev` URL from the Domains tab
   (or a custom domain, if you've attached one there).
3. Add a policy: Action = **Allow**, Include = **Emails** → your own email
   address only.
4. Save.

Now visiting the site prompts for a one-time email code before anything
loads — nobody else can get in, and no auth code was added to the app
itself.

**Custom domain (optional):** attach it under the **Domains** tab on your
Worker, then point the Access application at that domain instead.

**Variables and secrets:** this app needs none — it's a static build with
no server-side calls, so leave that section empty.

## 4. Install it as an app

Once the Access-protected URL is live, open it on your phone (log in once)
and use "Add to Home Screen" (iOS Safari) or the install icon in the address
bar (Android Chrome / desktop Chrome/Edge). It'll behave like a native app.

## Notes / limitations

- Because storage is per-browser, if you clear site data/cookies on that
  device, your ledger resets. Consider occasionally exporting your data
  (see below) as a backup.
- Push notifications for quota completion only fire while the tab/app is
  open, same as the original — this wasn't changed.
- If you ever want cross-device sync or multi-user accounts later, that
  would need a small backend (e.g., Cloudflare D1 + Workers, or Supabase) —
  happy to help set that up when/if you want it.

### Quick manual backup

Your data is stored under two `localStorage` keys prefixed `wtl:local:`.
From the browser console on the app's page:

```js
copy(localStorage.getItem('wtl:local:weekend-time-ledger-v3'))
```

This copies the raw JSON to your clipboard — paste it somewhere safe. To
restore it later (same key), paste it back in with:

```js
localStorage.setItem('wtl:local:weekend-time-ledger-v3', PASTE_JSON_HERE)
```
