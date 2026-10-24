// Learns how often a shop item restocks from the stock reports we see, then estimates the next one.
// Stock only ever goes up on a restock (buyers lower it), so any increase between two reports is a restock.
export interface Hist { qty: number; at: number; restocks: number[]; soldOutAt: number | null }
export interface Eta { eta: number | null; overdue: boolean; every: number | null; samples: number; soldOutAt: number | null }

const MIN_GAP = 300; // ignore "restocks" closer than 5 minutes: out-of-order reports, not real restocks

export function observe(h: Hist | undefined, qty: number, at: number): Hist {
  if (!h) return { qty, at, restocks: [], soldOutAt: qty === 0 ? at : null };
  if (at <= h.at) return h; // an older or repeated report
  const n: Hist = { ...h, restocks: [...h.restocks] };
  if (qty > h.qty) {
    const when = Math.round((h.at + at) / 2); // somewhere between the two reports
    const last = n.restocks[n.restocks.length - 1];
    if (last === undefined || when - last >= MIN_GAP) n.restocks = [...n.restocks, when].slice(-12);
    n.soldOutAt = null;
  } else if (qty === 0 && h.qty > 0) n.soldOutAt = at;
  n.qty = qty; n.at = at;
  return n;
}

export function estimate(h: Hist | undefined, now: number): Eta {
  const none: Eta = { eta: null, overdue: false, every: null, samples: 0, soldOutAt: h?.soldOutAt ?? null };
  if (!h || h.restocks.length < 2) return none;
  const gaps = h.restocks.slice(1).map((t, i) => t - h.restocks[i]).sort((a, b) => a - b);
  const every = gaps[Math.floor(gaps.length / 2)]; // median, so one odd gap does not skew it
  const eta = h.restocks[h.restocks.length - 1] + every;
  return { eta: eta > now ? eta : null, overdue: eta <= now, every, samples: gaps.length, soldOutAt: h.soldOutAt };
}
