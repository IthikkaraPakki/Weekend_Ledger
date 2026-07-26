# Weekend Time Ledger — PWA

Your original component, ported into a standalone installable PWA. No server, no
backend, no accounts — all data lives in the browser's `localStorage` on
whichever device you install it on.

## What changed vs. the original file

- `window.storage.get/set` (a Claude-artifact-only API) is now backed by real
  `localStorage` via `src/storagePolyfill.js`. The component itself
  (`src/WeekendTimeLedger.jsx`) is untouched — same logic, same UI.
- Added a manifest + service worker (`vite-plugin-pwa`) so it can be
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

## 3. Host it privately — Cloudflare Pages + Cloudflare Access

This gives you a real HTTPS URL that only you can open, with zero code and
no accounts/passwords to manage in the app itself. Free tier covers this
easily for personal use.

**A. Deploy the site (Cloudflare Pages)**
1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick your GitHub repo.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Deploy. You'll get a URL like `weekend-ledger.pages.dev` — at this point
   it's still publicly reachable by anyone with the link, so don't stop here.

**B. Lock it down (Cloudflare Access)**
1. In the same Cloudflare account, go to **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application domain: select your `*.pages.dev` URL (or a custom domain if you added one).
3. Add a policy: Action = **Allow**, Include = **Emails** → enter only your
   own email address.
4. Save.

Now visiting the site prompts for a one-time code sent to your email before
anything loads — nobody else can get in, and you didn't write a single line
of auth code.

**Custom domain (optional):** if you own a domain and add it to Cloudflare,
attach it to the Pages project in step A, then point the Access application
at that domain instead in step B.

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
