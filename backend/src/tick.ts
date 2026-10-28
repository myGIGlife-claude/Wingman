import { computePlan, learnFlight, DESTS } from './plan.ts';
import { fetchAttacks, fetchAwards, fetchChain, fetchUser, fetchOC, fetchTargets, fetchProfile, fetchBattleStats, fetchDrugStats, addictionFrom, addictionIcon, rehabCount, fetchIcons, drugCounts, isKeyProblem, isRateLimit } from './torn.ts';
import { compact, pickTargets, type TargetsView } from './targets.ts';
import { fetchFFTargets, FFError } from './ff.ts';
import { findStock } from './yata.ts';
import { widgetModel, type Widget } from './model.ts';
import { diffEvents, statusEvents, abroadLongEvents, awardEvents, chainEvents, LOW_CD_SECS, type Evt, type Flags } from './events.ts';
import { alertOn } from './settings.ts';
import { getSettings, getState, saveState } from './store.ts';
import { sharedYata, sharedHist, seedHistFrom } from './shared.ts';
import { push } from './fcm.ts';
import { nextBought, pruneSent, sameState, slimForPush } from './logic.ts';
import { estimate } from './restock.ts';
import { myScore, observedFF, rowFor } from './ffestimate.ts';

const SENT_TTL = 3 * 86400;

// Who a tick or request is for: the player's id, their Torn key and optional FF Scouter key.
export interface Ctx { uid: string; key: string; ffKey: string }

// Addiction penalty and Xanax / overdose counts change slowly, so refresh them every 10 minutes (2 API calls).
async function refreshExtra(key: string, st: any, t: number, myId: number) {
  if (st.extra && t - st.extra.at < 600 && 'rehabs' in st.extra) return; // a stored copy without the newer fields refreshes at once
  try {
    const [bs, ds, ic] = await Promise.all([fetchBattleStats(key), fetchDrugStats(key), fetchIcons(key)]);
    // Your own fair fights against past targets, for the stat estimate. Kept for up to 300 players; a failure leaves the old copy.
    try {
      const seen = { ...(st.ffSeen?.byId ?? {}), ...observedFF(await fetchAttacks(key), myId) };
      const byId = Object.fromEntries(Object.entries<any>(seen).sort((a, b) => b[1].at - a[1].at).slice(0, 300));
      st.ffSeen = { at: t, mine: myScore(bs) ?? st.ffSeen?.mine ?? null, byId };
    } catch { /* keep the old copy */ }
    const icon = addictionIcon(ic); // the brain icon is what Torn shows; the stat modifier is the fallback
    st.extra = { at: t, addiction: icon ? icon.pct : addictionFrom(bs), addictionLabel: icon?.label ?? null, rehabs: rehabCount(ds), ...drugCounts(ds) };
  } catch { st.extra = { ...(st.extra ?? {}), at: t }; } // keep the old numbers and retry in 10 minutes
}

// FF Scouter list, refreshed every 2 minutes: players that fit your difficulty cap, plus their public profile for hospital times.
async function refreshFF(key: string, ffKey: string, cfg: any, st: any, t: number) {
  if (!cfg.ffEnabled || !ffKey || (st.ff && t - st.ff.at < 120 && st.ff.maxff === cfg.ffMaxFF)) return;
  try {
    // FF Scouter already gives name, level, difficulty and last action. Only players offline long enough need a profile lookup (for hospital time).
    // FF Scouter returns players right at the difficulty asked for, so ask for a few bands up to your setting to get a mix.
    const bands = [...new Set([Math.max(1, cfg.ffMaxFF - 0.6), Math.max(1, cfg.ffMaxFF - 0.3), cfg.ffMaxFF].map(x => Math.round(x * 10) / 10))];
    // Each band gets an equal share, so the difficulty you chose is always represented.
    const perBand = Math.floor(40 / bands.length), seen = new Set<number>();
    const rows = (await Promise.all(bands.map(async b => (await fetchFFTargets(ffKey, { maxff: b, limit: 30 }))
      .filter(r => r.lastAction > 0 && t - r.lastAction >= cfg.targetMinOfflineMin * 60).slice(0, perBand)))).flat()
      .filter(r => !seen.has(r.id) && seen.add(r.id));
    const list = (await Promise.all(rows.map(async r => {
      const p = await fetchProfile(key, r.id).catch(() => null);
      return p ? { ...compact([{ id: r.id, ...p }])[0], ff: r.ff, bs: r.bs } : null;
    }))).filter(Boolean);
    st.ff = { at: t, maxff: cfg.ffMaxFF, list };
  } catch (e: any) {
    st.ff = { at: t, maxff: cfg.ffMaxFF, list: st.ff?.list ?? [], error: e instanceof FFError ? (e.code === 6 ? 'FF Scouter key is not registered' : e.message) : 'FF Scouter unreachable' };
  }
}

