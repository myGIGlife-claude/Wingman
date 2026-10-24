# Wingman

A Torn helper that plans travel/buy runs around your Organized Crime (OC). It watches your status, foreign stock and OC timer, then tells you the next step through a home-screen widget and notifications.

**You tap every action.** Wingman only reads the Torn API (`api.torn.com`, read-only) and public foreign stock data from [YATA](https://yata.yt). It never travels, buys, trains or clicks for you. Widget and notification buttons only open a Torn page; the Torn PDA userscript only highlights things and fills in the quantity box.

## Parts
- `backend/`: Node/TypeScript service on Google Cloud Run. A scheduler calls `/tick` every minute, which checks Torn and YATA, works out the next step and pushes updates (Firebase Cloud Messaging).
- `android/`: the widget, alerts and settings screen.
- `userscript/wingman.user.js`: Torn PDA script (buy-max pre-fill, live stock read from the shop page).

## Install the app (from your phone)
1. On GitHub open **Actions → Android → latest green run → Artifacts → wingman-debug-apk**, download and install it (allow installs from your browser).
2. Open Wingman, allow notifications, enter your backend URL and app secret, tap **Connect and load**.
3. Pick your destination, item, flight type and carry capacity, then **Save settings**.
4. Tap **Battery: set Unrestricted** and also add Wingman to **Never sleeping apps** (Samsung otherwise kills background work).
5. Long-press the home screen, **Widgets → Wingman**.

## Install the userscript (Torn PDA)
Add `userscript/wingman.user.js` in Torn PDA's userscripts. Optionally enter your backend URL and app secret in its settings panel so the widget and PDA stay in sync.

## Host your own backend
You need a Google Cloud project with billing, Firestore (Native mode), Secret Manager, Cloud Run, Cloud Scheduler and a Firebase Android app (`com.wingman.app`).
1. Secrets: `TORN_API_KEY` (a Limited key is enough), `APP_SECRET` and `TICK_SECRET` (random 32 bytes each).
2. Build `backend/` with its Dockerfile and deploy to Cloud Run (min 0, max 1 instance), exposing the three secrets as environment variables. Allow unauthenticated access; every route checks a header secret instead.
3. Cloud Scheduler: `POST <run-url>/tick` every minute with header `X-Tick-Key: <TICK_SECRET>`.
4. The app and script send `X-Wingman-Key: <APP_SECRET>`.
5. CI builds the APK from `android/`; add your `google-services.json` base64-encoded as the `GOOGLE_SERVICES_JSON_B64` repository secret.

## Develop
`cd backend && npm test` (Node 24 runs the TypeScript tests directly). Android: `cd android && ./gradlew :app:assembleDebug`.

Foreign stock data from YATA is player-reported and can be minutes old; the widget shows how old it is.
