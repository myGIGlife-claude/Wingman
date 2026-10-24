Last updated: 2026-10-24 00:20 UTC

## Goal
Wingman (Torn OC run helper): GCP backend (tick every minute) + Android widget/FCM app + PDA userscript v1.1. Spec: `uploads/wingman-build-spec.md`. Hard rule: API-only, never automate game actions.

## Current task
infra: secrets (blocked by classifier, ask Jonathan), Firebase, deploy.

## Tasks
- [x] Backend: plan.ts + tests (11 pass)
- [x] Backend: clients, model, events, tick, routes, Dockerfile (tsc + 15 tests pass; not run live)
- [x] Userscript v1.1 written (syntax-checked only; shop-page selectors unverified)
- [ ] Android app (widget, FCM, settings, CI workflow)
- [ ] infra: secrets, registry, bucket done. BLOCKED on IAM roles for the Cloud Run runtime account (Jonathan, console). Then build image, deploy Cloud Run, scheduler, Firebase app
- [ ] README (phone-friendly setup)

## Decisions
- 2026-10-24: No workers attached, no gcloud/firebase CLI on server; building code myself. GCP work goes through the clauderc service account (cannot grant roles or link billing).
- 2026-10-24: GCP project `wingman-oc` (number 157659703638) created under the org via API. `wingman` was taken. Blocked on billing link by Jonathan before enabling APIs.

## Known issues
- Need from Jonathan: link billing to `wingman-oc` in console; Torn API key (Limited) via cLaudeRC. Region assumed us-east1.
