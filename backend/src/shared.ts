import './firebase.ts';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchYata, type YataSnapshot } from './yata.ts';
import { observe, type Hist } from './restock.ts';
import { fetchLoot, type LootFact } from './loot.ts';

// Stock reports and restock history are the same for every player, so they are fetched and stored once, not per user.
const db = getFirestore();
const histDoc = () => db.doc('shared/hist');
const yataDoc = () => db.doc('shared/yata');
let yata: YataSnapshot | null = null;
let hist: Record<string, Hist> = {};
let histLoaded = 0;
let failedAt = 0;

// Keeps one YATA copy for the whole process. Once a copy exists, a refresh runs in the background and ticks use the cached one,
// so a slow or down YATA never stalls them; only the very first fetch is awaited. After a failure it waits a minute before trying again.
// shortcut: Cloud Run may pause CPU between requests, so a background refresh can finish a tick late. Fine at one tick a minute.
let inflight: Promise<void> | null = null;
export async function sharedYata(now: number, maxAge = 55): Promise<YataSnapshot | null> {
  if ((!yata || now - yata.fetchedAt >= maxAge) && now - failedAt >= 60 && !inflight) {
    inflight = (async () => {
      try { yata = await fetchYata(now); yataDoc().set(yata).catch(e => console.error('yata save failed', e?.message)); await learn(yata); } catch { failedAt = now; /* keep the cached copy */ } finally { inflight = null; }
    })();
  }
  // A cold instance starts from the last copy saved in the database, so a slow YATA cannot leave a tick without stock data.
  if (!yata) { try { yata = ((await yataDoc().get()).data() as YataSnapshot | undefined) ?? null; } catch { /* fall through */ } }
  // Nothing saved either: give the first fetch a moment, then carry on without stock data. It keeps running and fills in for the next tick.
  if (!yata && inflight) await Promise.race([inflight, new Promise(r => setTimeout(r, 1500))]);
  return yata;
}

async function learn(y: YataSnapshot) {
  await loadHist();
  for (const [cc, c] of Object.entries(y.stocks)) {
    for (const it of c.stocks ?? []) { const k = `${cc}:${String(it.name).toLowerCase()}`; hist[k] = observe(hist[k], it.quantity, c.update); }
  }
  await histDoc().set(hist).catch(e => console.error('hist save failed', e?.message));
}

async function loadHist() {
  if (Date.now() - histLoaded < 600_000 && histLoaded) return; // another instance may have written it; re-read every 10 minutes
  const d = await histDoc().get();
  hist = { ...(d.data() as Record<string, Hist> | undefined), ...hist };
  histLoaded = Date.now();
}

export async function sharedHist(): Promise<Record<string, Hist>> {
  await loadHist().catch(() => {});
  return hist;
}

// First run after the multi-user change: carry the owner's learned restock history over so it is not lost.
export async function seedHistFrom(old: Record<string, Hist> | undefined) {
  if (!old || Object.keys(hist).length) return;
  await loadHist();
  if (!Object.keys(hist).length) hist = old;
}

// NPC attack times: the same for every player, so fetched once a minute for the process, in the background (see sharedYata).
let loot: LootFact | null = null, lootAt = 0, lootFailedAt = 0, lootInflight: Promise<void> | null = null;
export async function sharedLoot(now: number): Promise<LootFact | null> {
  if (now - lootAt >= 60 && now - lootFailedAt >= 60 && !lootInflight) {
    lootInflight = (async () => {
      try { loot = await fetchLoot(); lootAt = now; } catch { lootFailedAt = now; } finally { lootInflight = null; }
    })();
  }
  if (!lootAt && lootInflight) await Promise.race([lootInflight, new Promise(r => setTimeout(r, 1500))]);
  return loot;
}
