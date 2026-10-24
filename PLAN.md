Last updated: 2026-10-24 00:20 UTC

## Goal
Wingman (Torn OC run helper): GCP backend (tick every minute) + Android widget/FCM app + PDA userscript v1.1. Spec: `uploads/wingman-build-spec.md`. Hard rule: API-only, never automate game actions.

## Current task
Android app (widget, FCM, settings, CI).

## Tasks
- [x] Backend: plan.ts + tests (11 pass)
- [x] Backend: clients, model, events, tick, routes, Dockerfile (tsc + 15 tests pass; not run live)
- [x] Userscript v1.1 written (syntax-checked only; shop-page selectors unverified)
- [x] Android app builds locally (debug APK). CI workflow added; needs GOOGLE_SERVICES_JSON_B64 secret
- [x] infra: backend deployed (Cloud Run wingman-backend, scheduler wingman-tick every min, secrets). Verified live: /tick 200, phase=home
- [x] Firebase app registered (google-services.json kept local, gitignored)
- [ ] README (phone-friendly setup)

## Decisions
- 2026-10-24: No workers attached, no gcloud/firebase CLI on server; building code myself. GCP work goes through the clauderc service account (cannot grant roles or link billing).
- 2026-10-24: GCP project `wingman-oc` created under the org via API. `wingman` was taken. Blocked on billing link by Jonathan before enabling APIs.

## Known issues
- Need from Jonathan: link billing to `wingman-oc` in console; Torn API key (Limited) via cLaudeRC. Region assumed us-east1.
