import './firebase.ts';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchYata, type YataSnapshot } from './yata.ts';
import { observe, type Hist } from './restock.ts';

// Stock reports and restock history are the same for every player, so they are fetched and stored once, not per user.
const db = getFirestore();
const histDoc = () => db.doc('shared/hist');
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
      try { yata = await fetchYata(now); await learn(yata); } catch { failedAt = now; /* keep the cached copy */ } finally { inflight = null; }
    })();
  }
  if (!yata && inflight) await inflight; // nothing cached yet: this first fetch has to finish
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
