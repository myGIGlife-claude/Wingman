// ==UserScript==
// @name         OC Run Planner
// @namespace    ocrp.torn
// @version      1.0.0
// @description  Torn PDA helper: OC countdown, "does a trip fit before my OC?" check, foreign stock watch with restock alarm, and a home checklist (Xanax, gym, crimes). Reads the API only. Every game action stays your tap.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @connect      yata.yt
// @run-at       document-end
// ==/UserScript==

/*
 * HOW IT WORKS
 *  - Reads your status, bars, cooldowns, travel and OC from the Torn API (your PDA key is used automatically).
 *  - Reads foreign shop stock from YATA (yata.yt), which other players keep updated.
 *  - Works out whether a round trip to your chosen country fits before your OC is ready.
 *  - At home it walks you through: Xanax (if drug cooldown is up) -> gym (if energy is full) -> crimes (if nerve is full) -> fly again (if time fits).
 *  - Abroad it shows the latest time you can leave, watches stock if your item is sold out, and alarms when it's back or when you must leave.
 *
 * WHAT IT NEVER DOES
 *  - It never clicks, submits, buys, flies, trains or uses items for you. Torn's scripting rules forbid scripts
 *    from making non-API requests you didn't trigger, and those get accounts banned. Buttons here are plain links.
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* constants                                                           */
  /* ------------------------------------------------------------------ */

  const PDA_KEY = '###PDA-APIKEY###'; // Torn PDA swaps this for your key. Keep it the only copy of that text in the file.
  const NS = 'ocrp:';
  const COMMENT = 'OCRunPlanner';

  // Standard one-way flight minutes. Other flight types scale from these, and the script
  // replaces them with your real measured time after your first flight to a place.
  const DESTS = [
    { id: 'mex', name: 'Mexico', short: 'Mexico', min: 26, alias: ['mexico', 'ciudad juarez', 'mexican'] },
    { id: 'cay', name: 'Cayman Islands', short: 'Cayman', min: 35, alias: ['cayman islands', 'cayman', 'george town', 'caymanian'] },
    { id: 'can', name: 'Canada', short: 'Canada', min: 41, alias: ['canada', 'toronto', 'canadian'] },
    { id: 'haw', name: 'Hawaii', short: 'Hawaii', min: 134, alias: ['hawaii', 'honolulu', 'hawaiian'] },
    { id: 'uni', name: 'United Kingdom', short: 'UK', min: 159, alias: ['united kingdom', 'uk', 'london', 'british'] },
    { id: 'arg', name: 'Argentina', short: 'Argentina', min: 167, alias: ['argentina', 'buenos aires', 'argentinian'] },
    { id: 'swi', name: 'Switzerland', short: 'Swiss', min: 175, alias: ['switzerland', 'zurich', 'swiss'] },
    { id: 'jap', name: 'Japan', short: 'Japan', min: 225, alias: ['japan', 'tokyo', 'japanese'] },
    { id: 'chi', name: 'China', short: 'China', min: 242, alias: ['china', 'beijing', 'chinese'] },
    { id: 'uae', name: 'UAE', short: 'UAE', min: 271, alias: ['uae', 'united arab emirates', 'dubai', 'emirati'] },
    { id: 'sou', name: 'South Africa', short: 'S. Africa', min: 297, alias: ['south africa', 'johannesburg', 'south african'] },
  ];

  const METHODS = {
    standard: { label: 'Standard', mult: 1 },
    airstrip: { label: 'Airstrip (private island)', mult: 0.7 },
    wlt: { label: 'WLT stock benefit', mult: 0.5 },
    business: { label: 'Business class ticket', mult: 0.3 },
  };

  const DEFAULTS = {
    dest: 'mex', item: '', method: 'standard',
    shopMin: 3, safetyMin: 10, poll: 60,
    xanax: true, sound: true, side: 'left', key: '',
  };

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const now = () => Math.floor(Date.now() / 1000);
  const pad = n => String(Math.max(0, Math.floor(n))).padStart(2, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

  function load(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }

  function fmtDur(s) {
    s = Math.max(0, Math.round(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h) return `${h}h ${pad(m)}m`;
    if (m) return `${m}m ${pad(sec)}s`;
    return `${sec}s`;
  }
  function hms(s) {
    s = Math.max(0, Math.round(s || 0));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }
  function clock(ts) {
    try { return new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function destFromText(txt) {
    if (!txt) return null;
    const t = fold(txt);
    for (const d of DESTS) {
      for (const a of d.alias) {
        if (new RegExp(`(^|[^a-z])${reEsc(a)}([^a-z]|$)`).test(t)) return d;
      }
    }
    return null;
  }

  function flightSecs(cfg, destId, learned) {
    const k = `${destId}:${cfg.method}`;
    if (learned && learned[k]) return learned[k];
    const d = DESTS.find(x => x.id === destId) || DESTS[0];
    const mult = (METHODS[cfg.method] || METHODS.standard).mult;
    return Math.round(d.min * 60 * mult);
  }

  /* ------------------------------------------------------------------ */
  /* planning logic (pure: no DOM, no network)                           */
  /* ------------------------------------------------------------------ */

  function ocInfo(oc) {
    if (oc === undefined) return { known: false, ready: null, label: 'OC status unavailable' };
    if (!oc) return { known: true, ready: null, label: 'Not in an organized crime' };
    const finished = ['Successful', 'Failure', 'Expired'].includes(oc.status) || !!oc.executed_at;
    if (finished) return { known: true, ready: null, label: `Last OC ${String(oc.status || 'finished').toLowerCase()} — join a new one` };
    if (!oc.ready_at) {
      return { known: true, ready: null, pending: true, name: oc.name, status: oc.status,
        label: `${oc.name || 'OC'} · ${oc.status || 'Recruiting'} · no ready time yet` };
    }
    return { known: true, ready: oc.ready_at, name: oc.name, status: oc.status, label: `${oc.name || 'OC'} · ${oc.status || ''}` };
  }

  function computePlan(x) {
    const { user, oc, cfg, t, learned, stock } = x;
    const status = user.status || {};
    const st = status.state || 'Okay';
    const tr = user.travel || {};
    const o = ocInfo(oc);
    const target = DESTS.find(d => d.id === cfg.dest) || DESTS[0];
    const safety = (cfg.safetyMin || 0) * 60;
    const shop = (cfg.shopMin || 0) * 60;
    const fly = flightSecs(cfg, target.id, learned);
    const roundTrip = fly * 2 + shop + safety;

    const p = { t, phase: 'home', oc: o, target, fly, roundTrip, stock, steps: [], next: null, alts: [] };
    p.ocNow = !!(o.ready && o.ready <= t);
    p.flyBy = o.ready ? o.ready - roundTrip : null; // latest take-off from Torn that still beats the OC
    p.fits = o.ready ? t <= p.flyBy : true;

    // In the air
    if (st === 'Traveling' || (tr.timestamp && tr.timestamp > t && st !== 'Abroad' && st !== 'Hospital' && st !== 'Jail')) {
      p.phase = 'traveling';
      const toTorn = /torn/i.test(tr.destination || '');
      const there = toTorn ? null : (destFromText(tr.destination) || destFromText(status.description));
      p.outbound = !toTorn;
      p.landAt = tr.timestamp || t;
      p.where = toTorn ? 'Torn' : (there ? there.name : (tr.destination || 'abroad'));
      p.whereShort = toTorn ? 'Torn' : (there ? there.short : p.where);
      if (o.ready && p.outbound) {
        const back = flightSecs(cfg, (there || target).id, learned);
        p.leaveBy = o.ready - back - safety;
        p.lateRisk = p.landAt + shop > p.leaveBy;
      }
      if (o.ready && !p.outbound) p.lateRisk = p.landAt > o.ready;
      return p;
    }

    // Landed abroad
    if (st === 'Abroad') {
      p.phase = 'abroad';
      p.here = destFromText(tr.destination) || destFromText(status.description) || target;
      p.flyBack = flightSecs(cfg, p.here.id, learned);
      p.leaveBy = o.ready ? o.ready - p.flyBack - safety : null;
      return p;
    }

    // Hospital / jail
    if (st === 'Hospital' || st === 'Jail' || st === 'Federal') {
      p.phase = st.toLowerCase();
      p.until = status.until || null;
      return p;
    }

    // Home in Torn
    const e = user.energy || {}, n = user.nerve || {}, cd = user.cooldowns || {};
    const drug = Math.max(0, cd.drug || 0);
    if (cfg.xanax) {
      p.steps.push({ id: 'xanax', label: 'Take a Xanax', ready: drug <= 0, at: t + drug, href: '/item.php', go: 'Open items' });
    }
    p.steps.push({ id: 'gym', label: 'Train in the gym', ready: e.maximum > 0 && e.current >= e.maximum,
      cur: e.current, max: e.maximum, at: e.fulltime ? t + e.fulltime : null, href: '/gym.php', go: 'Open gym' });
    p.steps.push({ id: 'crimes', label: 'Do your crimes', ready: n.maximum > 0 && n.current >= n.maximum,
      cur: n.current, max: n.maximum, at: n.fulltime ? t + n.fulltime : null, href: '/loader.php?sid=crimes', go: 'Open crimes' });
    p.steps.push({ id: 'fly', label: `Fly to ${target.name}`, ready: !!cfg.item && p.fits && !p.ocNow,
      href: '/travelagency.php', go: 'Open travel agency' });
    p.next = p.steps.find(s => s.ready) || null;

    if (o.ready && !p.fits && !p.ocNow) {
      p.alts = DESTS.filter(d => d.id !== target.id && t + flightSecs(cfg, d.id, learned) * 2 + shop + safety <= o.ready)
        .map(d => d.short);
    }
    return p;
  }

  // Export the pure parts for testing outside the browser.
  if (typeof module === 'object' && module.exports) {
    module.exports = { computePlan, ocInfo, destFromText, flightSecs, fmtDur, hms, DESTS, METHODS, DEFAULTS };
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__ocrpLoaded) return;
  window.__ocrpLoaded = true;

  /* ------------------------------------------------------------------ */
  /* state                                                               */
  /* ------------------------------------------------------------------ */

  const S = {
    cfg: Object.assign({}, DEFAULTS, load('cfg', {})),
    mem: Object.assign({ lastPhase: null, bought: false, lastQty: {}, leaveAlarm: 0 }, load('mem', {})),
    learned: load('learned', {}),
    user: null, oc: undefined, ocErr: null, err: null,
    fetchedAt: 0, offset: 0, lastTornPoll: 0, polling: false,
    yata: load('yata', null), yataTried: load('yataTried', 0), yataErr: null, yataPolling: false,
    open: load('open', false), settings: false, banner: null,
    plan: null, root: null, lastMain: '', lastPill: '', firstHL: null, scrolled: {},
  };

  const cache = load('cache', null);
  if (cache && cache.user) {
    S.user = cache.user;
    S.oc = cache.oc === '__unknown' ? undefined : cache.oc;
    S.fetchedAt = cache.fetchedAt || 0;
    S.offset = cache.offset || 0;
    S.lastTornPoll = cache.fetchedAt || 0;
  }

  const tNow = () => now() + S.offset; // Torn server time

  function hasPdaKey() { return !!PDA_KEY && PDA_KEY.indexOf('###') !== 0 && PDA_KEY.length >= 16; }
  function apiKey() { return hasPdaKey() ? PDA_KEY : String(S.cfg.key || '').trim(); }

  /* ------------------------------------------------------------------ */
  /* network (API reads only)                                            */
  /* ------------------------------------------------------------------ */

  function getJSON(url) {
    if (typeof window.PDA_httpGet === 'function') {
      return window.PDA_httpGet(url).then(r => JSON.parse(r.responseText));
    }
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((res, rej) => GM_xmlhttpRequest({
        method: 'GET', url, timeout: 20000,
        onload: r => { try { res(JSON.parse(r.responseText)); } catch (e) { rej(e); } },
        onerror: rej, ontimeout: () => rej(new Error('timeout')),
      }));
    }
    return fetch(url).then(r => r.json());
  }

  async function pollTorn() {
    if (S.polling) return;
    const key = apiKey();
    if (!key) { S.err = 'Add your Torn API key in settings (⚙).'; afterUpdate(); return; }
    S.polling = true;
    try {
      const [u, oc] = await Promise.all([
        getJSON(`https://api.torn.com/user/?selections=basic,bars,cooldowns,travel,timestamp&key=${key}&comment=${COMMENT}`),
        getJSON(`https://api.torn.com/v2/user/organizedcrime?key=${key}&comment=${COMMENT}`)
          .catch(e => ({ error: { error: String(e && e.message || e) } })),
      ]);
      if (!u || u.error) throw new Error(`Torn API: ${(u && u.error && (u.error.error || 'error ' + u.error.code)) || 'no response'}`);
      const local = now();
      S.user = u;
      S.offset = u.timestamp ? u.timestamp - local : 0;
      S.fetchedAt = local;
      if (oc && oc.error) { S.oc = undefined; S.ocErr = oc.error.error || 'OC lookup failed'; }
      else {
        const v = oc ? (oc.organizedCrime !== undefined ? oc.organizedCrime : oc.organizedcrime) : null;
        S.oc = v === undefined ? null : v;
        S.ocErr = null;
      }
      S.err = null;
      learnFlight(u.travel);
      save('cache', { user: S.user, oc: S.oc === undefined ? '__unknown' : S.oc, fetchedAt: S.fetchedAt, offset: S.offset });
    } catch (e) {
      S.err = (e && e.message) || String(e);
    } finally {
      S.polling = false;
      S.lastTornPoll = now();
    }
    afterUpdate();
  }

  // After you fly somewhere, remember the real one-way time for that place + flight type.
  function learnFlight(tr) {
    if (!tr || !tr.departed || !tr.timestamp || /torn/i.test(tr.destination || '')) return;
    const d = destFromText(tr.destination);
    if (!d) return;
    const secs = tr.timestamp - tr.departed;
    if (secs < 120 || secs > 6 * 3600) return;
    const expected = flightSecs({ method: S.cfg.method }, d.id, null);
    if (Math.abs(secs - expected) / expected > 0.4) return; // different flight type than the one in settings
    S.learned[`${d.id}:${S.cfg.method}`] = secs;
    save('learned', S.learned);
  }

  async function pollYata() {
    if (S.yataPolling) return;
    S.yataPolling = true;
    S.yataTried = now();
    save('yataTried', S.yataTried);
    try {
      const j = await getJSON('https://yata.yt/api/v1/travel/export/');
      if (!j || !j.stocks) throw new Error('bad data');
      S.yata = j.stocks;
      S.yataErr = null;
      save('yata', S.yata);
    } catch (e) {
      S.yataErr = 'Stock feed unavailable right now';
    } finally {
      S.yataPolling = false;
    }
    afterUpdate();
  }

  function stockFor(destId, item) {
    if (!S.yata || !item) return null;
    const c = S.yata[destId];
    if (!c) return null;
    const list = Array.isArray(c.stocks) ? c.stocks : [];
    const q = fold(item.trim());
    const it = list.find(s => fold(s.name) === q) || list.find(s => fold(s.name).includes(q));
    if (!it) return { missing: true, updated: c.update || 0 };
    return {
      name: it.name,
      qty: Number(it.quantity != null ? it.quantity : (it.qty != null ? it.qty : 0)),
      cost: Number(it.cost != null ? it.cost : (it.price || 0)),
      updated: c.update || 0,
    };
  }
  function itemNames(destId) {
    const c = S.yata && S.yata[destId];
    return c && Array.isArray(c.stocks) ? c.stocks.map(s => s.name).filter(Boolean).sort() : [];
  }

  function scheduler() {
    const t = now();
    const p = S.plan;
    if (!S.polling) {
      const due = t - S.lastTornPoll >= Math.max(30, S.cfg.poll);
      const justLanded = p && p.phase === 'traveling' && p.landAt && tNow() >= p.landAt + 3 && t - S.lastTornPoll > 10;
      const justFreed = p && p.until && tNow() >= p.until + 3 && t - S.lastTornPoll > 10;
      if (due || justLanded || justFreed) pollTorn();
    }
    const watching = p && p.phase === 'abroad' && !S.mem.bought;
    if (!S.yataPolling && t - (S.yataTried || 0) >= (watching ? 60 : 300)) pollYata();
  }

  /* ------------------------------------------------------------------ */
  /* plan + alarms                                                       */
  /* ------------------------------------------------------------------ */

  function computeNow() {
    if (!S.user) return null;
    const t = tNow();
    const elapsed = Math.max(0, now() - S.fetchedAt);
    const u = JSON.parse(JSON.stringify(S.user));
    if (u.cooldowns) for (const k of Object.keys(u.cooldowns)) u.cooldowns[k] = Math.max(0, (u.cooldowns[k] || 0) - elapsed);
    for (const b of ['energy', 'nerve']) if (u[b] && u[b].fulltime) u[b].fulltime = Math.max(0, u[b].fulltime - elapsed);
    const abroadHere = u.status && u.status.state === 'Abroad' ? destFromText(u.travel && u.travel.destination) : null;
    const stock = stockFor(abroadHere ? abroadHere.id : S.cfg.dest, S.cfg.item);
    return computePlan({ user: u, oc: S.oc, cfg: S.cfg, t, learned: S.learned, stock });
  }

  function transitions(p) {
    const m = S.mem;
    let dirty = false;
    if (p.phase !== m.lastPhase) {
      if (m.lastPhase === 'traveling' && p.phase === 'abroad') {
        alarm(`Landed in ${p.here.name}`, S.cfg.item && !(p.stock && p.stock.qty === 0) ? `Go buy ${S.cfg.item}.` : 'Checking stock for you.', 'soft');
      } else if (m.lastPhase === 'traveling' && p.phase === 'home') {
        alarm('Back in Torn', p.next ? `Next: ${p.next.label}.` : 'Nothing is ready yet — the board shows what\'s next.', 'soft');
      }
      if (p.phase === 'home' || (p.phase === 'abroad' && m.lastPhase !== 'abroad')) m.bought = false;
      m.lastPhase = p.phase;
      dirty = true;
    }
    if (p.phase === 'abroad' && !m.bought && S.cfg.item && p.stock && !p.stock.missing) {
      const k = `${p.here.id}:${fold(S.cfg.item)}`;
      const prev = m.lastQty[k];
      if (prev === 0 && p.stock.qty > 0) {
        alarm(`${p.stock.name} is back in stock`, `${p.stock.qty.toLocaleString()} available — reload the shop page and buy.`, 'loud');
      }
      if (prev !== p.stock.qty) { m.lastQty[k] = p.stock.qty; dirty = true; }
    }
    if (p.phase === 'abroad' && p.leaveBy) {
      const left = p.leaveBy - p.t;
      if (left <= 300 && left > -900 && m.leaveAlarm !== p.leaveBy) {
        alarm(left > 0 ? `Leave within ${fmtDur(left)}` : 'Leave now', 'Fly home to make it back before your OC is ready.', 'loud');
        m.leaveAlarm = p.leaveBy;
        dirty = true;
      }
    }
    if (dirty) save('mem', m);
  }

  let actx = null;
  function unlockAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { /* no audio */ }
  }
  function beep(times) {
    try {
      unlockAudio();
      if (!actx) return;
      const t0 = actx.currentTime;
      for (let i = 0; i < times; i++) {
        const o = actx.createOscillator(), g = actx.createGain(), at = t0 + i * 0.32;
        o.type = 'square';
        o.frequency.value = i % 2 ? 660 : 880;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
        o.connect(g).connect(actx.destination);
        o.start(at);
        o.stop(at + 0.27);
      }
    } catch (e) { /* no audio */ }
  }
  let titleTimer = null;
  function flashTitle(msg) {
    clearInterval(titleTimer);
    const orig = document.title;
    let n = 0;
    titleTimer = setInterval(() => {
      document.title = n % 2 ? orig : `⚠ ${msg}`;
      if (++n > 20) { clearInterval(titleTimer); document.title = orig; }
    }, 1000);
  }
  function alarm(title, body, level) {
    S.banner = { title, body, level };
    S.open = true;
    save('open', true);
    if (S.cfg.sound) beep(level === 'loud' ? 4 : 1);
    try { if (navigator.vibrate) navigator.vibrate(level === 'loud' ? [300, 120, 300, 120, 500] : [180]); } catch (e) { /* no vibration */ }
    flashTitle(title);
    if (S.root) {
      S.root.classList.add('alarm');
      setTimeout(() => S.root && S.root.classList.remove('alarm'), 8000);
    }
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                           */
  /* ------------------------------------------------------------------ */

  const cd = (ts, k, cls) => `<span${cls ? ` class="${cls}"` : ''} data-cd="${Math.round(ts)}" data-k="${k}"></span>`;
  const flaps = (ts, cls) => `<div class="ocrp-flaps ${cls || ''}" data-cd="${Math.round(ts)}" data-k="flap"></div>`;

  function stockLine(st, dest) {
    if (!S.cfg.item) return 'Pick an item in ⚙ to see its stock.';
    if (!st) return S.yataErr ? esc(S.yataErr) : 'Stock: waiting for data…';
    if (st.missing) return `${esc(S.cfg.item)} isn't on YATA's list for ${esc(dest.name)} — check the spelling in ⚙.`;
    const updated = st.updated ? ` · seen ${cd(st.updated, 'ago')}` : '';
    return st.qty > 0
      ? `<b class="in">${st.qty.toLocaleString()} in stock</b> · $${st.cost.toLocaleString()}${updated}`
      : `<b class="out">Sold out</b> · $${st.cost.toLocaleString()}${updated}`;
  }

  function stepNote(s, p) {
    const c = S.cfg, o = p.oc;
    if (s.id === 'xanax') return s.ready ? 'Drug cooldown is up' : `Cooldown ends in ${cd(s.at, 'dur')}`;
    if (s.id === 'gym' || s.id === 'crimes') {
      const unit = s.id === 'gym' ? 'energy' : 'nerve';
      return `${s.cur == null ? '?' : s.cur}/${s.max == null ? '?' : s.max} ${unit}${!s.ready && s.at ? ` · full in ${cd(s.at, 'dur')}` : ''}`;
    }
    if (!c.item) return 'Choose what to buy in ⚙ settings';
    if (p.ocNow) return 'Your OC is ready — stay in Torn';
    if (!o.ready) return `Round trip ${fmtDur(p.roundTrip)} · ${o.pending ? 'OC has no ready time yet' : 'no OC timer'}`;
    if (p.fits) return `Round trip ${fmtDur(p.roundTrip)} · take off by ${clock(p.flyBy)} (${cd(p.flyBy, 'dur')})`;
    return `Needs ${fmtDur(p.roundTrip)} — OC in ${cd(o.ready, 'dur')}`;
  }

  function pillHTML(p) {
    if (!p) return `<b>OC Run</b><span class="sep">·</span><span>${S.err ? 'tap to set up' : 'loading'}</span>`;
    const parts = [];
    if (p.phase === 'traveling') {
      parts.push(`✈ ${esc(p.whereShort)}`, `<b>${cd(p.landAt, 'hms')}</b>`);
    } else if (p.phase === 'abroad') {
      parts.push(esc(p.here.short));
      if (p.leaveBy) parts.push(`leave <b>${cd(p.leaveBy, 'hms')}</b>`);
      if (!S.mem.bought && p.stock && !p.stock.missing) parts.push(p.stock.qty > 0 ? `<b>${p.stock.qty} in stock</b>` : 'sold out');
    } else if (p.phase === 'home') {
      const o = p.oc;
      parts.push(o.ready && !p.ocNow ? `OC <b>${cd(o.ready, 'hms')}</b>` : p.ocNow ? '<b>OC ready</b>' : 'no OC timer');
      parts.push(p.next ? `next <b>${esc(p.next.id)}</b>` : 'waiting');
    } else {
      parts.push(esc(p.phase));
      if (p.until) parts.push(`<b>${cd(p.until, 'hms')}</b>`);
    }
    return parts.join('<span class="sep">·</span>');
  }

  function mainHTML(p) {
    const c = S.cfg;
    let h = `<div class="ocrp-head"><span class="ocrp-title"><i class="ocrp-dot"></i>OC Run Board</span><span class="ocrp-icons">`
      + `<button class="ocrp-ic" data-act="refresh" aria-label="Refresh">⟳</button>`
      + `<button class="ocrp-ic" data-act="settings" aria-label="Settings">⚙</button>`
      + `<button class="ocrp-ic" data-act="close" aria-label="Minimize">—</button></span></div>`;
    if (S.banner) {
      h += `<button class="ocrp-banner ${S.banner.level}" data-act="dismiss"><b>${esc(S.banner.title)}</b>`
        + `<span>${esc(S.banner.body)}</span><small>Tap to dismiss</small></button>`;
    }
    if (S.err) h += `<div class="ocrp-err">${esc(S.err)}</div>`;
    if (!p) return h + `<div class="ocrp-empty">${S.err ? '' : 'Loading your Torn data…'}</div>`;

    // Organized crime countdown
    const o = p.oc;
    h += `<section class="ocrp-oc"><div class="ocrp-lbl">Organized crime ready in</div>`;
    if (o.ready && !p.ocNow) {
      h += flaps(o.ready) + `<div class="ocrp-sub">${esc(o.name || 'OC')}${o.status ? ' · ' + esc(o.status) : ''} · ${clock(o.ready)}</div>`;
    } else if (p.ocNow) {
      h += `<div class="ocrp-big stop">Ready now</div><div class="ocrp-sub">${esc(o.name || 'Your OC')} is ready — stay in Torn.</div>`;
    } else {
      h += `<div class="ocrp-big dim">--:--:--</div><div class="ocrp-sub">${esc(o.label)}${S.ocErr ? ' · ' + esc(S.ocErr) : ''}</div>`;
    }
    h += `</section>`;

    // Departure-board row
    const dest = p.here || p.target;
    let badge;
    if (p.phase === 'home') badge = p.ocNow ? ['stop', 'Hold'] : p.fits ? ['go', 'Fits'] : ['stop', 'No time'];
    else if (p.phase === 'traveling') badge = ['wait', p.outbound ? 'Outbound' : 'Inbound'];
    else if (p.phase === 'abroad') badge = ['wait', S.mem.bought ? 'Go home' : 'Shopping'];
    else badge = ['stop', p.phase];
    h += `<section class="ocrp-board"><div class="ocrp-bh"><span>Dest</span><span>Item</span><span>Trip</span><span>Status</span></div>`
      + `<div class="ocrp-br"><span>${esc(dest.short)}</span><span>${esc(c.item || '—')}</span><span>${fmtDur(p.roundTrip)}</span>`
      + `<span class="ocrp-st ${badge[0]}">${esc(badge[1])}</span></div>`
      + `<div class="ocrp-stock">${stockLine(p.stock, dest)}</div></section>`;

    if (p.phase === 'home') {
      const n = p.next;
      if (n) {
        h += `<section class="ocrp-next"><div class="ocrp-lbl">Next up</div><div class="ocrp-nlabel">${esc(n.label)}</div>`
          + `<div class="ocrp-sub">${stepNote(n, p)}</div><a class="ocrp-btn" href="${n.href}">${esc(n.go)} →</a></section>`;
      } else {
        let why = 'Waiting on the timers below.';
        if (!c.item) why = 'Pick a destination and item in ⚙ to plan a run.';
        else if (p.alts.length) why = `${esc(p.target.name)} won't make it back in time. Shorter runs that fit: ${esc(p.alts.join(', '))}.`;
        h += `<section class="ocrp-next idle"><div class="ocrp-lbl">Next up</div><div class="ocrp-nlabel">Nothing ready</div><div class="ocrp-sub">${why}</div></section>`;
      }
      h += `<ol class="ocrp-steps">` + p.steps.map(s =>
        `<li class="${s.ready ? 'ready' : ''}${n && n.id === s.id ? ' cur' : ''}"><i></i>`
        + `<span><b>${esc(s.label)}</b><small>${stepNote(s, p)}</small></span>`
        + (s.ready ? `<a href="${s.href}">Go</a>` : '') + `</li>`).join('') + `</ol>`;
    }

    if (p.phase === 'traveling') {
      h += `<section class="ocrp-next"><div class="ocrp-lbl">${p.outbound ? 'En route to' : 'Returning to'} ${esc(p.where)}</div>`
        + flaps(p.landAt, 'sm')
        + `<div class="ocrp-sub">Lands ${clock(p.landAt)} · then ${p.outbound ? 'buy <b>' + esc(c.item || 'your item') + '</b>' : 'Xanax / gym / crimes'}</div>`
        + (p.outbound && p.leaveBy ? `<div class="ocrp-sub">Must leave there by <b>${clock(p.leaveBy)}</b> to beat your OC</div>` : '')
        + (p.lateRisk ? `<div class="ocrp-warn">${p.outbound ? 'Tight: landing plus shopping runs past your leave-by time.' : 'You land after your OC is ready.'}</div>` : '')
        + `</section>`;
    }

    if (p.phase === 'abroad') {
      const bought = S.mem.bought;
      h += `<section class="ocrp-next"><div class="ocrp-lbl">In ${esc(p.here.name)} · leave by</div>`;
      if (p.leaveBy) {
        h += flaps(p.leaveBy, `sm${p.leaveBy - p.t < 600 ? ' hot' : ''}`)
          + `<div class="ocrp-sub">Latest departure ${clock(p.leaveBy)} — ${fmtDur(p.flyBack)} flight + ${c.safetyMin}m buffer</div>`;
      } else {
        h += `<div class="ocrp-big dim">No deadline</div><div class="ocrp-sub">No OC ready time, so there's no rush.</div>`;
      }
      if (!bought) {
        const st = p.stock;
        const sold = st && !st.missing && st.qty === 0;
        h += `<div class="ocrp-sub">${sold
          ? 'Sold out — checking every 60s. Keep Torn PDA open on this page and you\'ll get an alarm when it restocks.'
          : `Buy <b>${esc(c.item || 'your item')}</b> in the shop, then tap “Bought it”.`}</div>`
          + `<div class="ocrp-btns"><a class="ocrp-btn" href="/index.php">Open shop</a>`
          + `<button class="ocrp-btn ghost" data-act="jump">Find on page</button></div>`
          + `<button class="ocrp-btn ghost" data-act="bought">I bought it ✓</button>`;
      } else {
        h += `<div class="ocrp-sub">Done shopping — fly home.</div>`
          + `<div class="ocrp-btns"><a class="ocrp-btn" href="/travelagency.php">Travel home</a>`
          + `<button class="ocrp-btn ghost" data-act="unbought">Undo</button></div>`;
      }
      h += `</section>`;
    }

    if (['hospital', 'jail', 'federal'].includes(p.phase)) {
      h += `<section class="ocrp-next idle"><div class="ocrp-lbl">In ${esc(p.phase)}</div>`
        + (p.until ? flaps(p.until, 'sm') : '')
        + `<div class="ocrp-sub">The plan picks back up when you're out.</div></section>`;
    }

    const fetchedSrv = S.fetchedAt + S.offset;
    h += `<footer class="ocrp-foot"><span>Torn data ${cd(fetchedSrv, 'ago')}</span><span>Stock via YATA</span></footer>`
      + `<div class="ocrp-rule">Reads the API only — every game action is your own tap.</div>`;
    return h;
  }

  function updateTicks() {
    if (!S.root) return;
    const t = tNow();
    S.root.querySelectorAll('[data-cd]').forEach(el => {
      const ts = Number(el.dataset.cd), k = el.dataset.k, d = ts - t;
      if (k === 'flap') {
        const s = hms(d);
        if (el.dataset.v !== s) {
          el.dataset.v = s;
          el.innerHTML = [...s].map(ch => ch === ':' ? '<i class="ocrp-colon">:</i>' : `<b class="ocrp-flap">${ch}</b>`).join('');
        }
      } else if (k === 'hms') el.textContent = hms(d);
      else if (k === 'dur') el.textContent = fmtDur(d);
      else if (k === 'ago') el.textContent = `${fmtDur(t - ts)} ago`;
    });
  }

  function render() {
    if (!S.root) return;
    const p = S.plan;
    S.root.classList.toggle('is-open', !!S.open);
    S.root.classList.toggle('side-right', S.cfg.side === 'right');
    const pill = pillHTML(p);
    if (pill !== S.lastPill) { S.root.querySelector('.ocrp-pill').innerHTML = pill; S.lastPill = pill; }
    const main = S.root.querySelector('.ocrp-main');
    main.hidden = S.settings;
    S.root.querySelector('.ocrp-settings').hidden = !S.settings;
    if (S.open && !S.settings) {
      const html = mainHTML(p);
      if (html !== S.lastMain) { main.innerHTML = html; S.lastMain = html; }
    }
    updateTicks();
  }

  function renderSettings() {
    const c = S.cfg;
    const el = S.root.querySelector('.ocrp-settings');
    const opts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const learnedCount = Object.keys(S.learned).length;
    el.innerHTML = `<div class="ocrp-head"><span class="ocrp-title"><i class="ocrp-dot"></i>Run settings</span>`
      + `<span class="ocrp-icons"><button class="ocrp-ic" data-act="cancel" aria-label="Back">✕</button></span></div>`
      + `<div class="ocrp-form">`
      + `<label>Destination<select name="dest">${opts(DESTS.map(d => [d.id, d.name]), c.dest)}</select></label>`
      + `<label>Item to buy<input name="item" list="ocrp-items" value="${esc(c.item)}" placeholder="e.g. Xanax, Jaguar Plushie" autocomplete="off">`
      + `<datalist id="ocrp-items">${itemNames(c.dest).map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>`
      + `<label>Flight type<select name="method">${opts(Object.entries(METHODS).map(([k, m]) => [k, m.label]), c.method)}</select></label>`
      + `<div class="ocrp-row2"><label>Shopping time (min)<input name="shopMin" type="number" inputmode="numeric" min="0" max="60" value="${c.shopMin}"></label>`
      + `<label>Safety buffer (min)<input name="safetyMin" type="number" inputmode="numeric" min="0" max="120" value="${c.safetyMin}"></label></div>`
      + `<div class="ocrp-row2"><label>Check Torn every (sec)<input name="poll" type="number" inputmode="numeric" min="30" max="600" value="${c.poll}"></label>`
      + `<label>Panel side<select name="side">${opts([['left', 'Left'], ['right', 'Right']], c.side)}</select></label></div>`
      + `<label class="ocrp-chk"><input type="checkbox" name="xanax"${c.xanax ? ' checked' : ''}> Xanax step when drug cooldown is up</label>`
      + `<label class="ocrp-chk"><input type="checkbox" name="sound"${c.sound ? ' checked' : ''}> Alarm sound</label>`
      + (hasPdaKey()
        ? `<p class="ocrp-dim">API key: supplied by Torn PDA.</p>`
        : `<label>Torn API key<input name="key" value="${esc(c.key)}" placeholder="16-character key" autocomplete="off"></label>`)
      + `<p class="ocrp-dim">Flight times: ${learnedCount ? `${learnedCount} measured from your real flights` : 'using standard times until your first flight'}.`
      + `${learnedCount ? ' <button class="ocrp-link" data-act="forget">Reset</button>' : ''}</p>`
      + `<button class="ocrp-btn" data-act="save">Save</button></div>`;
    el.querySelector('select[name="dest"]').addEventListener('change', e => {
      el.querySelector('#ocrp-items').innerHTML = itemNames(e.target.value).map(n => `<option value="${esc(n)}">`).join('');
    });
  }

  function saveSettings() {
    const el = S.root.querySelector('.ocrp-settings');
    const v = n => el.querySelector(`[name="${n}"]`);
    const c = S.cfg;
    c.dest = v('dest').value;
    c.item = v('item').value.trim();
    c.method = v('method').value;
    c.shopMin = clamp(v('shopMin').value, 0, 60, DEFAULTS.shopMin);
    c.safetyMin = clamp(v('safetyMin').value, 0, 120, DEFAULTS.safetyMin);
    c.poll = clamp(v('poll').value, 30, 600, DEFAULTS.poll);
    c.side = v('side').value;
    c.xanax = v('xanax').checked;
    c.sound = v('sound').checked;
    if (v('key')) c.key = v('key').value.trim();
    save('cfg', c);
    if (!S.user && apiKey()) pollTorn();
  }

  /* ------------------------------------------------------------------ */
  /* highlighting on Torn's own pages (visual only)                      */
  /* ------------------------------------------------------------------ */

  function highlightTargets() {
    const p = S.plan;
    if (!p) return [];
    const url = location.href, out = [];
    if (p.phase === 'abroad') {
      if (!S.mem.bought && S.cfg.item) out.push(S.cfg.item);
      if (S.mem.bought) out.push(/travel home|return to torn|return home|fly home/i);
    }
    if (p.phase === 'home') {
      if (/item\.php/.test(url) && p.next && p.next.id === 'xanax') out.push('Xanax');
      if (/travelagency|sid=travel/i.test(url) && p.next && p.next.id === 'fly') out.push(p.target.name);
    }
    return out;
  }

  function applyHighlights() {
    if (!document.body) return;
    document.querySelectorAll('.ocrp-hl').forEach(e => e.classList.remove('ocrp-hl'));
    const list = highlightTargets();
    let first = null;
    for (const f of list) {
      const test = f instanceof RegExp ? s => f.test(s) : s => fold(s).includes(fold(f));
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node, count = 0;
      while ((node = w.nextNode()) && count < 12) {
        const val = node.nodeValue;
        if (!val || val.length > 200 || !test(val)) continue;
        const pe = node.parentElement;
        if (!pe || pe.closest('#ocrp-root, script, style, noscript, title')) continue;
        let row = pe.closest('li, tr, button, a, label, [role="row"], [role="button"]') || pe;
        if ((row.textContent || '').length > 500) row = pe;
        row.classList.add('ocrp-hl');
        first = first || row;
        count++;
      }
    }
    S.firstHL = first;
    const key = location.href + '|' + list.map(String).join(',');
    if (first && !S.scrolled[key]) {
      S.scrolled[key] = true;
      try { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ }
    }
  }

  function observePage() {
    let tmr = null;
    const mo = new MutationObserver(muts => {
      if (S.root && muts.every(m => S.root.contains(m.target))) return;
      clearTimeout(tmr);
      tmr = setTimeout(applyHighlights, 600);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => setTimeout(applyHighlights, 300));
  }

  /* ------------------------------------------------------------------ */
  /* UI shell + events                                                   */
  /* ------------------------------------------------------------------ */

  function onClick(ev) {
    const a = ev.target.closest('[data-act]');
    if (!a) return; // plain links navigate normally
    ev.preventDefault();
    const act = a.dataset.act;
    if (act === 'open') { S.open = true; save('open', true); }
    else if (act === 'close') { S.open = false; save('open', false); }
    else if (act === 'refresh') { if (now() - S.lastTornPoll > 5) pollTorn(); if (now() - S.yataTried > 15) pollYata(); }
    else if (act === 'settings') { S.settings = true; renderSettings(); }
    else if (act === 'cancel') { S.settings = false; }
    else if (act === 'save') { saveSettings(); S.settings = false; }
    else if (act === 'forget') { S.learned = {}; save('learned', {}); renderSettings(); }
    else if (act === 'bought') { S.mem.bought = true; save('mem', S.mem); }
    else if (act === 'unbought') { S.mem.bought = false; save('mem', S.mem); }
    else if (act === 'dismiss') { S.banner = null; }
    else if (act === 'jump') {
      applyHighlights();
      if (S.firstHL) { S.open = false; save('open', false); try { S.firstHL.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ } }
      else S.banner = { title: 'Not on this page', body: 'Open the shop page first, then tap Find on page.', level: 'soft' };
    }
    S.lastMain = '';
    afterUpdate();
  }

  function afterUpdate() {
    S.plan = computeNow();
    if (S.plan) transitions(S.plan);
    render();
    applyHighlights();
  }

  function tick() {
    S.plan = computeNow();
    if (S.plan) transitions(S.plan);
    render();
  }

  const CSS = `
#ocrp-root{--b:#0e0e0c;--p:#17160f;--l:#2d2b22;--amber:#ffb627;--amber2:#b9800f;--paper:#ede7d3;--dim:#908975;--go:#b5e35c;--stop:#ff5f3c;
position:fixed;left:10px;bottom:64px;z-index:2147483000;font:12.5px/1.4 ui-monospace,SFMono-Regular,"Roboto Mono","Droid Sans Mono",Menlo,Consolas,monospace;color:var(--paper);-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;text-align:left}
#ocrp-root.side-right{left:auto;right:10px}
#ocrp-root *{box-sizing:border-box}
#ocrp-root button{font:inherit;color:inherit;background:none;border:0;margin:0;cursor:pointer}
#ocrp-root .ocrp-panel{display:none}
#ocrp-root.is-open .ocrp-panel{display:block}
#ocrp-root.is-open .ocrp-pill{display:none}
#ocrp-root .ocrp-pill{display:flex;align-items:center;gap:7px;max-width:calc(100vw - 20px);padding:9px 12px;background:var(--b);border:1px solid var(--l);border-left:3px solid var(--amber);border-radius:3px;box-shadow:0 6px 20px rgba(0,0,0,.5);font-size:11px;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;overflow:hidden;cursor:pointer}
#ocrp-root .ocrp-pill b{color:var(--amber)}
#ocrp-root .sep{color:var(--dim)}
#ocrp-root.alarm .ocrp-pill{animation:ocrp-blink 1s steps(2) 8}
#ocrp-root .ocrp-panel{width:min(360px,calc(100vw - 20px));max-height:74vh;overflow-y:auto;overscroll-behavior:contain;background:var(--b);border:1px solid var(--l);border-radius:5px;box-shadow:0 14px 36px rgba(0,0,0,.6)}
#ocrp-root .ocrp-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;padding:6px 4px 6px 12px;background:var(--b);border-bottom:1px solid var(--l)}
#ocrp-root .ocrp-title{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--amber)}
#ocrp-root .ocrp-dot{width:7px;height:7px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px var(--amber)}
#ocrp-root .ocrp-icons{display:flex}
#ocrp-root .ocrp-ic{width:38px;height:34px;font-size:16px;color:var(--dim)}
#ocrp-root .ocrp-ic:active{color:var(--amber)}
#ocrp-root section{padding:12px;border-bottom:1px solid var(--l)}
#ocrp-root .ocrp-lbl{margin-bottom:7px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
#ocrp-root .ocrp-flaps{display:flex;align-items:center;gap:2px}
#ocrp-root .ocrp-flap{display:inline-flex;justify-content:center;align-items:center;width:30px;height:42px;font-size:28px;font-weight:700;color:var(--amber);background:linear-gradient(180deg,#27261e 0,#1b1a15 49%,#050504 49%,#050504 51%,#1b1a15 51%,#131210 100%);border-radius:3px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 0 #000}
#ocrp-root .ocrp-flaps.sm .ocrp-flap{width:22px;height:30px;font-size:19px}
#ocrp-root .ocrp-flaps.hot .ocrp-flap{color:var(--stop)}
#ocrp-root .ocrp-colon{font-style:normal;font-size:22px;color:var(--amber2);padding:0 1px}
#ocrp-root .ocrp-sub{margin-top:6px;font-size:11.5px;color:var(--dim)}
#ocrp-root .ocrp-sub b{color:var(--paper)}
#ocrp-root .ocrp-big{font-size:22px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
#ocrp-root .ocrp-big.stop{color:var(--stop)}
#ocrp-root .ocrp-big.dim{color:var(--dim)}
#ocrp-root .ocrp-bh,#ocrp-root .ocrp-br{display:grid;grid-template-columns:1fr 1.7fr .9fr 1.1fr;gap:6px;align-items:center}
#ocrp-root .ocrp-bh span{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
#ocrp-root .ocrp-br{margin-top:5px;padding-top:8px;border-top:1px dashed var(--l);font-size:12px;font-weight:700;text-transform:uppercase}
#ocrp-root .ocrp-br span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ocrp-root .ocrp-st{justify-self:start;padding:2px 6px;border-radius:2px;font-size:10.5px;letter-spacing:.1em}
#ocrp-root .ocrp-st.go{background:var(--go);color:#10110c}
#ocrp-root .ocrp-st.stop{background:var(--stop);color:#10110c}
#ocrp-root .ocrp-st.wait{color:var(--amber);box-shadow:inset 0 0 0 1px var(--amber)}
#ocrp-root .ocrp-stock{margin-top:8px;font-size:11.5px;color:var(--dim)}
#ocrp-root .ocrp-stock b.in{color:var(--go)}
#ocrp-root .ocrp-stock b.out{color:var(--stop)}
#ocrp-root .ocrp-next{border-left:3px solid var(--amber)}
#ocrp-root .ocrp-next.idle{border-left-color:var(--l)}
#ocrp-root .ocrp-nlabel{font-size:17px;font-weight:700}
#ocrp-root .ocrp-btn{display:block;width:100%;margin-top:10px;padding:12px 10px;text-align:center;background:var(--amber);color:#14120a;font-weight:800;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;border-radius:3px}
#ocrp-root a.ocrp-btn,#ocrp-root a.ocrp-btn:visited{color:#14120a}
#ocrp-root .ocrp-btn.ghost{background:transparent;color:var(--paper);box-shadow:inset 0 0 0 1px var(--l)}
#ocrp-root .ocrp-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#ocrp-root .ocrp-btns .ocrp-btn{margin-top:10px}
#ocrp-root .ocrp-steps{list-style:none;margin:0;padding:2px 0}
#ocrp-root .ocrp-steps li{display:flex;align-items:center;gap:10px;padding:10px 12px}
#ocrp-root .ocrp-steps li+li{border-top:1px solid #1e1d17}
#ocrp-root .ocrp-steps li>i{flex:0 0 9px;height:9px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--dim)}
#ocrp-root .ocrp-steps li.ready>i{background:var(--go);box-shadow:none}
#ocrp-root .ocrp-steps li.cur{background:var(--p)}
#ocrp-root .ocrp-steps li>span{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
#ocrp-root .ocrp-steps small{font-size:11px;color:var(--dim)}
#ocrp-root .ocrp-steps a{padding:7px 10px;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;color:var(--amber);box-shadow:inset 0 0 0 1px var(--amber2);border-radius:2px}
#ocrp-root .ocrp-banner{display:block;width:100%;padding:11px 12px;text-align:left;background:var(--amber);color:#14120a}
#ocrp-root .ocrp-banner.loud{animation:ocrp-blink 1s steps(2) 8}
#ocrp-root .ocrp-banner b{display:block;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
#ocrp-root .ocrp-banner small{display:block;margin-top:3px;font-size:10px;opacity:.7}
#ocrp-root .ocrp-err{padding:9px 12px;background:#2a120c;color:#ffb3a1;border-bottom:1px solid #4a1d12}
#ocrp-root .ocrp-warn{margin-top:8px;font-size:11.5px;color:var(--stop)}
#ocrp-root .ocrp-empty{padding:18px 12px;color:var(--dim)}
#ocrp-root .ocrp-foot{display:flex;justify-content:space-between;gap:8px;padding:9px 12px 4px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
#ocrp-root .ocrp-rule{padding:0 12px 11px;font-size:10px;color:#625d4e}
#ocrp-root .ocrp-form{display:flex;flex-direction:column;gap:11px;padding:12px}
#ocrp-root .ocrp-form label{display:flex;flex-direction:column;gap:5px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
#ocrp-root .ocrp-form input,#ocrp-root .ocrp-form select{width:100%;padding:10px 9px;font:14px ui-monospace,SFMono-Regular,"Roboto Mono",Menlo,monospace;letter-spacing:0;text-transform:none;color:var(--paper);background:var(--p);border:1px solid var(--l);border-radius:3px}
#ocrp-root .ocrp-form input:focus,#ocrp-root .ocrp-form select:focus{outline:none;border-color:var(--amber)}
#ocrp-root .ocrp-form .ocrp-chk{flex-direction:row;align-items:center;gap:9px;font-size:12px;letter-spacing:0;text-transform:none;color:var(--paper)}
#ocrp-root .ocrp-form .ocrp-chk input{width:18px;height:18px;accent-color:var(--amber)}
#ocrp-root .ocrp-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#ocrp-root .ocrp-dim{margin:0;font-size:11px;color:var(--dim)}
#ocrp-root .ocrp-link{padding:0;color:var(--amber);text-decoration:underline}
@keyframes ocrp-blink{50%{background:var(--stop)}}
.ocrp-hl{outline:2px solid #ffb627 !important;outline-offset:2px !important;border-radius:3px;animation:ocrp-pulse 1.4s ease-in-out infinite}
@keyframes ocrp-pulse{0%,100%{box-shadow:0 0 0 4px rgba(255,182,39,.28)}50%{box-shadow:0 0 0 10px rgba(255,182,39,.05)}}
`;

  function boot() {
    if (document.getElementById('ocrp-root')) return;
    const style = document.createElement('style');
    style.id = 'ocrp-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);

    const root = document.createElement('div');
    root.id = 'ocrp-root';
    root.innerHTML = '<div class="ocrp-pill" data-act="open" role="button" aria-label="Open OC Run Board"></div>'
      + '<div class="ocrp-panel"><div class="ocrp-main"></div><div class="ocrp-settings" hidden></div></div>';
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', unlockAudio, { passive: true });
    S.root = root;

    if (!S.cfg.item && !S.user) { S.open = true; }
    afterUpdate();
    observePage();
    setInterval(tick, 1000);
    setInterval(scheduler, 5000);
    scheduler();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && now() - S.lastTornPoll > 15) pollTorn(); });
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
