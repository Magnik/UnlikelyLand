# UnlikelyLand — Android (Capacitor) future notes

Not implemented in MVP. This is the plan so the web build stays Android-ready.

## How Capacitor will wrap the PWA

Capacitor packages the web app as a native Android (and iOS) shell that hosts a WebView. Two hosting models:

1. **Remote (recommended to start):** the shell points at the live `https://DOMAIN`. Ship updates by deploying the web app — no Play Store resubmission for content changes. Set `server.url` in `capacitor.config`.
2. **Bundled:** copy a static export into the shell and ship it inside the APK. More work for a Next.js app that uses a server proxy; defer.

Rough setup when the time comes:

```bash
# in apps/web (or a dedicated apps/mobile)
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init UnlikelyLand land.unlikely.app
# point at the deployed web app
#   capacitor.config.ts → server: { url: 'https://DOMAIN', cleartext: false }
npx cap add android
npx cap sync
npx cap open android   # build/run in Android Studio
```

## API base URL configuration

The browser/PWA path uses **same-origin `/api/*`** proxied by Next.js, so there is no API URL in the client. The native shell loads from a **different origin** (the app), so it must call the API **directly** at `https://DOMAIN/api/...`.

To keep one client codebase, introduce a small base-URL resolver in `apps/web/src/lib/api.ts`:

- Web/PWA → `''` (same-origin `/api`).
- Capacitor (detect via `Capacitor.isNativePlatform()` or a build flag) → `https://DOMAIN`.

Then add the app's origin to `CORS_ORIGINS` in the API `.env` (the API already reads and honours it). The JWT-in-`localStorage` Bearer scheme works unchanged in the WebView; for stronger storage use a Capacitor secure-storage plugin later.

## Notifications (later)

- Add `@capacitor/push-notifications` + Firebase Cloud Messaging.
- Server side: store device tokens per user; a worker (BullMQ on the already-provisioned Redis) sends pushes for "stamina full", "you were revived", "expedition event", guild pings, etc.
- Respect a per-user notification preference.

## Deep links (later)

- Configure Android App Links for `https://DOMAIN/...` so links open the app.
- Map routes (`/play`, `/profile`, a future `/guild/:id`) to in-app navigation.

## What must be true before a signed APK

- [ ] Web app deployed at a stable HTTPS `DOMAIN` (done via Caddy).
- [ ] `CORS_ORIGINS` includes the native app origin.
- [ ] API base-URL resolver handles native vs. web.
- [ ] PWA manifest + icons finalised (manifest + SVG icon already present; add PNG densities).
- [ ] App identity: package id (`land.unlikely.app`), version code/name, signing keystore (kept secret, **never** committed).
- [ ] Play Store assets: privacy policy URL, content rating questionnaire (the in-game `family/pg13/r` setting maps cleanly), screenshots.
- [ ] Basic native QA on a couple of devices/Android versions.
