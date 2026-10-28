Last updated: 2026-10-28 15:05 UTC

## Goal
Wingman (Torn OC run helper): GCP backend (tick every minute) + Android widget/FCM app + PDA userscript v1.1. Spec: `uploads/wingman-build-spec.md`. Hard rule: API-only, never automate game actions.

## Current task
Multi-user backend is deployed (invite-only, closed until INVITE_CODE secret exists). Next: Android app sign-up/token screen, then own FF estimate to replace ffscouter.

## Tasks
- [x] Backend: plan.ts + tests (11 pass)
- [x] Backend: clients, model, events, tick, routes, Dockerfile (tsc + 15 tests pass; not run live)
- [x] Userscript v1.1 written (syntax-checked only; shop-page selectors unverified)
- [x] Android app builds locally (debug APK). CI workflow added; needs GOOGLE_SERVICES_JSON_B64 secret
- [x] infra: backend deployed (Cloud Run wingman-backend, scheduler wingman-tick every min, secrets). Verified live: /tick 200, phase=home
- [x] Firebase app registered (google-services.json kept local, gitignored)
- [x] README
- [x] Backend multi-user (accounts, per-user tokens, encrypted keys, per-user data, fan-out tick, shared YATA/restock)
- [x] Public tester sign-up endpoint (/testers) + website (private repo ~/projects/wingman-site, Cloudflare Pages)
- [x] v1.15.0: Dashboard builder tabs (Layout, Travel, Bars, Cooldowns, OC, Status, Shortcuts); new optional alerts: medical/booster under 6h, abroad too long, new medal/honor, chain about to break (award/chain Torn reply shapes UNVERIFIED, no alert on missing data)
- [ ] Next from feature research: NPC loot timers (YATA /api/v1/loot reachable), stock exchange helper, faction OC readiness, trains available, inventory worth, rental filter
- [ ] Website download link: parked until launch (Jonathan, 2026-10-28). Options were Play test link / direct APK / emailed link.
- [x] v1.17.0 Account screen: invite sign-up, Torn key check (what works, Full-access warning), change key, delete account, sign out. Backend: POST /keycheck, PUT /key, GET /me. Secrets now exist; Torn key-info reply shape unverified (level shows unknown if absent)
- [ ] Web deletion link for Google Play (a page on the site that explains how to delete an account)
- [x] Own FF estimate from your attack history (ffestimate.ts): target rows show the FF you last got and a stats floor. Verified against the real API 2026-10-28 (probe-shapes.mjs): attacks (modifiers.fair_fight), battlestats (+total), key info (access_level), faction chain, medals/honors arrays.
- [ ] Skipped, with reasons: NPC loot timers (YATA loot feed has April timestamps, stale); stock exchange benefit alerts (v1 user/stocks has only shares and transactions, no benefit-ready info); faction OC readiness (v2 faction/crimes returns error 7 for the owner key); inventory worth (v1 inventory selection is gone, v2 shape unknown); trains available, rental filter (no verified source)
- [ ] Cloudflare Workers port (optional, only if GCP billing is a problem)

## Decisions
- 2026-10-24: No workers attached, no gcloud/firebase CLI on server; building code myself. GCP work goes through the clauderc service account (cannot grant roles or link billing).
- 2026-10-24: GCP project `wingman-oc` created under the org via API. `wingman` was taken. Blocked on billing link by Jonathan before enabling APIs.

- 2026-10-24: Widget is tile-based and customizable (v1.2.0): backend sends `facts`, app composes tiles from Prefs layout.

- 2026-10-24: Figma designs for widget states and app screens: https://www.figma.com/design/FmUYycRA0WJanbNAgYNtxB (Wingman UI). Next: apply the look in code.

- 2026-10-28: Multi-user on Cloud Run + Firestore. Owner keeps legacy doc paths (no migration). Sign-up closed until INVITE_CODE secret exists; KEY_ENC_SECRET secret must exist first (creating secrets was blocked in auto mode; Jonathan or an allowed session creates it).

## Known issues
- Sign-up is open to anyone with the invite code (secrets created 2026-10-28; auto mode blocks secret writes from Claude, Jonathan runs infra/signup-secrets.mjs). Real end-to-end sign-up with a Torn key not yet tested.
- Torn per-IP API limit with many users unverified; tick budget 22s, 6 workers (about 30-60 users per tick).
- Need from Jonathan: link billing to `wingman-oc` in console; Torn API key (Limited) via cLaudeRC. Region assumed us-east1.