export function targetsView(cfg: any, st: any, level: number, now: number, ffKey: string): TargetsView | undefined {
  const o = { myLevel: level, maxAbove: cfg.targetMaxLevelAbove, minOfflineSecs: cfg.targetMinOfflineMin * 60, now, limit: 40 };
  if (cfg.ffEnabled && ffKey && st.ff) return { ...pickTargets(st.ff.list, { ...o, useFF: true }), source: 'ff', ...(st.ff.error ? { error: st.ff.error } : {}) }; // Firestore rejects undefined fields
  if (cfg.ffEnabled && !ffKey) return { matches: [], total: 0, source: 'ff', error: 'FF Scouter key is not set up on the server' };
  // Without FF Scouter, rows get the fair fight you last got against that player and a floor for their stats (see ffestimate.ts).
  const mine: number | null = st.ffSeen?.mine ?? null;
  return st.targets ? { ...pickTargets(st.targets.list.map((x: any) => ({ ...x, ...rowFor(st.ffSeen?.byId?.[x.id], mine) })), o), source: 'list' } : undefined;
}

// Build the plan from live data. Shared by /tick and /state.
export function plan(user: any, oc: any, cfg: any, st: any, t: number) {
  const first = computePlan({ user, oc, cfg, t, learned: st.learned });
  const cc = first.phase === 'abroad' ? first.here.id : cfg.dest;
  const stock = cfg.item ? findStock(st.yata, cc, cfg.item) : null;
  return computePlan({ user, oc, cfg, t, learned: st.learned, stock });
}

export async function tick({ uid, key, ffKey }: Ctx): Promise<{ ok: boolean; phase?: string; note?: string }> {
  const t0 = Date.now(), steps: Record<string, number> = {};
  const timed = async <T>(name: string, p: Promise<T>): Promise<T> => { const s0 = Date.now(); try { return await p; } finally { steps[name] = Date.now() - s0; } };
  try { return await tickInner({ uid, key, ffKey }, timed); } finally {
    if (Date.now() - t0 > 5000) console.warn('slow tick', uid, Date.now() - t0, 'ms', JSON.stringify(steps)); // names the slow outside call
  }
}

