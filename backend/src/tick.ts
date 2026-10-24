import { computePlan, learnFlight, DESTS } from './plan.ts';
import { fetchUser, fetchOC, isKeyProblem, isRateLimit } from './torn.ts';
import { fetchYata, findStock } from './yata.ts';
import { widgetModel, type Widget } from './model.ts';
import { diffEvents, type Evt } from './events.ts';
import { getSettings, getState, saveState } from './store.ts';
import { push } from './fcm.ts';

const SENT_TTL = 3 * 86400;

// Build the plan from live data. Shared by /tick and /state.
export function plan(user: any, oc: any, cfg: any, st: any, t: number) {
  const first = computePlan({ user, oc, cfg, t, learned: st.learned });
  const cc = first.phase === 'abroad' ? first.here.id : cfg.dest;
  const stock = cfg.item ? findStock(st.yata, cc, cfg.item) : null;
  return computePlan({ user, oc, cfg, t, learned: st.learned, stock });
}

export async function tick(key: string): Promise<{ ok: boolean; phase?: string; note?: string }> {
  const [cfg, st] = await Promise.all([getSettings(), getState()]);
  const wall = Math.floor(Date.now() / 1000);
  if (st.backoffUntil > wall) return { ok: true, note: 'backoff' };

  let user: any, oc: any;
  try {
    [user, oc] = await Promise.all([fetchUser(key), fetchOC(key)]);
  } catch (e: any) {
    if (isRateLimit(e)) { await saveState({ ...st, backoffUntil: wall + 120 }); return { ok: false, note: 'rate limited' }; }
    if (isKeyProblem(e)) {
      const k = `key:${Math.floor(wall / 86400)}`;
      if (!st.sent?.[k]) {
        const model = st.model as Widget;
        await push(model, [{ text: 'Torn API key problem — check settings', url: null }]).catch(() => {});
        await saveState({ ...st, sent: { ...st.sent, [k]: wall } });
      }
      return { ok: false, note: 'key problem' };
    }
    throw e;
  }
  const t: number = user.timestamp ?? wall; // server time corrects clock offset

  // YATA: 60s while abroad waiting for stock, otherwise 5 min.
  const watching = user.status?.state === 'Abroad' && st.stockQty === 0;
  if (!st.yata || t - st.yata.fetchedAt >= (watching ? 55 : 295)) {
    try { st.yata = await fetchYata(t); } catch { /* keep the cached copy; widget shows "seen Xm ago" */ }
  }

  let p = plan(user, oc, cfg, st, t);

  // Learn real flight time from an outbound flight.
  const tr = user.travel || {};
  if (p.phase === 'traveling' && p.outbound && tr.departed && tr.timestamp) {
    const d = DESTS.find(x => x.name === p.where);
    const l = d && learnFlight(cfg, d.id, tr.departed, tr.timestamp);
    if (l) { st.learned = { ...st.learned, [l.key]: l.secs }; p = plan(user, oc, cfg, st, t); }
  }

  // Bought flag: reset on phase change, set when cash drops by at least one item's cost.
  let bought = !!st.bought;
  if (p.phase !== st.phase) { bought = false; st.landedCash = p.phase === 'abroad' ? user.money_onhand : null; }
  if (p.phase === 'abroad' && p.stock && st.landedCash != null && user.money_onhand <= st.landedCash - p.stock.cost) bought = true;

  const prev = { phase: st.phase, nextId: st.nextId, qty: st.stockQty, ocNow: st.ocNow, arrival: st.arrival };
  const sent: Record<string, number> = Object.fromEntries(Object.entries(st.sent ?? {}).filter(([, v]) => (v as number) > wall - SENT_TTL)) as any;
  const events: Evt[] = diffEvents(prev, p, cfg, bought).filter(e => !sent[e.key]);
  for (const e of events) sent[e.key] = wall;

  const model = widgetModel(p, cfg, bought);
  const changed = JSON.stringify({ ...model, updatedAt: 0 }) !== JSON.stringify({ ...st.model, updatedAt: 0 });
  if (changed || events.length) await push(model, events).catch(e => console.error('push failed', e));

  await saveState({
    ...st, phase: p.phase, nextId: p.next?.id ?? null, stockQty: p.stock ? p.stock.qty : null, ocNow: p.ocNow,
    arrival: p.phase === 'traveling' ? p.landAt : st.arrival ?? null, bought, sent, model, snapshot: { user, oc },
  });
  return { ok: true, phase: p.phase };
}

// Fresh widget model without side effects (GET /state).
export async function currentModel(key: string): Promise<Widget> {
  const [cfg, st] = await Promise.all([getSettings(), getState()]);
  const [user, oc] = await Promise.all([fetchUser(key), fetchOC(key)]);
  return widgetModel(plan(user, oc, cfg, st, user.timestamp), cfg, !!st.bought);
}
