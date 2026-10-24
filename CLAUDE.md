# Wingman

Torn OC run helper: GCP backend + Android widget + PDA userscript. Spec: `uploads/torn-oc-run-build-spec.md`. Plan: `PLAN.md`.

## Project notes
- PUBLIC repo. Never commit keys, `google-services.json`, org names, emails or addresses.
- Torn ToS rule: API data (`api.torn.com`, read-only) and pages the player is viewing only. Never automate game actions, never call torn.com pages, never `.click()`/`.submit()`. Player taps every action.
- Backend: `cd backend && npm test` (Node 24 runs the `.ts` tests directly; no deps needed for `plan.ts`). Build target Node 20 via `tsc`.
- App display name is Wingman; Android package stays `com.ocrun.app` unless Jonathan renames it.