async function tickInner({ uid, key, ffKey }: Ctx, timed: <T>(name: string, p: Promise<T>) => Promise<T>): Promise<{ ok: boolean; phase?: string; note?: string }> {
  const [cfg, st] = await Promise.all([getSettings(uid), getState(uid)]);
  const stored = structuredClone(st); // st is edited below; this is what the database holds
  if (st.hist) { await seedHistFrom(st.hist); delete st.hist; } // older versions kept restock history per player; it is shared now
  const wall = Math.floor(Date.now() / 1000);
  if (st.backoffUntil > wall) return { ok: true, note: 'backoff' };

  let user: any, oc: any;
  try {
    [user, oc] = await timed('torn_user_oc', Promise.all([fetchUser(key), fetchOC(key)]));
  } catch (e: any) {
    if (isRateLimit(e)) { await saveState(uid, { ...st, backoffUntil: wall + 120 }); return { ok: false, note: 'rate limited' }; }
    if (isKeyProblem(e)) {
      const k = `key:${Math.floor(wall / 86400)}`;
      if (!st.sent?.[k]) {
        await push(uid, st.model as Widget | undefined, [{ text: 'Torn API key problem — check settings', url: null }]).catch(() => {});
        await saveState(uid, { ...st, sent: { ...st.sent, [k]: wall } });
      }
      return { ok: false, note: 'key problem' };
    }
    throw e;
  }
  const t: number = user.timestamp ?? wall; // server time corrects clock offset

  // Stock reports and restock history are shared by all players and fetched once a minute for the whole server.
  st.yata = await timed('yata', sharedYata(t));
  const hist = await timed('hist', sharedHist());

  // In-game Targets list, refreshed every 2 minutes (1 to 3 API calls).
  if (!st.targets || t - st.targets.at >= 120) {
    try { st.targets = { at: t, list: compact(await timed('targets', fetchTargets(key))) }; } catch { /* keep the cached list */ }
  }
  await timed('ff', refreshFF(key, ffKey, cfg, st, t));
  const addictionBefore = st.extra?.addiction;
  await timed('extra', refreshExtra(key, st, t, Number(user.player_id)));
  const tg = targetsView(cfg, st, user.level ?? 0, t, ffKey);

  let p = plan(user, oc, cfg, st, t);

  // Learn real flight time from an outbound flight.
  const tr = user.travel || {};
  if (p.phase === 'traveling' && p.outbound && tr.departed && tr.timestamp) {
    const d = DESTS.find(x => x.name === p.where);
    const l = d && learnFlight(cfg, d.id, tr.departed, tr.timestamp);
    if (l) { st.learned = { ...st.learned, [l.key]: l.secs }; p = plan(user, oc, cfg, st, t); }
  }

  const hk = cfg.item ? `${p.phase === 'abroad' ? p.here.id : cfg.dest}:${cfg.item.toLowerCase()}` : null;
  const rs = hk ? estimate(hist[hk], t) : undefined;

  const phaseChanged = p.phase !== st.phase;
  const landedCash = phaseChanged ? (p.phase === 'abroad' ? user.money_onhand : null) : st.landedCash;
  let bought = nextBought({ prevBought: !!st.bought, phaseChanged, abroad: p.phase === 'abroad', cost: p.stock?.cost, landedCash, cash: user.money_onhand });

  const prev = { phase: st.phase, nextId: st.nextId, qty: st.stockQty, ocNow: st.ocNow, arrival: st.arrival, homeAt: st.homeAt };
  const sent = pruneSent(st.sent, wall, SENT_TTL);
  const bar = (b: any) => !!b && b.maximum > 0 && b.current >= b.maximum;
  const cd = user.cooldowns || {};
  const flags: Flags = { energy: bar(user.energy), nerve: bar(user.nerve), life: bar(user.life), drug: !(cd.drug > 0), booster: !(cd.booster > 0), medical: !(cd.medical > 0),
    medLow: cd.medical > 0 && cd.medical <= LOW_CD_SECS, boosterLow: cd.booster > 0 && cd.booster <= LOW_CD_SECS,
    hospital: p.phase === 'hospital' || (user.states?.hospital_timestamp ?? 0) > t, jail: p.phase === 'jail' || (user.states?.jail_timestamp ?? 0) > t };
  // The player's switches decide which alerts go out; a bad-key warning always does.
  // Addiction watcher: a more negative penalty than before means your addiction went up.
  const nowAddiction = st.extra?.addiction;
  const addictionEvents: Evt[] = typeof addictionBefore === 'number' && typeof nowAddiction === 'number' && nowAddiction < addictionBefore
    ? [{ key: `addiction:${nowAddiction}`, type: 'addiction_up', text: `Addiction rose to ${nowAddiction}%${st.extra.addictionLabel ? ` (${st.extra.addictionLabel})` : ''}`, url: null }] : [];
  // Optional alerts that cost extra Torn calls are only fetched when the player has switched them on.
  const awardBefore = st.awards;
  if (!alertOn(cfg, 'award_earned')) delete st.awards; // counts go stale while the alert is off
  if (alertOn(cfg, 'award_earned') && (!st.awards || t - st.awards.at >= 600)) {
    try { st.awards = { at: t, ...(await timed('awards', fetchAwards(key))) }; } catch { /* try again in 10 minutes */ st.awards = { ...(st.awards ?? { medals: null, honors: null }), at: t }; }
  }
  // Chain watch: polled every tick while a chain runs and every 5 minutes otherwise. A key without faction access is not asked again for an hour.
  if (!(st.chainOffUntil > t) && (!st.chain || t - st.chain.at >= (st.chain.current > 0 ? 30 : 300))) {
    try {
      const c = await timed('chain', fetchChain(key, t));
      st.chain = { at: t, current: c?.current ?? 0, max: c?.max ?? 0, endAt: c ? Math.round((t + c.left) / 5) * 5 : null }; // rounded so the widget is not re-sent for a second of drift
    } catch (e: any) { if (!isRateLimit(e)) { st.chainOffUntil = t + 3600; st.chain = { at: t, current: 0, max: 0, endAt: null, noAccess: true }; } }
  }
  const chain = st.chain?.current > 0 && st.chain.endAt ? { current: st.chain.current, left: st.chain.endAt - t } : null;
  const events: Evt[] = [...diffEvents(prev, p, cfg, bought), ...statusEvents(st.flags, flags, t), ...addictionEvents, ...abroadLongEvents(p, st.arrival, t), ...awardEvents(awardBefore, st.awards ?? { medals: null, honors: null }), ...chainEvents(chain, t)].filter(e => alertOn(cfg, e.type) && !sent[e.key]);

  const model = widgetModel(p, cfg, bought, user, rs, p.phase === 'traveling' ? (p.outbound ? 'Torn' : st.lastPlace ?? null) : null, tg, { ...st.extra, chain: st.chain });
  const changed = JSON.stringify({ ...model, updatedAt: 0 }) !== JSON.stringify({ ...st.model, updatedAt: 0 });
  if (changed || events.length) {
    try { await timed('push', push(uid, slimForPush(model), events)); } catch (e) {
      // Keep the old phase/model so the same events and widget update are tried again next tick.
      console.error('push failed', e);
      await saveState(uid, { ...st, learned: st.learned });
      return { ok: false, phase: p.phase, note: 'push failed' };
    }
  }
  for (const e of events) sent[e.key] = wall;

  // A BOUGHT tap that landed while this tick ran must not be overwritten.
  if (bought === !!st.bought) bought = !!(await getState(uid)).bought;

  const next = {
    ...st, phase: p.phase, nextId: p.next?.id ?? null, stockQty: p.stock ? p.stock.qty : null, ocNow: p.ocNow,
    arrival: p.phase === 'traveling' ? p.landAt : st.arrival ?? null,
    homeAt: prev.phase === 'traveling' && p.phase === 'home' ? st.arrival : st.homeAt ?? null,
    landedCash: landedCash ?? null, bought, sent, model, flags, lastPlace: p.phase === 'abroad' ? p.here.name : st.lastPlace ?? null
  };
  delete (next as any).snapshot; delete (next as any).yata; // old versions stored the raw Torn profile here; nothing reads it
  if (!sameState(next, stored)) await saveState(uid, next); // skip rewriting identical state
  return { ok: true, phase: p.phase };
}

// Fresh widget model without side effects (GET /state).
export async function currentModel({ uid, key, ffKey }: Ctx, fresh = false): Promise<Widget> {
  const [cfg, st, hist] = await Promise.all([getSettings(uid), getState(uid), sharedHist()]);
  const [user, oc] = await Promise.all([fetchUser(key), fetchOC(key)]);
  // A manual refresh pulls new stock too, but at most every 20 seconds so taps cannot hammer YATA.
  st.yata = await sharedYata(user.timestamp, fresh ? 20 : 120);
  const p = plan(user, oc, cfg, st, user.timestamp);
  const hk = cfg.item ? `${p.phase === 'abroad' ? p.here.id : cfg.dest}:${cfg.item.toLowerCase()}` : null;
  return widgetModel(p, cfg, !!st.bought, user, hk ? estimate(hist[hk], user.timestamp) : undefined, p.phase === 'traveling' ? (p.outbound ? 'Torn' : st.lastPlace ?? null) : null,
    targetsView(cfg, st, user.level ?? 0, user.timestamp, ffKey), { ...st.extra, chain: st.chain });
}
