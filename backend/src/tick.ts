import { computePlan, learnFlight, DESTS } from './plan.ts';
import { fetchUser, fetchOC, fetchTargets, isKeyProblem, isRateLimit } from './torn.ts';
import { compact, pickTargets } from './targets.ts';
import { fetchYata, findStock } from './yata.ts';
import { widgetModel, type Widget } from './model.ts';
import { diffEvents, statusEvents, type Evt, type Flags } from './events.ts';
import { alertOn } from './settings.ts';
import { getSettings, getState, saveState, setYata } from './store.ts';
import { push } from './fcm.ts';
import { nextBought, pruneSent, sameState } from './logic.ts';
import { observe, estimate } from './restock.ts';

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
  const stored = structuredClone(st); // st is edited below; this is what the database holds
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
        await push(st.model as Widget | undefined, [{ text: 'Torn API key problem — check settings', url: null }]).catch(() => {});
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

  // In-game Targets list, refreshed every 2 minutes (1 to 3 API calls).
  if (!st.targets || t - st.targets.at >= 120) {
    try { st.targets = { at: t, list: compact(await fetchTargets(key)) }; } catch { /* keep the cached list */ }
  }
  const tg = st.targets ? pickTargets(st.targets.list, { myLevel: user.level ?? 0, maxAbove: cfg.targetMaxLevelAbove, minOfflineSecs: cfg.targetMinOfflineMin * 60, now: t, limit: 8 }) : undefined;

  let p = plan(user, oc, cfg, st, t);

  // Learn real flight time from an outbound flight.
  const tr = user.travel || {};
  if (p.phase === 'traveling' && p.outbound && tr.departed && tr.timestamp) {
    const d = DESTS.find(x => x.name === p.where);
    const l = d && learnFlight(cfg, d.id, tr.departed, tr.timestamp);
    if (l) { st.learned = { ...st.learned, [l.key]: l.secs }; p = plan(user, oc, cfg, st, t); }
  }

  // Learn restock rhythm for the chosen item from new stock reports.
  const hk = cfg.item ? `${p.phase === 'abroad' ? p.here.id : cfg.dest}:${cfg.item.toLowerCase()}` : null;
  const hist = { ...(st.hist ?? {}) };
  for (const [cc, c] of Object.entries<any>(st.yata?.stocks ?? {})) {
    for (const it of c.stocks ?? []) { const k = `${cc}:${String(it.name).toLowerCase()}`; hist[k] = observe(hist[k], it.quantity, c.update); }
  }
  const rs = hk ? estimate(hist[hk], t) : undefined;

  const phaseChanged = p.phase !== st.phase;
  const landedCash = phaseChanged ? (p.phase === 'abroad' ? user.money_onhand : null) : st.landedCash;
  let bought = nextBought({ prevBought: !!st.bought, phaseChanged, abroad: p.phase === 'abroad', cost: p.stock?.cost, landedCash, cash: user.money_onhand });

  const prev = { phase: st.phase, nextId: st.nextId, qty: st.stockQty, ocNow: st.ocNow, arrival: st.arrival, homeAt: st.homeAt };
  const sent = pruneSent(st.sent, wall, SENT_TTL);
  const bar = (b: any) => !!b && b.maximum > 0 && b.current >= b.maximum;
  const cd = user.cooldowns || {};
  const flags: Flags = { energy: bar(user.energy), nerve: bar(user.nerve), life: bar(user.life), drug: !(cd.drug > 0), booster: !(cd.booster > 0), medical: !(cd.medical > 0),
    hospital: p.phase === 'hospital' || (user.states?.hospital_timestamp ?? 0) > t, jail: p.phase === 'jail' || (user.states?.jail_timestamp ?? 0) > t };
  // The player's switches decide which alerts go out; a bad-key warning always does.
  const events: Evt[] = [...diffEvents(prev, p, cfg, bought), ...statusEvents(st.flags, flags, t)].filter(e => alertOn(cfg, e.type) && !sent[e.key]);

  const model = widgetModel(p, cfg, bought, user, rs, p.phase === 'traveling' ? (p.outbound ? 'Torn' : st.lastPlace ?? null) : null, tg);
  const changed = JSON.stringify({ ...model, updatedAt: 0 }) !== JSON.stringify({ ...st.model, updatedAt: 0 });
  if (changed || events.length) {
    try { await push(model, events); } catch (e) {
      // Keep the old phase/model so the same events and widget update are tried again next tick.
      console.error('push failed', e);
      await saveState({ ...st, yata: st.yata, learned: st.learned, hist });
      return { ok: false, phase: p.phase, note: 'push failed' };
    }
  }
  for (const e of events) sent[e.key] = wall;

  // A BOUGHT tap that landed while this tick ran must not be overwritten.
  if (bought === !!st.bought) bought = !!(await getState()).bought;

  const next = {
    ...st, phase: p.phase, nextId: p.next?.id ?? null, stockQty: p.stock ? p.stock.qty : null, ocNow: p.ocNow,
    arrival: p.phase === 'traveling' ? p.landAt : st.arrival ?? null,
    homeAt: prev.phase === 'traveling' && p.phase === 'home' ? st.arrival : st.homeAt ?? null,
    landedCash: landedCash ?? null, bought, sent, model, hist, flags, lastPlace: p.phase === 'abroad' ? p.here.name : st.lastPlace ?? null
  };
  delete (next as any).snapshot; // old versions stored the raw Torn profile here; nothing reads it
  if (!sameState(next, stored)) await saveState(next); // skip rewriting identical state
  return { ok: true, phase: p.phase };
}

// Fresh widget model without side effects (GET /state).
export async function currentModel(key: string, fresh = false): Promise<Widget> {
  const [cfg, st] = await Promise.all([getSettings(), getState()]);
  const [user, oc] = await Promise.all([fetchUser(key), fetchOC(key)]);
  // A manual refresh pulls new stock too, but at most every 20 seconds so taps cannot hammer YATA.
  if (fresh && (!st.yata || user.timestamp - st.yata.fetchedAt >= 20)) {
    try { st.yata = await fetchYata(user.timestamp); await setYata(st.yata); } catch { /* keep the cached copy */ }
  }
  const p = plan(user, oc, cfg, st, user.timestamp);
  const hk = cfg.item ? `${p.phase === 'abroad' ? p.here.id : cfg.dest}:${cfg.item.toLowerCase()}` : null;
  return widgetModel(p, cfg, !!st.bought, user, hk ? estimate(st.hist?.[hk], user.timestamp) : undefined, p.phase === 'traveling' ? (p.outbound ? 'Torn' : st.lastPlace ?? null) : null,
    st.targets ? pickTargets(st.targets.list, { myLevel: user.level ?? 0, maxAbove: cfg.targetMaxLevelAbove, minOfflineSecs: cfg.targetMinOfflineMin * 60, now: user.timestamp, limit: 8 }) : undefined);
}
