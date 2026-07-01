/*
 * ask.js — client-side natural-language Q&A over the VeVe wiki data (no backend, no API keys).
 * Answers quantitative questions ("scarcest 5 Spider-Man collectibles", "which Disney collectibles
 * are held back", "cheapest Secret Rares", "how many Marvel collectibles") from catalog.js/comics.js,
 * and "what is X" lore from descriptions.js. Deterministic — every answer is grounded in the data.
 */
(function (g) {
  'use strict';
  var C = (g.CATALOG && g.CATALOG.items) || [];
  var COMICS = g.COMICS || [];
  var DESC = g.WIKI_DESC || { coll: {}, lore: {} };
  var seasonMeta = (g.CATALOG && g.CATALOG.seasonMeta) || {};

  function nz(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function sq(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  // ---- cost (VeVe gem floor > StackR OMI floor > non-blind drop price) ----
  var _fnN = g.normName || nz;
  var FLOORN = {};
  if (g.FLOOR && g.FLOOR.byName) Object.keys(g.FLOOR.byName).forEach(function (n) { var k = _fnN(n); if (k && !(k in FLOORN)) FLOORN[k] = g.FLOOR.byName[n]; });
  function stackr(name) { var r = (g.FLOOR && g.FLOOR.byName && (g.FLOOR.byName[name] || FLOORN[_fnN(name)])) || null; return (r && r.usd > 0) ? r.usd : null; }
  function cost(it) {
    if (it.floor > 0) return { v: it.floor, src: 'veve' };
    var s = stackr(it.name); if (s) return { v: s, src: 'stackr' };
    if (!it.blind && it.price > 0) return { v: it.price, src: 'drop' };
    return null;
  }
  function costStr(it) { var c = cost(it); if (!c) return '—'; return '💎 ' + Math.round(c.v).toLocaleString() + (c.src === 'veve' ? ' 💠' : c.src === 'stackr' ? ' ⛓' : ' ~'); }
  var RB = { 'Rare': 0.25, 'Ultra Rare': 0.5, 'Secret Rare': 5, 'Artist Proof': 5 };
  function mcp(it) { return 1 + (RB[it.rarity] || 0); }
  // HELD BACK = the reserved low mints (#1 → lowest-public−1) VeVe withholds. Distinct from UNSOLD
  // (Store stock) and BURNT (removed from supply) — all three are separate on VeVe.
  function reserved(it) { return (it.lowmint && it.lowmint > 1) ? (it.lowmint - 1) : 0; }
  function heldBack(it) { return reserved(it); }
  function unsold(it) { return it.store || 0; }
  function burnt(it) { return it.burnt || 0; }
  function issuedOf(it) { return it.issued || it.edition || 0; }

  // ---- universe detection ----
  var UNIS = {}; C.forEach(function (c) { if (c.universe) UNIS[c.universe] = (UNIS[c.universe] || 0) + 1; });
  var uniList = Object.keys(UNIS).sort(function (a, b) { return sq(b).length - sq(a).length; }); // longest first
  // aliases → must resolve to a REAL universe slug that exists in the catalog
  var ALIAS = { starwars: 'star-wars', bttf: 'back-to-the-future', jamesbond: 'james-bond', '007': 'james-bond', cocacola: 'coca-cola', streetfighter: 'street-fighter', ronenglish: 'ron-english' };
  function detectUni(qs) {
    for (var a in ALIAS) if (qs.indexOf(a) >= 0) return ALIAS[a];
    for (var i = 0; i < uniList.length; i++) { var u = sq(uniList[i]); if (u.length >= 4 && qs.indexOf(u) >= 0) return uniList[i]; }
    return null;
  }
  function detectRarity(q) {
    var s = ' ' + q.toLowerCase() + ' ';
    if (/secret ?rare/.test(s)) return 'Secret Rare';
    if (/ultra ?rare/.test(s)) return 'Ultra Rare';
    if (/artist ?proof/.test(s)) return 'Artist Proof';
    if (/uncommon/.test(s)) return 'Uncommon';
    if (/\brares?\b/.test(s)) return 'Rare';
    if (/\bcommons?\b/.test(s)) return 'Common';
    return null;
  }
  var STOP = /\b(what|whats|which|who|whose|where|owns|own|holds|holder|locate|sitting|has|show|me|the|are|is|of|on|app|veve|top|best|good|great|some|any|scarcest|rarest|lowest|smallest|fewest|highest|biggest|largest|most|least|cheapest|expensive|valuable|priciest|common|commons|uncommon|uncommons|secret|ultra|proof|artist|held|back|reserved|reserve|withheld|unsold|burnt|burned|store|still|available|left|how|many|much|number|count|list|give|find|tell|about|collectible|collectibles|comic|comics|edition|editions|mint|mints|floor|price|worth|value|mcp|points|per|day|by|with|an|a|and|do|does|did|my|can|get|in|for|to|scarce|rare|rares|there|were|was|been|being|that|this|these|those|they|it|have|had)\b/g;
  // strip only STANDALONE numbers (the "top 5" count) — keep in-word digits so leetspeak / numbered
  // names survive (S3LF, Spider-Man 2099, X-23).
  function subject(q) { return q.toLowerCase().replace(STOP, ' ').replace(/\b\d+\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  function intentOf(q) {
    var s = ' ' + q.toLowerCase() + ' ';
    if (/\bburn(t|ed)?\b|burning/.test(s)) return 'burnt';
    if (/unsold|(didn.?t|did not|doesn.?t) sell|still (available|for sale)|in the store|store stock|left in the store/.test(s)) return 'unsold';
    if (/held ?back|hold ?back|reserved|reserve|withheld/.test(s)) return 'held';
    if (/how many|number of|count/.test(s)) return 'count';
    if (/scarcest|rarest|lowest edition|smallest edition|fewest|hardest to (get|find)/.test(s)) return 'scarce';
    if (/most common|largest edition|biggest edition|highest edition/.test(s)) return 'common';
    if (/cheapest|lowest (price|floor)|least expensive/.test(s)) return 'cheap';
    if (/most expensive|priciest|highest (floor|price)|most valuable/.test(s)) return 'expensive';
    if (/best (mcp|value)|most (mcp|points)|(mcp|points) per/.test(s)) return 'mcp';
    if (/\bfloor\b|\bprice\b|worth|how much|value of/.test(s)) return 'floor';
    if (/what is|who is|tell me about|explain|describe|about /.test(s)) return 'about';
    return 'list';
  }
  function topN(q) { var m = q.match(/\b(\d{1,3})\b/); var n = m ? parseInt(m[1], 10) : 10; return Math.max(1, Math.min(n, 25)); }
  function rarLabel(it) { return it.rarity || '?'; }

  // comics mapped to the common item shape
  function comicItems() {
    return COMICS.map(function (c) {
      var rank = { 'Secret Rare': 0, 'Ultra Rare': 1, 'Rare': 2, 'Uncommon': 3, 'Common': 4 };
      var top = (c.r || []).slice().sort(function (a, b) { return (rank[a] == null ? 9 : rank[a]) - (rank[b] == null ? 9 : rank[b]); })[0] || '';
      return { name: c.t + (c.n ? ' #' + c.n : ''), universe: nz(c.l), character: '', rarity: top, edition: c.e, price: null, floor: c.f, blind: false, drop: c.d, _comic: true, age: c.a, series: c.s };
    });
  }

  function pick(q, useComics) {
    var qs = sq(q), uni = useComics ? null : detectUni(qs), subj = subject(q), rarity = detectRarity(q);
    // strip the detected universe's words from the subject so "marvel" alone doesn't narrow by name
    if (uni) { subj = subj.replace(new RegExp(uni.replace(/-/g, ' '), 'g'), ' '); for (var a in ALIAS) if (ALIAS[a] === uni) subj = subj.replace(a, ' '); subj = subj.replace(/\s+/g, ' ').trim(); }
    var subjq = sq(subj);
    var base = useComics ? comicItems() : C;
    var items = uni ? base.filter(function (it) { return it.universe === uni; }) : base.slice();
    if (subjq && subjq.length >= 3) {
      var nar = items.filter(function (it) { return sq(it.name).indexOf(subjq) >= 0 || sq(it.character).indexOf(subjq) >= 0 || sq(it.series || '').indexOf(subjq) >= 0; });
      if (nar.length) items = nar;
      else if (!uni) items = base.filter(function (it) { return sq(it.universe).indexOf(subjq) >= 0 || sq(it.name).indexOf(subjq) >= 0 || sq(it.character).indexOf(subjq) >= 0; });
      // uni set + no name match → keep the universe list (don't over-narrow)
    }
    if (rarity) items = items.filter(function (it) { return it.rarity === rarity; });
    var lbl = [rarity, (uni ? uni.replace(/-/g, ' ') : subj)].filter(Boolean).join(' ').trim() || 'all';
    return { items: items, uni: uni, subj: subj, rarity: rarity, label: lbl };
  }

  function subjLabel(p) { return p.label || 'all'; }

  function bestMatch(items, subj) {
    var sj = sq(subj); if (!items.length) return null;
    var m = items.filter(function (it) { return sj && sq(it.name).indexOf(sj) >= 0; }).sort(function (a, b) { return sq(a.name).length - sq(b.name).length; });
    return m[0] || items.slice().sort(function (a, b) { return (b.edition || 0) - (a.edition || 0); })[0];
  }
  // EDITION LOCATOR — "where is #1987 of X?" → held back / no-such-edition / in circulation (collector/unsold/burnt).
  // Certain part: anything below the lowest-public mint is held back. Exact owner of a circulating edition
  // isn't in our data (token IDs aren't derivable; needs VeVe's app) — we say so honestly.
  function locate(q, N) {
    // subject for the locator: drop the edition phrase but KEEP in-name numbers (IG-11, R2-D2, 2099)
    var sub = q.replace(/(?:#|edition|mint|no\.?|number)\s*#?\s*\d{1,7}/ig, ' ').toLowerCase().replace(STOP, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    var sj = sq(sub), it = null;
    if (sj) {
      var m = C.filter(function (x) { return sq(x.name).indexOf(sj) >= 0 || sq(x.character).indexOf(sj) >= 0; });
      if (!m.length) { var toks = sub.split(' ').filter(function (t) { return t.length > 1; }); m = C.filter(function (x) { var nm = sq(x.name) + sq(x.character); return toks.length && toks.every(function (t) { return nm.indexOf(sq(t)) >= 0; }); }); }
      it = m.sort(function (a, b) { return sq(a.name).length - sq(b.name).length; })[0];
    }
    if (!it) return { summary: 'Which collectible? Try e.g. "where is #41 of Alligator Loki?"', rows: [] };
    var lpm = it.lowmint, iss = issuedOf(it), res = reserved(it), bn = burnt(it), st = unsold(it);
    var head = '<strong>#' + N + ' of ' + esc(it.name) + '</strong> <span class="small">(' + (it.rarity || '?') + (it.edition ? ', edition of ' + it.edition.toLocaleString() : '') + ')</span> — ';
    if (iss && N > iss) return { summary: head + '❔ there is no #' + N + ' — only ' + iss.toLocaleString() + ' editions were minted.', rows: [] };
    if (lpm && N > 0 && N < lpm) return { summary: head + '🔒 <strong>Held back by VeVe</strong> — a reserved mint below the lowest public mint (#' + lpm + '). It sits in VeVe\'s reserve wallet and was never sold to collectors.', rows: [] };
    var bits = []; if (res) bits.push('#1–#' + (lpm - 1) + ' reserved'); if (bn) bits.push(bn.toLocaleString() + ' burnt'); if (st) bits.push(st.toLocaleString() + ' unsold');
    var ctx = bits.length ? ' For ' + esc(it.name) + ': ' + bits.join(' · ') + '.' : '';
    if (!lpm) return { summary: head + '❔ the lowest public mint isn\'t recorded for this one, so I can\'t say for certain whether #' + N + ' is reserved.' + ctx + ' <span class="small">Mints below the reserve are held back; the rest are with collectors, unsold, or burnt — exact per-edition owner needs VeVe\'s app.</span>', rows: [] };
    return { summary: head + '👤 in the <strong>public range</strong> (#' + lpm + '+), so #' + N + ' is with a collector, unsold, or burnt — not a VeVe reserve.' + ctx + ' <span class="small">Pinpointing which needs VeVe\'s app / a full on-chain owner scan; only mints below #' + lpm + ' are certainly held back.</span>', rows: [] };
  }

  // ---------- the answer engine ----------
  function ask(q) {
    q = (q || '').trim(); if (!q) return { summary: 'Ask me about the collectibles — e.g. "scarcest 5 Spider-Man collectibles".', rows: [] };
    var em = q.match(/(?:#|edition|mint|no\.?|number)\s*#?\s*(\d{1,7})/i);
    if (em && (/#\s*\d/.test(q) || /where|who|locate|holder|owns?|\bhas\b|sitting/i.test(q))) return locate(q, parseInt(em[1], 10));
    var useComics = /\bcomics?\b/.test(q.toLowerCase());
    var intent = intentOf(q), N = topN(q), p = pick(q, useComics), items = p.items, lbl = subjLabel(p);
    var kind = useComics ? 'comics' : 'collectibles';

    if (intent === 'about') {
      var key = sq(p.subj);
      var hit = null;
      for (var k in DESC.lore) { if (sq(DESC.lore[k].t) === key || sq(DESC.lore[k].t).indexOf(key) >= 0) { hit = DESC.lore[k]; break; } }
      if (hit) return { summary: '<strong>' + hit.t + '</strong> <span class="small">(' + hit.k + (hit.u ? ' · ' + hit.u : '') + ')</span><br>' + hit.d, rows: items.length ? withCols(topBy(items, 'scarce', 5), 'scarce') : [] , note: items.length ? 'Top pieces:' : '' };
      // fall through to list if no lore hit
      intent = 'list';
    }

    if (!items.length) return { summary: 'No ' + kind + ' found for <strong>' + esc(lbl) + '</strong>. Try a universe (Spider-Man, Star Wars, Disney…) or a character (Boba Fett).', rows: [] };

    if (intent === 'count') {
      var byR = {}; items.forEach(function (it) { byR[rarLabel(it)] = (byR[rarLabel(it)] || 0) + 1; });
      var br = Object.keys(byR).sort(function (a, b) { return byR[b] - byR[a]; }).map(function (r) { return byR[r] + ' ' + r; }).join(' · ');
      return { summary: '<strong>' + items.length + '</strong> ' + L(lbl) + kind + ' in the catalog.<br><span class="small">' + br + '</span>', rows: [] };
    }
    if (intent === 'held' || intent === 'burnt' || intent === 'unsold') {
      var metricFn = intent === 'held' ? heldBack : (intent === 'burnt' ? burnt : unsold);
      var list = items.filter(function (it) { return metricFn(it) > 0; }).sort(function (a, b) { return metricFn(b) - metricFn(a); }).slice(0, N);
      var word = intent === 'held' ? 'held back (reserved low mints, #1 → lowest-public)' : (intent === 'burnt' ? 'burnt (removed from supply)' : 'unsold (still in VeVe\'s Store)');
      if (!list.length) {
        var why = intent === 'held' ? 'reserved-mint data isn\'t recorded for ' + L(lbl) + kind + ' (we know the reserve only where the lowest-public mint has been researched)' : 'no ' + (intent === 'burnt' ? 'burns' : 'unsold stock') + ' recorded for ' + L(lbl) + kind;
        return { summary: 'No ' + intent + ' data — ' + why + '.', rows: [] };
      }
      return { summary: 'Top ' + list.length + ' ' + L(lbl) + kind + ' by <strong>' + word + '</strong>:', rows: list, cols: intent };
    }
    if (intent === 'floor') {
      // specific item: best name match, else fall to a list
      var subjq = sq(p.subj);
      var exact = items.filter(function (it) { return sq(it.name).indexOf(subjq) >= 0; }).sort(function (a, b) { return sq(a.name).length - sq(b.name).length; });
      if (subjq && exact.length) { var it = exact[0]; var c = cost(it); return { summary: '<strong>' + esc(it.name) + '</strong> — floor ' + (c ? '💎 ' + Math.round(c.v).toLocaleString() + (c.src === 'veve' ? ' (VeVe Gem floor)' : c.src === 'stackr' ? ' (StackR OMI floor)' : ' (drop price)') : 'unknown') + ' · ' + rarLabel(it) + (it.edition ? ' · edition ' + it.edition.toLocaleString() : '') + (DESC.coll[it.slug] ? '<br><span class="small">' + DESC.coll[it.slug] + '</span>' : ''), rows: [] }; }
      return { summary: 'Cheapest ' + esc(lbl) + ' ' + kind + ' by market floor:', rows: withCols(topBy(items, 'cheap', N), 'cheap'), cols: 'cheap' };
    }
    var order = (intent === 'list') ? 'scarce' : intent;
    var rows = topBy(items, order, N);
    var titles = { scarce: 'scarcest (smallest edition)', common: 'most common (largest edition)', cheap: 'cheapest (market floor)', expensive: 'most valuable (market floor)', mcp: 'best MCP value' };
    return { summary: 'The ' + (rows.length) + ' ' + (titles[order] || 'top') + ' ' + L(lbl) + kind + ':', rows: withCols(rows, order), cols: order };
  }

  function topBy(items, order, N) {
    var a = items.slice();
    // "scarcest" = scarcest FIGURES — exclude ARTWORK-variety pieces (comic-cover / print art), which
    // are often 1-of-1 Artist Proofs and would otherwise dominate the list. (Only when other figures exist.)
    if (order === 'scarce') { var fig = a.filter(function (i) { return !i.art; }); if (fig.length) a = fig; a = a.filter(function (i) { return i.edition; }).sort(function (x, y) { return x.edition - y.edition; }); }
    else if (order === 'common') a = a.filter(function (i) { return i.edition; }).sort(function (x, y) { return y.edition - x.edition; });
    else if (order === 'cheap') a = a.filter(cost).sort(function (x, y) { return cost(x).v - cost(y).v; });
    else if (order === 'expensive') a = a.filter(cost).sort(function (x, y) { return cost(y).v - cost(x).v; });
    else if (order === 'mcp') a = a.filter(cost).sort(function (x, y) { return (mcp(y) / cost(y).v) - (mcp(x) / cost(x).v); });
    else if (order === 'held') a = a.filter(function (i) { return heldBack(i) > 0; }).sort(function (x, y) { return heldBack(y) - heldBack(x); });
    return a.slice(0, N);
  }
  function withCols(rows) { return rows; }
  function esc(s) { return (s || '').replace(/</g, '&lt;'); }
  function L(lbl) { return (lbl && lbl !== 'all') ? esc(lbl) + ' ' : ''; }

  g.ASK = { ask: ask, cost: cost, costStr: costStr, mcp: mcp, reserved: reserved, heldBack: heldBack, desc: function (slug) { return DESC.coll[slug] || ''; }, stats: { collectibles: C.length, universes: uniList.length, comics: COMICS.length } };
})(typeof window !== 'undefined' ? window : this);
