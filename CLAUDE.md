# Wingman

Torn OC run helper: GCP backend + Android widget + PDA userscript. Spec: `uploads/wingman-build-spec.md`. Plan: `PLAN.md`.

## Project notes
- PUBLIC repo. Never commit keys, `google-services.json`, org names, emails or addresses.
- Torn ToS rule: API data (`api.torn.com`, read-only) and pages the player is viewing only. Never automate game actions, never call torn.com pages, never `.click()`/`.submit()`. Player taps every action.
- Backend: `cd backend && npm test` (Node 24 runs the `.ts` tests directly; no deps needed for `plan.ts`). Build target Node 22 via `tsc`.
- App display name is Wingman; Android package is `com.wingman.app`.
- Multi-user: `accounts.ts` fans /tick out over users; `store.ts` keeps the owner on legacy paths (`config/settings`, `state/current`, `devices`) and everyone else under `users/{uid}/...`. Keys are AES-GCM encrypted (`crypto.ts`, secret KEY_ENC_SECRET). YATA and restock history are shared (`shared.ts`). Sign-up is invite-only (`INVITE_CODE`).
- Deploy: `cd infra; export GOOGLE_APPLICATION_CREDENTIALS=$CLAUDERC_GOOGLE_ACCOUNT PROJECT=wingman-oc; TOK=$(node token.mjs) node deploy.mjs`. Optional secrets (FFSCOUTER_KEY, KEY_ENC_SECRET, INVITE_CODE) are attached when they exist.
- The website and its legal pages (business name and address) live outside this public repo, in `~/projects/wingman-site`.
