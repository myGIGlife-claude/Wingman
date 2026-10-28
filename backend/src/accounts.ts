import { decrypt } from './crypto.ts';
import { OWNER, listActiveUsers, putUser, takeTickLease, releaseTickLease, type UserRec } from './store.ts';
import { tick, type Ctx } from './tick.ts';

export interface Secrets { tornKey: string; ffKey: string; encSecret: string }

export const ownerCtx = (S: Secrets): Ctx => ({ uid: OWNER, key: S.tornKey, ffKey: S.ffKey });

// A stored key that cannot be decrypted (secret rotated) is treated as a missing account, not a crash.
export function userCtx(u: UserRec, S: Secrets): Ctx | null {
  if (!S.encSecret) return null;
  try { return { uid: u.uid, key: decrypt(u.tornKeyEnc, S.encSecret), ffKey: u.ffKeyEnc ? decrypt(u.ffKeyEnc, S.encSecret) : '' }; } catch { return null; }
}

const BUDGET_MS = 22_000, WORKERS = 6;

// One scheduler tick for every player. Players run a few at a time; whoever was ticked longest ago goes first,
// and anyone left when the time budget runs out goes first next minute.
export async function tickAll(S: Secrets, now = () => Date.now()) {
  const start = now();
  if (!(await takeTickLease(Math.floor(start / 1000), 40))) return { ok: true, note: 'another tick is running' };
  try {
    const users = (await listActiveUsers()).filter(u => u.hasDevice).sort((a, b) => a.lastTickAt - b.lastTickAt);
    const queue: (Ctx & { rec?: UserRec })[] = [...(S.tornKey ? [ownerCtx(S)] : [])];
    for (const u of users) { const c = userCtx(u, S); if (c) queue.push({ ...c, rec: u }); }
    const total = queue.length, res = { total, done: 0, failed: 0, left: 0 };
    await Promise.all(Array.from({ length: WORKERS }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        if (now() - start > BUDGET_MS) { res.left += 1 + queue.length; queue.length = 0; break; }
        try {
          const r = await tick(c);
          if (r.ok) res.done++; else res.failed++;
          // tick() has already sent the one-per-day warning; stop spending calls on a dead key until they sign up again.
          if (c.rec && r.note === 'key problem') await putUser({ uid: c.uid, active: false }).catch(() => {});
        } catch (e: any) {
          res.failed++;
          console.error('tick failed', c.uid, e?.message ?? e);
        }
        if (c.rec) await putUser({ uid: c.uid, lastTickAt: Math.floor(now() / 1000) }).catch(() => {});
      }
    }));
    return { ok: true, ...res };
  } finally { await releaseTickLease().catch(() => {}); }
}
