Last updated: 2026-10-24 00:20 UTC

## Goal
Wingman (Torn OC run helper): GCP backend (tick every minute) + Android widget/FCM app + PDA userscript v1.1. Spec: `uploads/wingman-build-spec.md`. Hard rule: API-only, never automate game actions.

## Current task
Backend: torn/yata clients, widget model, events, tick, routes.

## Tasks
- [x] Backend: plan.ts + tests (11 pass)
- [ ] Backend: torn/yata clients, widget model, events, tick, routes, Firestore, FCM
- [ ] Userscript v1.1 (buy max prefill, live stock, capacity, shared settings)
- [ ] Android app (widget, FCM, settings, CI workflow)
- [ ] infra/setup.sh (needs Jonathan: billing link, role grants)
- [ ] README (phone-friendly setup)

## Decisions
- 2026-10-24: No workers attached, no gcloud/firebase CLI on server; building code myself. GCP work goes through the clauderc service account (cannot grant roles or link billing).

## Known issues
- Need from Jonathan before infra: project ID (suggest wingman), region (us-east1), billing link, Torn API key (Limited).
