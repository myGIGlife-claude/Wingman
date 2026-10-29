// Your own part in the current chain, from your attack log: each hit carries the chain number it landed at and the respect it earned.
export function chainHits(attacks: any[], myId: number, start: number): { hits: number; respect: number } {
  let hits = 0, respect = 0;
  for (const a of attacks ?? []) {
    if (Number(a?.attacker?.id) !== myId || !(Number(a?.chain) > 0) || !(Number(a?.started) >= start)) continue;
    hits++; respect += Number(a?.respect_gain) || 0;
  }
  return { hits, respect: Math.round(respect * 100) / 100 };
}
