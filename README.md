# Wingman

**A home-screen widget and alert system for Torn City travel runs around your Organized Crime (OC).**

Wingman watches your status, your OC timer and foreign shop stock. It tells you the next step on a widget, and pings you when something needs doing: your item is in stock, it's time to fly home, or your OC is ready. You do every action yourself.

```
┌──────────────────────────────────────┐
│ THE ZOO - NIGHT SHIFT     ● HOME     │
│ CrombieCrunch                        │
│ HEALTH ████████████  ENERGY ████████ │
│ ● JAIL · FREE   ● HOSPITAL · OK      │
│ ┌──────────────────────────────────┐ │
│ │ OC READY IN      ● FLY WINDOW OPEN│ │
│ │  [ 62:14:07 ]   [ 3d 04h ]       │ │
│ │  OC READY IN     FLY LOCKS IN    │ │
│ └──────────────────────────────────┘ │
│  [ FLY ]  [ GYM ]  [CRIMES]  [ITEMS] │
└──────────────────────────────────────┘
```

## Contents
- [What it does](#what-it-does)
- [The rules it follows](#the-rules-it-follows)
- [How it works](#how-it-works)
- [What you need](#what-you-need)
- [Setup, step by step](#setup-step-by-step)
- [Using it](#using-it)
- [Troubleshooting](#troubleshooting)
- [Cost](#cost)
- [Security](#security)
- [Develop](#develop)
- [Credits and disclaimer](#credits-and-disclaimer)

## What it does

- **Live widget** with your name, faction, health, energy, jail and hospital status.
- **OC timer** that turns green, yellow, then red as your fly window closes.
- **Fly lock.** The Fly button greys out when a round trip plus a safety buffer (90 minutes by default) no longer fits before your OC. You can't open the travel page from the widget and miss your OC by accident.
- **Quick buttons** for Fly, Gym, Crimes and Items. Each one opens the right Torn page in Torn PDA.
- **Abroad view** with a leave-by timer next to the OC timer, your item's stock and price, how many you can buy (limited by cash, carry capacity and shelf stock), and a **BOUGHT** button.
- **Restock estimate.** When your item is sold out, Wingman shows a countdown to the likely restock. It learns each item's restock rhythm from the stock changes it sees, so the estimate improves over time.
- **In-flight view** with a landing countdown and progress bar.
- **Alerts you can switch on and off one by one:** ready to fly, landed in stock or sold out, back in stock, leave within 5 minutes, leave now, back home, OC ready, out of hospital or jail, and optionally health, energy and nerve full and drug, booster and medical cooldowns over. Find them under **Alerts** in the app.
- **Customizable layout.** Choose which bars, chips, panels and tiles show, and which quick buttons appear.
- **Torn PDA userscript** (optional) that pre-fills the buy quantity on the shop page.

## The rules it follows

Torn's scripting rules allow software to use only API data, or a page you loaded yourself and are viewing. Wingman is built around that:

- It **never travels, buys, trains, uses items or does crimes for you.** Every widget and notification button only opens a Torn page. You tap Torn's own button.
- The backend talks to Torn only through the **read-only API** (`api.torn.com`). It never calls Torn pages, never logs in, never stores cookies or sessions.
- The only other data source is the public stock export from [YATA](https://yata.yt).
- The userscript may only change what a page you're viewing shows: highlight things, scroll, and set the quantity box value. It never clicks or submits anything.

The code is written to follow these rules, but you are responsible for your own account. If you are unsure about a feature, ask Torn staff before using it.

## How it works

```
Cloud Scheduler (every minute) ──► Cloud Run "wingman-backend" ──► api.torn.com  (your key, read-only)
                                        │  │                    └► yata.yt       (public stock data)
                                        │  └─ Firestore  (settings, state, history, devices)
                                        └─ Firebase Cloud Messaging ──► your phone (widget + alerts)

Widget / notification button ──► opens a Torn page in Torn PDA ──► you tap Torn's own button
```

- **backend/** is a small Node/TypeScript service. Every minute it reads your Torn data, works out the next step, and pushes updates only when something changed.
- **android/** is the widget, alerts and settings screen.
- **userscript/** is the optional Torn PDA script.
- **infra/** has helper scripts for the setup steps below.

## What you need

- A **Google account** with a billing account (the free tiers cover normal use, see [Cost](#cost)). A card is required to enable billing.
- A **Torn API key** with *Limited Access* (create one at Torn → Settings → API Keys).
- An **Android phone** (Android 8+). Torn PDA is recommended so buttons open inside it.
- A **GitHub account**, to build the app. Nothing needs installing on a computer.
- Optional: [Torn PDA](https://www.tornpda.com) for the userscript.

You can do the whole setup from a phone using **Google Cloud Shell** (a free terminal in your browser, at [shell.cloud.google.com](https://shell.cloud.google.com)).

## Setup, step by step

### 1. Fork the repository
On GitHub, tap **Fork** on this repository. You will build your own copy of the app from your fork.

### 2. Create a Google Cloud project and turn on billing
1. Open the [Google Cloud console](https://console.cloud.google.com), tap the project picker, then **New project**. Pick a globally unique ID, for example `wingman-yourname`.
2. Open **Billing**, then **Link a billing account** for that project.
3. Strongly recommended: **Billing → Budgets & alerts → Create budget** for $5, with alerts at 50% and 100%.

### 3. Open Cloud Shell and set your variables
Open [shell.cloud.google.com](https://shell.cloud.google.com), then run (change the first two lines):

```bash
export PROJECT=wingman-yourname      # the project ID from step 2
export REGION=us-east1               # pick a region near you
gcloud config set project $PROJECT
git clone https://github.com/YOUR-GITHUB-NAME/Wingman.git && cd Wingman
```

### 4. Turn on the Google services

```bash
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  fcm.googleapis.com firebase.googleapis.com
gcloud firestore databases create --location=$REGION
```

### 5. Create the three secrets
Replace `YOUR_TORN_KEY` with your Limited Access key. The other two are random and are created for you.

```bash
printf %s "YOUR_TORN_KEY" | gcloud secrets create TORN_API_KEY --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create APP_SECRET --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create TICK_SECRET --data-file=-
```

- `TORN_API_KEY` stays on the server. It never goes in the app.
- `APP_SECRET` is what the app (and optionally the userscript) uses to talk to your backend.
- `TICK_SECRET` is what the scheduler uses to trigger a check.

### 6. Give the backend permission to use them
A new project's default service account has no roles. Grant what the backend and the build need:

```bash
SA="$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for ROLE in cloudbuild.builds.builder artifactregistry.writer storage.objectViewer logging.logWriter \
            secretmanager.secretAccessor datastore.user firebasecloudmessaging.admin; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/$ROLE" --quiet >/dev/null
done
```

### 7. Deploy the backend

```bash
gcloud run deploy wingman-backend --source backend --region $REGION \
  --allow-unauthenticated --max-instances 1 --concurrency 1 --timeout 30 --memory 512Mi \
  --set-secrets "TORN_API_KEY=TORN_API_KEY:latest,APP_SECRET=APP_SECRET:latest,TICK_SECRET=TICK_SECRET:latest"
```

If it asks to create an Artifact Registry repository, answer `Y`. "Allow unauthenticated" is safe here: every route checks a secret header itself. When it finishes, copy the **Service URL** it prints.

### 8. Start the one-minute check

```bash
URL="PASTE-THE-SERVICE-URL-HERE"
TICK="$(gcloud secrets versions access latest --secret=TICK_SECRET)"
gcloud scheduler jobs create http wingman-tick --location=$REGION --schedule="* * * * *" \
  --uri="$URL/tick" --http-method=POST --headers="X-Tick-Key=$TICK" --attempt-deadline=30s
```

Test it. This should print JSON with `"ok":true`:

```bash
curl -s -X POST -H "X-Tick-Key: $TICK" "$URL/tick"; echo
```

### 9. Create the Firebase app (for notifications)
1. Open the [Firebase console](https://console.firebase.google.com), tap **Add project**, and choose **your existing Google Cloud project**.
2. Tap **Add app → Android**. The package name must be exactly `com.wingman.app`. Skip the other steps.
3. In **Project settings → Your apps**, download **google-services.json**.

### 10. Build the app on GitHub
1. In your fork, open **Settings → Secrets and variables → Actions → New repository secret**.
2. Name it `GOOGLE_SERVICES_JSON_B64`. For the value, base64-encode the file you downloaded. In Cloud Shell, upload it (⋮ menu → Upload), then run `base64 -w0 google-services.json`, and paste the output.
3. Open **Actions → Android → Run workflow**.
4. When it turns green, open the run, scroll to **Artifacts**, and download **wingman-debug-apk**. Unzip it and install the `.apk` (allow installs from your browser if Android asks).

### 11. Connect the app
1. Open Wingman and allow notifications.
2. Enter your **Service URL** from step 7.
3. Enter your **APP_SECRET**. Show it with: `gcloud secrets versions access latest --secret=APP_SECRET`
4. Tap **Connect and load**. The status line should say "Connected."
5. Open the **Trip** section and pick your **destination** and **item**. The item list shows each item's current stock and price.
6. Open **Timing** and set shopping and safety minutes, how many items you can carry, and the fly lock buffer, then tap **Save settings**. Open **Alerts** to choose which alerts you want.
7. Open **Tools** and tap **Test notification (this phone)**. If nothing appears, see [Troubleshooting](#troubleshooting).
8. In **Tools**, tap **Battery: set Unrestricted** and set Wingman to **Unrestricted**. On Samsung, also add it to **Never sleeping apps**. Otherwise Android may stop background updates.

### 12. Add the widgets
Long-press your home screen, tap **Widgets** and find **Wingman**. There are seven, so use only the ones you want:

| Widget | Shows | Good size |
|---|---|---|
| **Wingman** (all-in-one) | Everything, in a layout you choose | tall, 4 wide |
| **Wingman · Status** | Name, faction, health, energy, nerve, jail and hospital | 4×3 |
| **Wingman · OC** | OC timer and when the fly window closes | 4×3 |
| **Wingman · Trip** | Landing, leave-by and OC timers, the next trip, and the Fly or Buy button | 4×4 |
| **Wingman · Stock** | Your item's stock, price and restock estimate | 4×3 |
| **Wingman · Actions** | Fly, Gym, Crimes and Items buttons | 4×2 |
| **Wingman · Targets** | Scrollable attack list: offline players you can beat, with difficulty badges and hospital release timers | 4×5 |

The all-in-one widget opens a layout editor when you add it (reopen it any time from the app's **Widget layout** button).

### 13. Optional: the Torn PDA userscript
In Torn PDA, add `userscript/wingman.user.js` as a user script. It pre-fills the quantity box on the foreign shop. It never presses Buy. In its ⚙ panel you can enter your service URL and app secret to keep settings in sync with the app.

## Using it

| You see | It means | What you do |
|---|---|---|
| Green OC timer, FLY enabled | Plenty of time | Tap **FLY** to open the travel page, then tap Torn's Travel button |
| Yellow, FLY WINDOW CLOSING | Last chance for a round trip | Go now or skip this run |
| Red, **FLY ✕** | A round trip no longer fits | Stay in Torn. The button won't open the travel page |
| ABROAD panel | You've landed | Check stock, tap **BUY MAX** to open the shop, buy in Torn, then tap **BOUGHT** |
| RESTOCK ETA | Item is sold out | Wait, or watch the countdown. It is an estimate |
| Leave-by timer red | You must leave to make the OC | Tap **FLY HOME** |

**Layout.** In **Widget layout** you can turn health, energy, nerve, jail, hospital and the OC panel on or off, add extra tiles (trip, stock, buy max, next step, cash, cooldowns), and pick which quick buttons appear.

**Restock estimates.** Torn doesn't publish restock times. Wingman records stock changes for every foreign item and estimates the next restock from the usual gap between past ones. It needs two restocks of an item before it can estimate, and it is only as accurate as the player-reported data it sees.

## The attack list

The **Wingman · Targets** widget reads your in-game **Target list** (add players there in Torn as usual) and shows the ones worth hitting:

- **Offline** for at least the time you choose (default 60 minutes).
- **Not too strong.** Other players' battle stats are private, so strength is judged by **level**: their level must be at most yours plus a margin you set (default 0, meaning your level or lower; use a negative number to be stricter). Level is only a rough guide, so check a target before you attack.
- Only players you can attack right now (**Okay**) or who are **in hospital**. Hospital players show a live countdown to their release. Players in jail, abroad or in federal jail are left out.
- Most recently active first, so long-abandoned accounts sink to the bottom.

### Optional: all offline players, with difficulty (FF Scouter)

Your Target list is short. For **every offline player ranked by difficulty**, Wingman can use [FF Scouter](https://ffscouter.com), a community service that estimates each player's strength and gives a fair-fight (FF) score. Each row then shows a badge: **green is easy, yellow is fair, red is hard**, plus the estimated stats.

**This sends a key to a third-party site.** Only turn it on if you are happy with that:

1. In Torn, create a **separate API key with Public access only**. Do not use your main key.
2. Register that key at [ffscouter.com](https://ffscouter.com) (follow their sign-up).
3. Store it as a secret named `FFSCOUTER_KEY` in your Google project, then redeploy the backend: `printf %s "YOUR_FF_KEY" | gcloud secrets create FFSCOUTER_KEY --data-file=-`, then repeat the deploy command from step 7.
4. In the app, open **Targets**, switch **Use FF Scouter** on and choose the difficulty to show (fair-fight score) (default 2.0; lower means weaker targets).

Wingman asks FF Scouter every two minutes for players at your chosen difficulty and the two steps below it (so you see a mix, easiest first), keeps the ones offline long enough, then looks up each one's public profile through the Torn API to add hospital release times. The widget list scrolls, so every match is reachable. FF Scouter has its own rate limits and terms. If it is off or the key is missing, the widget falls back to your Target list.

Tap a row to open that player's attack page. **You press Torn's own Attack button**: Wingman never attacks for you. Set the filters in the app under **Targets**.

## Troubleshooting

- **"Could not reach backend" in the app.** Check the Service URL has no trailing spaces and the secret is exactly the `APP_SECRET`. Open `URL/state` in a browser; a `401` means the service is reachable.
- **Widget says SET UP.** The app isn't connected yet, or the first update hasn't arrived. Tap ⟳ on the widget.
- **No notifications.** Tap **Test notification (this phone)**. If it says notifications are blocked, enable them in Android settings. If the local test works but pushes don't, check the Firebase package name is exactly `com.wingman.app` and your `GOOGLE_SERVICES_JSON_B64` secret is correct, then rebuild the app.
- **Stock shows "seen 40m ago".** Nobody has reported that shop recently. The data is player-reported, and refresh can't make it newer than the last report.
- **Torn API key problem alert.** Your key was rejected. Create a new Limited key and update the secret: `printf %s "NEW" | gcloud secrets versions add TORN_API_KEY --data-file=-`, then redeploy (step 7).
- **Changed a secret or the code.** Redeploy with the step 7 command.
- **Scheduler returns errors.** In Cloud Shell: `gcloud scheduler jobs run wingman-tick --location=$REGION`, then check **Cloud Run → wingman-backend → Logs**.

## Cost

Everything is designed to fit inside Google's free tiers for one player: about 1,440 backend runs a day, a few thousand database reads and writes, and a handful of push messages. Free-tier limits change, so check the current Google Cloud pricing pages and keep the $5 budget alert on. Wingman makes about two Torn API calls a minute, well under Torn's limit.

## Security

- Your Torn API key lives only in Secret Manager on the server. It is never in the app or this repository.
- The app and the userscript send `APP_SECRET` in a header. With it, someone could change your Wingman settings or send test pushes, but not touch your Torn account.
- The userscript stores the secret in the page's local storage on torn.com, where other userscripts can read it. Only install userscripts you trust, or skip syncing from the script.
- To rotate a secret: add a new version, redeploy, and update the app.
- Never commit `google-services.json` or any key. This repository's `.gitignore` already excludes them.

## Develop

```bash
cd backend && npm ci && npm test        # Node 22+
cd android && ./gradlew :app:testDebugUnitTest :app:assembleDebug
```

- Planning logic is in `backend/src/plan.ts`, with tests in `plan.test.ts`. The fly lock and OC colors on the phone are tested in `android/app/src/test`.
- Releases are tagged (`v1.5.1` and so on). The app shows its version on the settings screen.
- The Cloud Shell commands in the setup steps follow the same sequence the original deployment used, but that deployment was done through Google's APIs, so these exact `gcloud` commands have not been run end to end. If one fails or differs on your account, please open an issue.
- `infra/` holds the scripts used to set up the original deployment through Google's APIs. They need a service account key, so the steps above are simpler for most people.

## Credits and disclaimer

Foreign stock data comes from [YATA](https://yata.yt), a community project. Restock estimates are learned from the stock changes Wingman sees.

Wingman is an unofficial community tool. It is **not affiliated with or endorsed by Torn**. You use it at your own risk and are responsible for following Torn's rules.
