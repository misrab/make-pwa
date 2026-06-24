# make-pwa

Turn a React/Vite app into an installable PWA with a mobile install banner —
**one component + one command**. Built to be dropped into any subapp.

## What you get

- A **mobile install banner**: on phones, when the app isn't already installed
  and the user hasn't dismissed it, a slim banner appears.
  - Android / desktop Chrome → one-tap **Install** button (`beforeinstallprompt`).
  - iOS Safari → "Add to Home Screen" instructions (the only path Apple allows).
  - Once installed, the app opens chrome-less with your logo, like a native app.
- A generated **logo** (icons + favicon + manifest) — a simple lettermark, or
  bring your own SVG.
- A minimal **service worker** (installability + web push; no asset caching).

## Install

From GitHub (no publish needed):

```bash
npm i github:misrab/make-pwa
```

## Use (2 steps)

**1. Scaffold the static assets** (run from the dir holding `index.html` and
`public/`, e.g. a Vite app root):

```bash
npx make-pwa init --name "pi" --color "#0f1117"
```

This writes `public/{manifest.json,sw.js,favicon.svg,icon-*.png,apple-touch-icon.png}`
and patches the `<head>` of `index.html` (idempotent — safe to re-run).

**2. Mount the banner** near the top of your app tree:

```tsx
import { PwaInstall } from "make-pwa";

export function App() {
  return (
    <>
      <PwaInstall appName="pi" />
      {/* ...rest of app */}
    </>
  );
}
```

`PwaInstall` also registers the service worker for you on mount.

## Requirements (so it "just works")

The browser only offers to install a PWA when **all** of these hold — the
scaffold sets them up, but the app must be *served* correctly:

- **Secure context** — HTTPS, or `localhost` for dev. The install prompt never
  fires on plain `http://` to a remote host.
- **One app per hostname** — give each app its **own hostname** (e.g.
  `app.example.com`), not a shared host on a different port. Chrome on Android
  keys a PWA's install identity on the **hostname and ignores the port**, so
  `host:8443` and `host:9445` collide — only the first installs, the rest show
  "Open <first app>". Distinct hostnames = distinct origins = independent
  installs. (Different ports work on desktop but not Android — don't rely on it.)
- **Served at the origin root** — `/manifest.json`, `/sw.js` and the icons must
  resolve. Vite copies `public/*` to the build root, so this is automatic once
  each app has its own origin.
- **A service worker with a `fetch` handler** — Chrome refuses to fire
  `beforeinstallprompt` without one. The generated `sw.js` includes a no-op
  pass-through handler for exactly this reason; don't remove it.

On Android/desktop Chrome the banner appears once Chrome has decided the app is
installable (often the second visit, after the SW is controlling the page). On
iOS it shows the "Add to Home Screen" hint immediately.

## CLI options

```
make-pwa init --name "<App>" [options]

  --name <str>      App name (required)
  --short <str>     Home-screen short name (default: name)
  --color <hex>     Icon background + manifest background_color (default: #0f1117)
  --theme <hex>     theme_color / status bar color (default: --color)
  --letter <char>   Icon letter (default: first letter of name)
  --fg <hex>        Icon letter color (default: auto-contrast)
  --logo <file.svg> Use this SVG instead of a generated lettermark
  --public <dir>    Static dir (default: public)
  --html <file>     index.html to patch (default: index.html)
```

## Component API

```ts
<PwaInstall
  appName="pi"               // required — used in banner copy
  accentColor="#7c9cff"      // Install button + icon color
  swPath="/sw.js"            // service worker path
  storageKey="..."           // override the dismissal localStorage key
  registerServiceWorker      // default true; set false to register elsewhere
/>
```

Also exported: `useIsMobile()` and `registerSW(path?)`.

## Notes

- Vite copies `public/*` to the build root, so `/manifest.json` and `/sw.js`
  are served at the origin root with the right scope automatically.
- The service worker intentionally does no asset caching. For offline support,
  migrate to `vite-plugin-pwa`.
