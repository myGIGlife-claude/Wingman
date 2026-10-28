// Prints the SHAPE of a few Torn API replies (field names and types, never values) so Wingman's parsers can be checked against the real API.
// Run: TORN_KEY=your16charkey node probe-shapes.mjs   (the key is used only for requests to api.torn.com and is never printed)
const key = process.env.TORN_KEY;
if (!/^[A-Za-z0-9]{16}$/.test(key ?? '')) { console.error('Set TORN_KEY to your 16-character key'); process.exit(1); }
const shape = (v, d = 0) => {
  if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1), `(${v.length} items)`] : [];
  if (v && typeof v === 'object') {
    if (d >= 4) return '{…}';
    const ks = Object.keys(v);
    // Objects keyed by id (all numeric keys) are shown once.
    if (ks.length > 3 && ks.every(k => /^\d+$/.test(k))) return { '<id>': shape(v[ks[0]], d + 1), '(count)': ks.length };
    return Object.fromEntries(ks.map(k => [k, shape(v[k], d + 1)]));
  }
  return typeof v;
};
const urls = {
  'v2 user/attacks': `https://api.torn.com/v2/user/attacks?limit=3&sort=desc`,
  'v2 user/battlestats': `https://api.torn.com/v2/user/battlestats`,
  'v1 key info': `https://api.torn.com/key/?selections=info`,
  'v1 faction chain': `https://api.torn.com/faction/?selections=chain`,
  'v1 medals+honors': `https://api.torn.com/user/?selections=medals,honors`,
  'v1 stocks': `https://api.torn.com/user/?selections=stocks`,
  'v2 faction crimes': `https://api.torn.com/v2/faction/crimes?limit=2`,
  'v1 inventory': `https://api.torn.com/user/?selections=inventory`,
};
for (const [name, u] of Object.entries(urls)) {
  try {
    const r = await fetch(`${u}${u.includes('?') ? '&' : '?'}key=${key}&comment=WingmanProbe`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    console.log(`\n== ${name}\n${JSON.stringify(j.error ? { error: j.error.code } : shape(j), null, 1)}`);
  } catch (e) { console.log(`\n== ${name}\nfailed: ${e.message}`); }
}
