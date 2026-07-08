/*
 * ask.js — conversational Q&A over the VeVe wiki data (no backend, no API keys).
 * Answers quantitative questions ("scarcest 5 Spider-Man collectibles", "which Disney
 * collectibles are held back", "cheapest Secret Rares", "how many Marvel collectibles"),
 * "what is X" lore, and an edition locator — grounded in catalog.js/comics.js/descriptions.js.
 *
 * v12 — now a CHAT: it remembers the last answer and understands follow-ups
 * ("sure?", "why?", "more", "the 2nd one", "and burnt?", "what about Star Wars"),
 * and the subject parser rejects filler words so "…held back by veve?" no longer
 * mis-narrows to collectibles named "from"/"veve".
 */
(function (g) {
  'use strict';
  var C = (g.CATALOG && g.CATALOG.items) || [];
  var COMICS = g.COMICS || [];
  var CMCP = (g.COMICS_MCP && COMICS_MCP.items) || [];   // per-cover comic supply (edition + floor)
  var DESC = g.WIKI_DESC || { coll: {}, lore: {} };

  function nz(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function sq(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function esc(s) { return (s || '').replace(/</g, '&lt;'); }
  function L(lbl) { return (lbl && lbl !== 'all') ? esc(lbl) + ' ' : ''; }
  function fmtN(n) { return (n || 0).toLocaleString(); }
  var cmByKey = {}; // comic per-cover supply: "title|num|rarity" -> {e,f,tid}
  CMCP.forEach(function (r) { cmByKey[nz(r.t) + '|' + r.n + '|' + nz(r.r)] = { e: r.e, f: r.f, tid: r.tid }; });
  var COMIC_ABBR = { af: 'amazing fantasy', asm: 'amazing spider man', tmnt: 'teenage mutant ninja turtles', ff: 'fantastic four', xmen: 'x men', got: 'game of thrones' };

  // ---- cost (VeVe gem floor > StackR OMI floor > non-blind drop price) ----
  var _fnN = g.normName || nz;
  var FLOORN = {};
  if (g.FLOOR && g.FLOOR.byName) Object.keys(g.FLOOR.byName).forEach(function (n) { var k = _fnN(n); if (k && !(k in FLOORN)) FLOORN[k] = g.FLOOR.byName[n]; });
  function stackr(name) { var r = (g.FLOOR && g.FLOOR.byName && (g.FLOOR.byName[name] || FLOORN[_fnN(name)])) || null; return (r && r.usd > 0) ? r.usd : null; }
  function cost(it) {
    var s = stackr(it.name); if (s) return { v: s, src: 'stackr' };   // StackR live traded floor — trusted
    var vv = g.saneVeveFloor ? g.saneVeveFloor(it.floor) : it.floor;    // VeVe floor is a lowest-ask listing → sanitized
    if (vv > 0) return { v: vv, src: 'veve' };
    if (!it.blind && it.price > 0) return { v: it.price, src: 'drop' };
    return null;
  }
  function costStr(it) { var c = cost(it); if (!c) return '—'; return '💎 ' + Math.round(c.v).toLocaleString() + (c.src === 'veve' ? ' 💠' : c.src === 'stackr' ? ' ⛓' : ' ~'); }
  var RB = { 'Rare': 0.25, 'Ultra Rare': 0.5, 'Secret Rare': 5, 'Artist Proof': 5 };
  function mcp(it) { return 1 + (RB[it.rarity] || 0); }
  // HELD BACK = reserved low mints (#1 → lowest-public−1). UNSOLD = Store stock. BURNT = removed. All separate.
  function reserved(it) { return (it.lowmint && it.lowmint > 1) ? (it.lowmint - 1) : 0; }
  function heldBack(it) { return reserved(it); }
  // VeVe's FULL withhold = the low-mint reserve (#1 → lpm−1) PLUS editions withheld AT RANDOM above it.
  // `it.held` is VeVe's reported total held-back; when it exceeds the reserve, the surplus is scattered
  // above the lowest public mint — so a mint ≥ lpm is NOT guaranteed to be in a collector's wallet.
  function totalHeld(it) { return Math.max(it.held || 0, reserved(it)); }
  function randomHeld(it) { return Math.max(0, totalHeld(it) - reserved(it)); }
  // On-chain reserve index (app/data/held.js = the exact editions in VeVe's reserve wallet 0x7be1…).
  // isHeld(it,N): true = CONFIRMED VeVe-held · false = CONFIRMED collector-owned · null = not indexed → probabilistic.
  var _hk = g.normName || nz;
  // exact held-back edition ranges for an item, from the on-chain reserve index. held.js is keyed by the
  // ON-CHAIN name, so try the catalog's `aka` (on-chain alias) FIRST, then the display name (71%→95% match).
  function heldList(it) {
    var H = g.HELD; if (!H || !H.k) return null;
    return H.k[_hk(it.aka || it.name) + '|' + _hk(it.rarity)] || H.k[_hk(it.name) + '|' + _hk(it.rarity)] || null;
  }
  function isHeld(it, N) {
    var r = heldList(it);
    if (r == null) return null;                         // not in the index (or a name miss) → probabilistic fallback; never a false "collector"
    var parts = String(r).split(',');
    for (var i = 0; i < parts.length; i++) { var p = parts[i].split('-'), lo = +p[0], hi = p[1] != null ? +p[1] : lo; if (N >= lo && N <= hi) return true; }
    return false;
  }
  function heldCount(r) { var c = 0; String(r).split(',').forEach(function (p) { var a = p.split('-'); c += a[1] ? (+a[1] - +a[0] + 1) : 1; }); return c; }
  function unsold(it) { return it.blind ? 0 : (it.store || 0); }   // blind boxes never sold as singles → no store surface
  function burnt(it) { return it.burnt || 0; }
  function issuedOf(it) { return it.issued || it.edition || 0; }
  function rarLabel(it) { return it.rarity || '?'; }

  // ---- universe detection ----
  var UNIS = {}; C.forEach(function (c) { if (c.universe) UNIS[c.universe] = (UNIS[c.universe] || 0) + 1; });
  var uniList = Object.keys(UNIS).sort(function (a, b) { return sq(b).length - sq(a).length; }); // longest first
  var ALIAS = { starwars: 'star-wars', bttf: 'back-to-the-future', jamesbond: 'james-bond', '007': 'james-bond', cocacola: 'coca-cola', streetfighter: 'street-fighter', ronenglish: 'ron-english' };
  // platform names are the ACTOR ("held back by veve"), never a universe filter — don't let them
  // match the tiny same-named universes (e.g. the 84-item "veve" universe) and hijack the query.
  var UNI_BLOCK = { 'veve': 1, 'collect': 1, 'chain': 1, 'stackr': 1, 'nft': 1 };
  function detectUni(qs) {
    for (var a in ALIAS) if (qs.indexOf(a) >= 0) return ALIAS[a];
    for (var i = 0; i < uniList.length; i++) { if (UNI_BLOCK[uniList[i]]) continue; var u = sq(uniList[i]); if (u.length >= 4 && qs.indexOf(u) >= 0) return uniList[i]; }
    return null;
  }
  // VeVe collector shorthand: SR = Secret Rare, UR = Ultra Rare, UC = Uncommon, AP = Artist Proof.
  // Matched anywhere ("SR yoda", "yoda SR", "spiderman UR"); these tokens are also stripped from the subject.
  function detectRarity(q) {
    var s = ' ' + q.toLowerCase() + ' ';
    if (/secret ?rare|\bsr\b/.test(s)) return 'Secret Rare';
    if (/ultra ?rare|\bur\b/.test(s)) return 'Ultra Rare';
    if (/artist ?proof|\bap\b/.test(s)) return 'Artist Proof';
    if (/uncommon|\buc\b/.test(s)) return 'Uncommon';
    if (/\brares?\b/.test(s)) return 'Rare';
    if (/\bcommons?\b/.test(s)) return 'Common';
    return null;
  }

  // ---- subject parsing ----------------------------------------------------
  // A subject token narrows the search by name/character. The danger is common
  // English words ("from", "some", "sure") that also appear inside collectible
  // names — letting them narrow silently drops the real answer. So we strip a
  // comprehensive filler set (articles, prepositions, question/verb words, the
  // metric vocabulary, and conversational words) BEFORE using the remainder as a
  // subject. Filler is dropped even when it occurs inside a name.
  function wset(s) { var o = {}; s.split(/\s+/).forEach(function (w) { if (w) o[w] = 1; }); return o; }
  var FILLER = wset(
    'a an the and or but of on in at for to by with from into onto off out over under up down as is are was ' +
    'were be been being am do does did done has have had having can could will would shall should may might must ' +
    'this that these those it its they them their theirs there here what whats which who whom whose why how howto ' +
    'when where whenever wherever me my mine you your yours we our ours us he she his her hers him then than else ' +
    'also too very really quite just about around some any all both more most less least many much few several ' +
    'other another each every no not none nor so if because since while please thanks thank thx ty cool nice great ' +
    'awesome ok okay yes yeah yep nope maybe perhaps kinda sorta actually honestly sure really rly srsly seriously ' +
    'tell show showme give find list get lookup know think want need see say said says like want wanna gimme lemme ' +
    'held back hold holds holding reserve reserved reserves withheld unsold burnt burned burn store stored available ' +
    'left still remaining collectible collectibles collectable comic comics edition editions mint mints minted figure ' +
    'figures piece pieces item items thing things veve collect chain stackr drop drops dropped set sets series ' +
    'season seasons universe universes brand brands franchise character characters ' +
    'scarce scarcest rare rares rarest rarer common commons uncommon uncommons secret ultra proof artist floor floors ' +
    'sr ur uc ap fe variant variants version drop chase grail ' +
    'price prices priced pricing worth value valuable priciest cheap cheapest expensive count counted counting ' +
    'number numbers how many much top best good better great highest lowest smallest biggest largest fewest ' +
    'own owns owned owning holder holders where locate located sitting has have got ' +
    'distribution breakdown concentration spread supply supplies exist exists existing minted circulation circulating whale whales');
  function subject(q) {
    return q.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/)
      .filter(function (w) { return w && !FILLER[w] && !/^\d+$/.test(w); })  // drop filler + standalone numbers (keep in-word digits: S3LF, 2099)
      .join(' ').trim();
  }

  function intentOf(q) {
    var s = ' ' + q.toLowerCase() + ' ';
    if (/\bburn(t|ed)?\b|burning/.test(s)) return 'burnt';
    if (/unsold|(didn.?t|did not|doesn.?t) sell|still (available|for sale)|in the store|store stock|left in the store/.test(s)) return 'unsold';
    if (/held ?back|hold ?back|reserved|reserve|withheld/.test(s)) return 'held';
    if (/owns? the most|biggest holder|top holders?|\bwhales?\b|\bdistribution\b|\bbreakdown\b|\bconcentration\b|how (many|much)[^?]*(exist|minted|are there|out there|in circulation|left)|how rare is|supply of/.test(s)) return 'dist';
    if (/how many|number of|count of|count the| count\b/.test(s)) return 'count';
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

  function makeComicItem(c) {
    var rank = { 'Secret Rare': 0, 'Ultra Rare': 1, 'Rare': 2, 'Uncommon': 3, 'Common': 4 };
    var top = (c.r || []).slice().sort(function (a, b) { return (rank[a] == null ? 9 : rank[a]) - (rank[b] == null ? 9 : rank[b]); })[0] || '';
    return { name: c.t + (c.n ? ' #' + c.n : ''), universe: nz(c.l), character: '', rarity: top, edition: c.e, price: null, floor: c.f, blind: false, drop: c.d, _comic: true, age: c.a, series: c.s, _t: c.t, _n: c.n, _r: c.r || [], tid: (cmByKey[nz(c.t) + '|' + c.n + '|' + nz(top)] || {}).tid, _id: 'comic:' + sq(c.t) + '|' + c.n };
  }
  function comicItems() { return COMICS.map(makeComicItem); }
  // stable id → item, so disambiguation option chips resolve to the EXACT item (not a re-search)
  var bySlug = {}; C.forEach(function (c) { bySlug[c.slug] = c; });
  var comicByKey = {}; COMICS.forEach(function (c) { comicByKey[sq(c.t) + '|' + c.n] = c; });
  function itemId(it) { return it && it._comic ? it._id : (it ? it.slug : ''); }
  function itemById(id) {
    if (!id) return null;
    if (id.indexOf('comic:') === 0) { var c = comicByKey[id.slice(6)]; return c ? makeComicItem(c) : null; }
    return bySlug[id] || null;
  }

  // parse a query into {uni, subj, rarity, useComics}
  function parse(q) {
    var qs = sq(q), useComics = /\bcomics?\b/.test(q.toLowerCase());
    var uni = useComics ? null : detectUni(qs), subj = subject(q), rarity = detectRarity(q);
    if (uni) { // strip the universe words from subj so "marvel" alone doesn't narrow by name
      subj = subj.replace(new RegExp(uni.replace(/-/g, ' '), 'g'), ' ');
      for (var a in ALIAS) if (ALIAS[a] === uni) subj = subj.replace(a, ' ');
      subj = subj.replace(/\s+/g, ' ').trim();
    }
    return { uni: uni, subj: subj, rarity: rarity, useComics: useComics };
  }
  function selectItems(p) {
    var base = p.useComics ? comicItems() : C;
    var items = p.uni ? base.filter(function (it) { return it.universe === p.uni; }) : base.slice();
    var subjq = sq(p.subj);
    if (subjq && subjq.length >= 3) {
      var nar = items.filter(function (it) { return sq(it.name).indexOf(subjq) >= 0 || sq(it.aka || '').indexOf(subjq) >= 0 || sq(it.character).indexOf(subjq) >= 0 || sq(it.series || '').indexOf(subjq) >= 0; });
      if (!nar.length) {   // token match — ALL subject words present (handles "partner statue" → "The Partners Statue")
        var toks = p.subj.split(/\s+/).filter(function (t) { return t.length > 1; });
        if (toks.length) nar = items.filter(function (it) { var hay = sq(it.name) + ' ' + sq(it.aka || '') + ' ' + sq(it.character) + ' ' + sq(it.series || ''); return toks.every(function (t) { return hay.indexOf(sq(t)) >= 0; }); });
      }
      if (nar.length) items = nar;
      else if (!p.uni) items = base.filter(function (it) { return sq(it.universe).indexOf(subjq) >= 0 || sq(it.name).indexOf(subjq) >= 0 || sq(it.character).indexOf(subjq) >= 0; });
      // (no uni + a real subject that matches nothing → items becomes [] → triggers the fuzzy fallback,
      //  instead of silently listing the whole catalog. A universe query keeps its list — don't over-narrow.)
    }
    if (p.rarity) items = items.filter(function (it) { return it.rarity === p.rarity; });
    return items;
  }
  function labelOf(p) { return [p.rarity, (p.uni ? p.uni.replace(/-/g, ' ') : p.subj)].filter(Boolean).join(' ').trim() || 'all'; }

  function bestMatch(items, subj) {
    var sj = sq(subj); if (!items.length) return null;
    var m = items.filter(function (it) { return sj && sq(it.name).indexOf(sj) >= 0; }).sort(function (a, b) { return sq(a.name).length - sq(b.name).length; });
    return m[0] || items.slice().sort(function (a, b) { return (b.edition || 0) - (a.edition || 0); })[0];
  }

  function topBy(items, order) {
    var a = items.slice();
    if (order === 'scarce') { var fig = a.filter(function (i) { return !i.art; }); if (fig.length) a = fig; a = a.filter(function (i) { return i.edition; }).sort(function (x, y) { return x.edition - y.edition; }); }
    else if (order === 'common') a = a.filter(function (i) { return i.edition; }).sort(function (x, y) { return y.edition - x.edition; });
    else if (order === 'cheap') a = a.filter(cost).sort(function (x, y) { return cost(x).v - cost(y).v; });
    else if (order === 'expensive') a = a.filter(cost).sort(function (x, y) { return cost(y).v - cost(x).v; });
    else if (order === 'mcp') a = a.filter(cost).sort(function (x, y) { return (mcp(y) / cost(y).v) - (mcp(x) / cost(x).v); });
    else if (order === 'held') a = a.filter(function (i) { return heldBack(i) > 0; }).sort(function (x, y) { return heldBack(y) - heldBack(x); });
    return a;
  }

  // EDITION LOCATOR (keeps in-name digits like IG-11, R2-D2, 2099)
  function locate(q, N) {
    CURP = null;
    var sub = q.replace(/(?:#|edition|mint|no\.?|number)\s*#?\s*\d{1,7}/ig, ' ').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/).filter(function (w) { return w && !FILLER[w] && !/^\d+$/.test(w); }).join(' ').trim();
    // "#41 of the above / that / it / previous / same one" → reuse the item from the last answer
    var refBack = /\b(above|previous|prev|last|earlier|same|that|this|it|one)\b/.test(sub) || /the above|previous|last one|same (one|item)|that one/.test(q.toLowerCase());
    var sj = sq(sub), it = null;
    if (refBack && LAST && LAST.item) it = LAST.item;
    if (!it && sj) {
      var m = C.filter(function (x) { return sq(x.name).indexOf(sj) >= 0 || sq(x.character).indexOf(sj) >= 0; });
      if (!m.length) { var toks = sub.split(' ').filter(function (t) { return t.length > 1; }); m = C.filter(function (x) { var nm = sq(x.name) + sq(x.character); return toks.length && toks.every(function (t) { return nm.indexOf(sq(t)) >= 0; }); }); }
      it = m.sort(function (a, b) { return sq(a.name).length - sq(b.name).length; })[0];
    }
    if (!it && LAST && LAST.item) it = LAST.item;   // last resort: keep talking about the current item
    if (!it) return fin(q, { topic: 'an edition', empty: true, emptyWhy: 'I need to know which collectible.' }, { summary: 'Which collectible? Try e.g. "where is #41 of Alligator Loki?"', rows: [] });
    var lpm = it.lowmint, iss = issuedOf(it), res = reserved(it), bn = burnt(it), st = unsold(it), rnd = randomHeld(it), theld = totalHeld(it);
    var head = '<strong>#' + N + ' of ' + esc(it.name) + '</strong> <span class="small">(' + (it.rarity || '?') + (it.edition ? ', edition of ' + it.edition.toLocaleString() : '') + ')</span> — ';
    var meta = { item: it, topic: '#' + N + ' of ' + it.name };
    if (iss && N > iss) return fin(q, meta, { summary: head + '❔ there is no #' + N + ' — only ' + iss.toLocaleString() + ' editions were minted.', rows: [] });
    // on-chain reserve index → DEFINITIVE answer (covers the random withholds above the LPM too)
    var hs = isHeld(it, N);
    if (hs === true) return fin(q, meta, { summary: head + '🔒 <strong>Held back by VeVe — confirmed on-chain.</strong> #' + N + ' sits in VeVe\'s reserve wallet, not with a collector.', rows: [] });
    if (hs === false) return fin(q, meta, { summary: head + '👤 <strong>With a collector — confirmed on-chain.</strong> #' + N + ' is <em>not</em> in VeVe\'s reserve wallet, so it\'s in a collector\'s hands (or burnt) — a real, tradeable edition.', rows: [] });
    if (lpm && N > 0 && N < lpm) return fin(q, meta, { summary: head + '🔒 <strong>Held back by VeVe — certain.</strong> A reserved mint below the lowest public mint (#' + lpm + '); it sits in VeVe\'s reserve wallet and was never sold to collectors.', rows: [] });
    var bits = []; if (res) bits.push('#1–#' + (lpm - 1) + ' reserved'); if (rnd) bits.push('~' + rnd.toLocaleString() + ' more withheld at random above #' + lpm); if (bn) bits.push(bn.toLocaleString() + ' burnt'); if (st) bits.push(st.toLocaleString() + ' unsold');
    var ctx = bits.length ? ' <span class="small">(' + esc(it.name) + ': ' + bits.join(' · ') + ')</span>' : '';
    if (!lpm) return fin(q, meta, { summary: head + '❔ the lowest public mint isn\'t recorded for this one, so I can\'t say whether #' + N + ' is reserved.' + ctx, rows: [] });
    // N ≥ lpm: public range — BUT VeVe also withholds editions AT RANDOM above the reserve, so not certain
    if (rnd > 0) return fin(q, meta, {
      summary: head + '👤 <strong>Public range</strong> (#' + lpm + '+) — <em>most likely</em> a collector\'s, <strong>but not certain</strong>. VeVe withholds <strong>' + theld.toLocaleString() + '</strong> of this item in total: the #1–#' + (lpm - 1) + ' reserve <em>plus ~' + rnd.toLocaleString() + ' scattered at random above #' + lpm + '</em> — so #' + N + ' could still be a VeVe hold rather than a collector.' + ctx + ' <span class="small">Confirming a specific edition needs its on-chain owner (VeVe\'s app, or a full chain index like an analytics service runs).</span>', rows: [] });
    return fin(q, meta, { summary: head + '👤 in the <strong>public range</strong> (#' + lpm + '+), so #' + N + ' is with a collector, unsold, or burnt — not a VeVe reserve.' + ctx + ' <span class="small">Pinpointing the exact owner needs VeVe\'s app / a full on-chain index.</span>', rows: [] });
  }

  // Precise per-item answer for "what does VeVe hold back / burn / leave unsold on <a specific item>?"
  // States the exact reserved mint range (#1 → lowest-public−1), not a ranked list — and is honest
  // when the reserve for that item hasn't been researched.
  function itemMetricAnswer(q, list, intent) {
    var lines = list.slice(0, 8).map(function (it) {
      var head = '<strong>' + esc(it.name) + '</strong> <span class="small">(' + (it.rarity || '?') + (it.edition ? ', edition ' + it.edition.toLocaleString() : '') + ')</span>';
      if (intent === 'held') {
        var hl = heldList(it);
        if (hl) {   // EXACT held-back editions from the on-chain reserve index (reserve + random withholds)
          var cnt = heldCount(hl), xb = burnt(it) ? ' <span class="small">(plus ' + burnt(it).toLocaleString() + ' burnt)</span>' : '';
          return head + ' — VeVe holds back <strong>' + cnt.toLocaleString() + '</strong> edition' + (cnt === 1 ? '' : 's') + ' <span class="small">(confirmed on-chain — in VeVe\'s reserve wallet):</span><br><span class="mono" style="font-size:12px;line-height:1.7">#' + esc(hl).replace(/,/g, ', #') + '</span>' + xb;
        }
        var lpm = it.lowmint, res = reserved(it);
        if (!lpm || lpm <= 1) return head + ' — the reserve for this one <strong>hasn\'t been researched yet</strong>, so the exact held-back mints aren\'t recorded. <span class="small">(Anything below its lowest public mint is held back — we just don\'t have that number for this item.)</span>';
        var rnd = randomHeld(it), theld = totalHeld(it);
        var extra = []; if (burnt(it)) extra.push(burnt(it).toLocaleString() + ' burnt'); if (unsold(it)) extra.push(unsold(it).toLocaleString() + ' unsold');
        var core = rnd
          ? ' — VeVe withholds <strong>' + theld.toLocaleString() + '</strong> editions in total: the <strong>#1–#' + (lpm - 1) + '</strong> reserve <em>plus ~' + rnd.toLocaleString() + ' more held back at random above #' + lpm + '</em>, so some public-range mints are VeVe\'s too.'
          : ' — VeVe holds back <strong>' + res + '</strong> edition' + (res === 1 ? '' : 's') + ': <strong>#1–#' + (lpm - 1) + '</strong>, every mint below the lowest public mint (#' + lpm + ').';
        return head + core + (extra.length ? ' <span class="small">(also ' + extra.join(' · ') + ')</span>' : '');
      }
      if (intent === 'burnt') { var b = burnt(it); return head + (b ? ' — <strong>' + b.toLocaleString() + '</strong> edition' + (b === 1 ? '' : 's') + ' burnt from supply.' : ' — no burns recorded.'); }
      var s = unsold(it); return head + (s ? ' — <strong>' + s.toLocaleString() + '</strong> unsold in VeVe\'s Store.' : (it.blind ? ' — a blind box (sold as sealed boxes, not singles).' : ' — none unsold.'));
    });
    var verb = intent === 'held' ? 'holds back' : intent === 'burnt' ? 'burnt' : 'has unsold on';
    return fin(q, { topic: 'what VeVe ' + verb + ' on ' + (list.length === 1 ? list[0].name : (list[0].character || 'this')), item: list.length === 1 ? list[0] : null },
      { summary: (list.length > 1 ? '<div class="small" style="margin-bottom:8px">' + list.length + ' matching collectibles:</div>' : '') + lines.join('<br><br>'), rows: [] });
  }

  // "who owns the most X?" / "distribution of X" — per-holder ownership isn't publicly knowable
  // (VeVe custodies wallets; no on-chain per-collectible holder index), so give the SUPPLY distribution.
  function distAnswer(q, p) {
    var subjq = sq(p.subj);
    if (COMIC_ABBR[subjq]) subjq = sq(COMIC_ABBR[subjq]);                 // "AF" -> amazing fantasy
    var numM = q.match(/#\s*(\d{1,4})/) || q.match(/\b(\d{1,4})\b/);
    var num = numM ? numM[1] : null;
    var pool = C.concat(comicItems());
    var cand = subjq ? pool.filter(function (it) { return sq(it.name).indexOf(subjq) >= 0 || sq(it.character).indexOf(subjq) >= 0 || sq(it.series || '').indexOf(subjq) >= 0; }) : [];
    var byNum = num ? cand.filter(function (it) { return it._comic && String(it._n) === num; }) : [];
    if (byNum.length) cand = byNum;                                       // a comic issue number pins it down
    if (p.rarity) { var byR = cand.filter(function (it) { return it.rarity === p.rarity; }); if (byR.length) cand = byR; }
    var it = cand.sort(function (a, b) {
      var an = subjq && sq(a.name).indexOf(subjq) >= 0 ? 0 : 1, bn = subjq && sq(b.name).indexOf(subjq) >= 0 ? 0 : 1;
      if (an !== bn) return an - bn;                                      // a NAME match beats a series/character match
      return sq(a.name).length - sq(b.name).length;                      // then shortest (most specific) name
    })[0];
    if (!it) return fin(q, { topic: 'distribution', empty: true, emptyWhy: 'I couldn\'t find that item.' },
      { summary: 'Which collectible or comic? Try a full name — e.g. <em>"distribution of Amazing Fantasy #15 secret rare"</em> or <em>"who owns the most Alligator Loki?"</em>', rows: [] });
    var whoAsk = /who owns|owns? the most|biggest holder|top holder|\bwhales?\b|concentration/.test(q.toLowerCase());
    var ed = it.edition || issuedOf(it), floorC = cost(it);
    if (it._comic && p.rarity) { var cm = cmByKey[nz(it._t) + '|' + it._n + '|' + nz(p.rarity)]; if (cm) { if (cm.e) ed = cm.e; if (cm.f) floorC = { v: cm.f, src: 'veve' }; } }
    var circ = it.circ || null, res = reserved(it), bn = burnt(it), st = unsold(it), lpm = it.lowmint;
    var rows = [];
    if (ed) rows.push('📦 Edition — <strong>' + fmtN(ed) + '</strong> total minted');
    if (circ) rows.push('👥 In circulation — <strong>' + fmtN(circ) + '</strong> <span class="small">(in collectors\' hands)</span>');
    if (res) rows.push('🔒 Held back by VeVe — <strong>' + fmtN(res) + '</strong> <span class="small">(#1–#' + (lpm - 1) + ', the reserve)</span>');
    if (st) rows.push('🏪 Unsold in Store — <strong>' + fmtN(st) + '</strong>');
    if (bn) rows.push('🔥 Burnt — <strong>' + fmtN(bn) + '</strong>');
    if (lpm) rows.push('🥇 Lowest public mint — <strong>#' + lpm + '</strong>');
    if (floorC) rows.push('💎 Market floor — <strong>' + Math.round(floorC.v).toLocaleString() + '</strong> <span class="small">(' + (floorC.src === 'veve' ? 'VeVe ask 💠' : floorC.src === 'stackr' ? 'StackR traded ⛓' : 'drop') + ')</span>');
    var head = '<strong>' + esc(it.name) + '</strong> <span class="small">(' + (it.rarity || '?') + (it.universe ? ' · ' + esc(it.universe) : '') + (it._comic ? ' · comic' : '') + ')</span>';
    var lead = whoAsk
      ? '👤 <strong>Who owns the most isn\'t publicly knowable.</strong> VeVe custodies every wallet, and there\'s no public on-chain index of who holds which edition of a given item — so holders can\'t be ranked from outside. Here\'s the <strong>supply distribution</strong> instead:'
      : '<strong>Supply distribution</strong>:';
    return fin(q, { item: it, topic: 'distribution of ' + it.name }, {
      summary: head + '<br><br>' + lead + '<br>' + (rows.length ? rows.join('<br>') : '<span class="small">Only edition/floor is recorded for this one.</span>') +
        '<br><span class="small">To check a specific edition\'s owner, scan a wallet in the <strong>Mint Checker</strong> — the reverse (edition → owner) needs VeVe\'s own app.</span>',
      rows: []
    });
  }

  // ---- the query engine (stateless core) ----------------------------------
  function engine(q, intent, N, pIn) {
    var p = pIn || parse(q); CURP = p;
    if (intent === 'dist') return distAnswer(q, p);
    var items = selectItems(p), lbl = labelOf(p);
    var kind = p.useComics ? 'comics' : 'collectibles';

    if (intent === 'about') {
      var key = sq(p.subj), hit = null;
      for (var k in DESC.lore) { if (sq(DESC.lore[k].t) === key || (key && sq(DESC.lore[k].t).indexOf(key) >= 0)) { hit = DESC.lore[k]; break; } }
      if (hit) { var proof = topBy(items, 'scarce').slice(0, 5); return fin(q, { topic: hit.t, item: hit, full: proof, cols: 'scarce' }, { summary: '<strong>' + hit.t + '</strong> <span class="small">(' + hit.k + (hit.u ? ' · ' + hit.u : '') + ')</span><br>' + hit.d, note: proof.length ? 'Top pieces:' : '', rows: proof, cols: 'scarce' }); }
      intent = 'list';
    }

    if (!items.length) {
      // rarity-aware: "UR ant-man" with no UR Ant-Man → say so and show which rarities DO exist
      if (p.rarity && p.subj) {
        var noRar = selectItems({ uni: p.uni, subj: p.subj, rarity: null, useComics: p.useComics });
        if (noRar.length) {
          var rc = {}; noRar.forEach(function (it) { rc[it.rarity || '?'] = (rc[it.rarity || '?'] || 0) + 1; });
          var avail = Object.keys(rc).sort(function (a, b) { return rc[b] - rc[a]; }).map(function (r) { return r + ' (' + rc[r] + ')'; }).join(', ');
          return fin(q, { topic: L(lbl) + kind, full: topBy(noRar, 'scarce'), cols: 'scarce' },
            { summary: 'No <strong>' + esc(p.rarity) + '</strong> ' + esc(p.subj) + ' in the catalog — it comes as: <strong>' + avail + '</strong>.', note: 'Here it is (scarcest first):', rows: topBy(noRar, 'scarce').slice(0, N), cols: 'scarce' });
        }
      }
      var toks = (p.subj || '').split(/\s+/).filter(function (t) { return t.length >= 4; });
      var sugg = toks.length ? C.filter(function (it) { var n = sq(it.name) + ' ' + sq(it.character); return toks.some(function (t) { return n.indexOf(sq(t)) >= 0; }); }).sort(function (a, b) { return (a.edition || 1e9) - (b.edition || 1e9); }).slice(0, 6) : [];
      var sg = sugg.length ? ' Did you mean: ' + sugg.map(function (it) { return '<span class="exchip" onclick="ASKPICK(\'' + itemId(it) + '\')">' + esc(it.name) + '</span>'; }).join(' ') : ' Try a universe (Marvel, Star Wars, Disney…) or a character (Boba Fett).';
      return fin(q, { topic: lbl, empty: true, emptyWhy: 'no ' + kind + ' matched ' + (lbl === 'all' ? 'that' : '“' + lbl + '”') + '.', suggest: '' },
        { summary: 'No ' + kind + ' found for <strong>' + esc(lbl) + '</strong>.' + sg, rows: [] });
    }

    if (intent === 'count') {
      var byR = {}; items.forEach(function (it) { byR[rarLabel(it)] = (byR[rarLabel(it)] || 0) + 1; });
      var br = Object.keys(byR).sort(function (a, b) { return byR[b] - byR[a]; }).map(function (r) { return byR[r] + ' ' + r; }).join(' · ');
      return fin(q, { topic: L(lbl) + kind + ' count', empty: false }, { summary: '<strong>' + items.length + '</strong> ' + L(lbl) + kind + ' in the catalog.<br><span class="small">' + br + '</span>', rows: [] });
    }

    if (intent === 'held' || intent === 'burnt' || intent === 'unsold') {
      // a specific collectible ("what does VeVe hold back on <item>?") → precise per-item answer, not a ranked list
      if (p.subj && items.length && items.length <= 8) return itemMetricAnswer(q, items, intent);
      var metricFn = intent === 'held' ? totalHeld : (intent === 'burnt' ? burnt : unsold);
      var full = items.filter(function (it) { return metricFn(it) > 0; }).sort(function (a, b) { return metricFn(b) - metricFn(a); });
      var word = intent === 'held' ? 'held back (reserve #1→LPM + random withholds VeVe keeps off-market)' : (intent === 'burnt' ? 'burnt (removed from supply)' : 'unsold (still in VeVe\'s Store)');
      if (!full.length) {
        var why = intent === 'held' ? 'reserved-mint data isn\'t recorded for ' + (L(lbl) || 'these ') + kind + ' — we know the reserve only where the lowest-public mint has been researched' : 'no ' + (intent === 'burnt' ? 'burns' : 'unsold stock') + ' recorded for ' + (L(lbl) || 'these ') + kind;
        return fin(q, { topic: L(lbl) + kind + ' ' + intent, empty: true, emptyWhy: why + '.', suggest: intent === 'held' ? 'I can list what IS researched — ask "which collectibles are held back?" without a filter.' : '' },
          { summary: 'No ' + intent + ' data — ' + why + '.', rows: [] });
      }
      return fin(q, { topic: L(lbl) + 'collectibles VeVe ' + (intent === 'held' ? 'holds back' : intent === 'burnt' ? 'burnt' : 'has unsold'), full: full, cols: intent },
        { summary: 'Top ' + Math.min(full.length, N) + ' ' + L(lbl) + kind + ' by <strong>' + word + '</strong>' + (full.length > N ? ' <span class="small">(' + full.length + ' total)</span>' : '') + ':', rows: full.slice(0, N), cols: intent });
    }

    if (intent === 'floor') {
      var subjq = sq(p.subj);
      var exact = items.filter(function (it) { return subjq && sq(it.name).indexOf(subjq) >= 0; }).sort(function (a, b) { return sq(a.name).length - sq(b.name).length; });
      if (subjq && exact.length) { var it0 = exact[0]; var c0 = cost(it0); return fin(q, { item: it0, topic: 'the floor of ' + it0.name }, { summary: '<strong>' + esc(it0.name) + '</strong> — floor ' + (c0 ? '💎 ' + Math.round(c0.v).toLocaleString() + (c0.src === 'veve' ? ' (VeVe lowest ask)' : c0.src === 'stackr' ? ' (StackR traded floor)' : ' (drop price)') : 'unknown') + ' · ' + rarLabel(it0) + (it0.edition ? ' · edition ' + it0.edition.toLocaleString() : '') + (DESC.coll[it0.slug] ? '<br><span class="small">' + DESC.coll[it0.slug] + '</span>' : ''), rows: [] }); }
      var fc = topBy(items, 'cheap');
      return fin(q, { topic: 'cheapest ' + L(lbl) + kind, full: fc, cols: 'cheap' }, { summary: 'Cheapest ' + esc(lbl) + ' ' + kind + ' by market floor:', rows: fc.slice(0, N), cols: 'cheap' });
    }

    var order = (intent === 'list') ? 'scarce' : intent;
    var fullr = topBy(items, order);
    var titles = { scarce: 'scarcest (smallest edition)', common: 'most common (largest edition)', cheap: 'cheapest (market floor)', expensive: 'most valuable (market floor)', mcp: 'best MCP value' };
    return fin(q, { topic: (titles[order] || 'top') + ' ' + L(lbl) + kind, full: fullr, cols: order, order: order },
      { summary: 'The ' + Math.min(fullr.length, N) + ' ' + (titles[order] || 'top') + ' ' + L(lbl) + kind + (fullr.length > N ? ' <span class="small">(' + fullr.length + ' total)</span>' : '') + ':', rows: fullr.slice(0, N), cols: order });
  }

  // ---- conversation state -------------------------------------------------
  var LAST = null, CURP = null;   // CURP = the parse behind the current answer (for refine follow-ups)
  // fin(): finalise a result, remember it for follow-ups, and return it to the UI.
  function fin(q, meta, r) {
    LAST = {
      q: q, topic: meta.topic || '', cols: meta.cols || r.cols || null, order: meta.order || r.cols || null,
      full: meta.full || r.rows || [], shown: (r.rows || []).length,
      empty: !!meta.empty, emptyWhy: meta.emptyWhy || '', suggest: meta.suggest || '',
      item: meta.item || null,
      _uni: CURP ? CURP.uni : null, _subj: CURP ? CURP.subj : '', _rarity: CURP ? CURP.rarity : null, _useComics: CURP ? CURP.useComics : false
    };
    return r;
  }

  function ordinalOf(s) {
    var map = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };
    for (var k in map) if (new RegExp('\\b' + k + '\\b').test(s)) return map[k];
    var m = s.match(/(?:number|no\.?|#)\s*(\d{1,2})\b/); if (m) return parseInt(m[1], 10);
    m = s.match(/^\s*(\d{1,2})\s*$/); if (m) return parseInt(m[1], 10);
    return null;
  }
  function bareIntent(s) {
    // the message is basically JUST a metric word → reuse the last subject/universe
    var i = intentOf(s);
    if (i !== 'list' && i !== 'about') return i;
    if (/\bscarce|rare\b/.test(s)) return 'scarce';
    return null;
  }

  // RICH item card — the flagship "smart" answer when the user names a specific collectible/comic.
  // Everything we know: rarity/universe/character/set/season, floor, LPM, EXACT held-back (on-chain),
  // circulation/burnt/unsold, MCP, lore, and StackR/VeVe buy links. Also used by row/pronoun follow-ups.
  function kv(l, v) { return '<div style="display:flex;gap:10px;font-size:13.5px;padding:2px 0"><span style="color:var(--muted);flex:0 0 132px">' + l + '</span><span style="font-weight:600;min-width:0">' + v + '</span></div>'; }
  function itemCard(it, q, matches) {
    var c = cost(it), isC = !!it._comic, rows = [];
    rows.push(kv('Rarity', esc(it.rarity || '?') + (it.fe ? ' · First Edition' : '') + (it.sp ? ' · ✨ special' : '')));
    if (it.universe) rows.push(kv('Universe', esc(ucap(it.universe))));
    if (it.character) rows.push(kv('Character', esc(it.character)));
    if (isC && it.series) rows.push(kv('Series', esc(it.series) + (it._n ? ' #' + esc(String(it._n)) : '') + (it.age ? ' <span class="small">· ' + esc(it.age) + ' age</span>' : '')));
    if (isC && it._r && it._r.length) rows.push(kv('Covers', esc(it._r.join(', '))));
    if (it.set) rows.push(kv('Set', esc(it.set)));
    if (it.season) rows.push(kv('Season', 'Season ' + it.season));
    if (it.edition) rows.push(kv('Edition size', it.edition.toLocaleString()));
    rows.push(kv('Market floor', c ? '💎 ' + Math.round(c.v).toLocaleString() + (c.src === 'veve' ? ' <span class="small">(VeVe 💠 ask)</span>' : c.src === 'stackr' ? ' <span class="small">(StackR ⛓ traded)</span>' : ' <span class="small">(drop price)</span>') : (it.blind ? '🎲 blind box — no fixed price' : 'unlisted')));
    if (it.lowmint) rows.push(kv('Lowest public mint', '#' + it.lowmint));
    var hl = heldList(it);
    if (hl) rows.push(kv('🔒 Held back by VeVe', heldCount(hl).toLocaleString() + ' <span class="small">(on-chain: #' + esc(hl).replace(/,/g, ', #') + ')</span>'));
    else if (reserved(it)) rows.push(kv('🔒 Held back by VeVe', randomHeld(it) ? totalHeld(it).toLocaleString() + ' <span class="small">(#1–#' + (it.lowmint - 1) + ' + ~' + randomHeld(it) + ' random)</span>' : reserved(it).toLocaleString() + ' <span class="small">(#1–#' + (it.lowmint - 1) + ')</span>'));
    if (it.circ) rows.push(kv('👥 In circulation', it.circ.toLocaleString()));
    if (burnt(it)) rows.push(kv('🔥 Burnt', burnt(it).toLocaleString()));
    if (!it.blind && unsold(it)) rows.push(kv('📦 Unsold in Store', unsold(it).toLocaleString()));
    rows.push(kv('MCP', '+' + mcp(it).toFixed(2) + '/day'));
    var lore = DESC.coll[it.slug] || (isC && it.tid && g.COMIC_DESC && g.COMIC_DESC[it.tid] && g.COMIC_DESC[it.tid].d) || '';
    var buy = '';
    if (it.tid) { var seg = isC ? 'comic' : 'collectible', pth = isC ? 'comics' : 'collectibles';
      buy = '<div class="exchips" style="margin-top:10px"><a class="exchip" href="https://www.stackr.world/collections/veve/' + seg + '/' + it.tid + '" target="_blank" rel="noopener">🛒 StackR ↗</a><a class="exchip" href="https://www.veve.me/collectibles/en/' + pth + '/' + it.tid + '" target="_blank" rel="noopener">VeVe ↗</a></div>'; }
    var alt = (matches && matches.length > 1) ? '<div class="small" style="margin-top:10px">Also matched: ' + matches.filter(function (m) { return m !== it; }).slice(0, 5).map(function (m) { return '<span class="exchip" onclick="ASKPICK(\'' + itemId(m) + '\')">' + esc(m.name) + '</span>'; }).join(' ') + '</div>' : '';
    return fin(q, { item: it, topic: it.name }, {
      summary: '<strong style="font-size:16px">' + esc(it.name) + '</strong>' + (isC ? ' <span class="small">comic</span>' : '') +
        '<div style="margin-top:8px">' + rows.join('') + '</div>' +
        (lore ? '<div class="small" style="margin-top:10px;line-height:1.6">' + esc(lore) + '</div>' : '') + buy + alt, rows: []
    });
  }
  // when several distinct items genuinely fit and none clearly dominates, ASK instead of guessing —
  // clickable options that resolve to the EXACT item (via ASKPICK → ASK.card(id)).
  function disambiguate(q, list) {
    var opts = list.map(function (it) {
      var tag = it._comic ? ('comic' + (it.series ? ' · ' + it.series : '')) : ((it.rarity || '?') + (it.set ? ' · ' + it.set : '') + (it.drop ? ' · ' + String(it.drop).slice(0, 4) : ''));
      return '<span class="exchip" onclick="ASKPICK(\'' + itemId(it) + '\')" style="display:inline-block;margin:3px 5px 0 0">' + esc(it.name) + ' <span class="small">— ' + esc(tag) + '</span></span>';
    }).join('');
    return fin(q, { topic: 'which one', full: list, cols: 'scarce' },
      { summary: '🤔 A few match — which one do you mean?<div style="margin-top:8px">' + opts + '</div>', rows: [] });
  }
  // route a specific-item query to the rich card (bare item name, "tell me about X", "X floor", …),
  // or to a disambiguation prompt when it's genuinely ambiguous.
  function maybeItemCard(q) {
    var io = intentOf(q);
    if (io !== 'list' && io !== 'about' && io !== 'floor') return null;   // ranked/metric intents keep their own handlers
    var pp = parse(q);
    if (!pp.subj || pp.uni) return null;                                  // universe queries → list handler
    var subjq = sq(pp.subj); if (COMIC_ABBR[subjq]) subjq = sq(COMIC_ABBR[subjq]);
    if (subjq.length < 3) return null;
    var matches = selectItems(pp).slice().sort(function (a, b) {
      var ax = (sq(a.name) === subjq || sq(a.aka || '') === subjq) ? 0 : 1, bx = (sq(b.name) === subjq || sq(b.aka || '') === subjq) ? 0 : 1;
      if (ax !== bx) return ax - bx;                                      // exact name/aka first
      var ad = a.drop || '9999', bd = b.drop || '9999';                  // then the FIRST drop (collectors mean the original)
      if (ad !== bd) return ad < bd ? -1 : 1;
      return Math.abs(sq(a.name).length - subjq.length) - Math.abs(sq(b.name).length - subjq.length);
    });
    var cap = pp.rarity ? 40 : 12;
    if (!matches.length || matches.length > cap) return null;
    var best = matches[0], bn = sq(best.name), ba = sq(best.aka || '');
    var bestStrong = bn.indexOf(subjq) >= 0 || ba.indexOf(subjq) >= 0 || subjq.indexOf(bn) >= 0;
    if (!bestStrong && !pp.rarity && matches.length > 3) return null;     // weak match, no rarity → let the engine list it
    var exact = matches.filter(function (it) { return sq(it.name) === subjq || sq(it.aka || '') === subjq; });
    // ambiguous = 2+ items literally named the subject (e.g. two Common "Yoda"), or a small no-rarity
    // spread with no exact winner. A rarity that pins one variant, or a single exact, is NOT ambiguous.
    var ambiguous = pp.rarity ? (exact.length >= 2)
      : ((exact.length >= 2) || (exact.length === 0 && bestStrong && matches.length >= 2 && matches.length <= 6));
    if (ambiguous) return disambiguate(q, matches.slice(0, 8));
    return itemCard(best, q, matches);
  }

  // "is/why isn't X a Y collectible?" — look up the SPECIFIC named item and state its real universe,
  // instead of falling through to a generic "scarcest Y" list (the Millennium Falcon case).
  function ucap(u) { return (u || '').replace(/-/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); }); }
  function itemBelongs(q) {
    var s = q.toLowerCase();
    var shape = /\b(is|isn'?t|isnt|are|aren'?t|arent)\b/.test(s) || /\bwhy\b/.test(s);
    var belongs = /collectible|belong|from |part of|listed|considered|counted|classif|categor|which (universe|franchise|licens)|\b(a|an) (star ?wars|marvel|dc|disney|pixar|street ?fighter|jurassic|transformers)\b/.test(s);
    if (!shape || !belongs) return null;
    var qs = sq(q), found = null, flen = 0;
    C.forEach(function (it) { var n = sq(it.name); if (n.length >= 5 && qs.indexOf(n) >= 0 && n.length > flen) { found = it; flen = n.length; } });
    if (!found) return null;
    var claimed = detectUni(qs), uni = found.universe || '';
    var art = function (w) { return /^[aeiou]/i.test(w) ? 'an' : 'a'; };
    var un = ucap(uni), lead;
    if (claimed && claimed === uni) lead = '✅ Yes — <strong>' + esc(found.name) + '</strong> IS ' + art(un) + ' ' + esc(un) + ' collectible.';
    else if (claimed && claimed !== uni) lead = '❕ In our catalog <strong>' + esc(found.name) + '</strong> is ' + art(un) + ' <strong>' + esc(un) + '</strong> collectible' + (found.license ? ' (licensor: ' + esc(found.license) + ')' : '') + ' — not ' + esc(ucap(claimed)) + '.';
    else lead = '<strong>' + esc(found.name) + '</strong> is ' + art(un) + ' <strong>' + esc(un) + '</strong> collectible' + (found.license ? ' (licensor: ' + esc(found.license) + ')' : '') + '.';
    var c = cost(found);
    var facts = (found.rarity || '?') + (found.edition ? ' · edition ' + found.edition.toLocaleString() : '') + (c ? ' · 💎 ' + Math.round(c.v).toLocaleString() : '') + (found.season ? ' · Season ' + found.season : '');
    return fin(q, { item: found, topic: found.name }, { summary: lead + '<br><span class="small">' + esc(facts) + (DESC.coll[found.slug] ? ' — ' + esc(DESC.coll[found.slug]) : '') + '</span>', rows: [] });
  }

  // follow-up handler — returns a result, or null to fall through to a fresh query
  function followUp(q) {
    if (!LAST) return null;
    var s = q.toLowerCase().trim().replace(/[?!.]+$/, ''); var words = s.split(/\s+/);

    // 1) doubt / confirm  ("sure?", "really?", "are you sure")
    if (/^(sure|really|rly|srsly|seriously|you sure|are you sure|is that (right|correct|true)|certain|for real|for sure|correct|right|honestly|no way)$/.test(s)) {
      if (LAST.empty) return { summary: '🙂 To be clear — it\'s not that the count is zero. ' + LAST.emptyWhy + (LAST.suggest ? ' <span class="small">' + LAST.suggest + '</span>' : ''), rows: [] };
      var proof = (LAST.full || []).slice(0, Math.min(5, LAST.shown || 5));
      return { summary: '✅ Yes — ' + (LAST.topic ? esc(LAST.topic) + ' are' : 'that\'s') + ' straight from the catalog (live edition sizes, market floors, and VeVe\'s reserve/burn/store figures — computed, not estimated).' + (LAST.item ? '' : ' Here it is again:'), rows: LAST.item ? [] : proof, cols: LAST.cols };
    }
    // 2) why / basis
    if (/^(why|why not|how so|how come|says who|based on what|how do you know|whats the (basis|source)|source|prove it|explain( that| this)?)$/.test(s) || (words.length <= 3 && /^why\b/.test(s))) {
      var basis = {
        scarce: 'ranked by edition size — smallest total mint = scarcest (Artist-Proof artworks excluded so 1-of-1 prints don\'t dominate).',
        common: 'ranked by edition size — largest total mint first.',
        cheap: 'ranked by the live market floor: VeVe 💠 Gem floor, else StackR ⛓ OMI floor, else drop price.',
        expensive: 'ranked by the live market floor (VeVe 💠 / StackR ⛓), highest first.',
        mcp: 'ranked by MCP-per-💎 — daily points earned divided by the market-floor cost to acquire.',
        held: 'held-back = every mint below the lowest public mint (#1 → lpm−1), which VeVe reserves and never sells.',
        burnt: 'burnt = editions VeVe removed from supply, recorded on-chain.',
        unsold: 'unsold = editions still sitting in VeVe\'s Store, never bought.'
      };
      return { summary: '📊 ' + (basis[LAST.cols] || basis[LAST.order] || 'It\'s computed directly from the catalog data — edition sizes, market floors, and VeVe\'s reserve/burn/store figures.'), rows: [] };
    }
    // 3) more / next page
    if (/^(more|show more|see more|next|another|others|keep going|go on|continue|and more|show the rest|rest)$/.test(s) && words.length <= 4) {
      if (!LAST.full || LAST.shown >= LAST.full.length) return { summary: 'That\'s the full list — nothing more to show.', rows: [] };
      var nxt = LAST.full.slice(LAST.shown, LAST.shown + 10); var startAt = LAST.shown; LAST.shown += nxt.length;
      return { summary: 'More' + (LAST.topic ? ' ' + esc(LAST.topic) : '') + ' <span class="small">(' + (startAt + 1) + '–' + LAST.shown + ')</span>:', rows: nxt, cols: LAST.cols, startIndex: startAt };
    }
    // 4) affirmation / thanks
    if (/^(thanks|thank you|thx|ty|cool|nice|great|awesome|ok|okay|got it|makes sense|good|perfect|helpful|yes|yeah|yep)$/.test(s) && words.length <= 3) {
      return { summary: '👍 Anything else? Ask about scarcity, floors, what VeVe holds back / burnt / has unsold, a set, a season, or a specific collectible.', rows: [] };
    }
    // 5) row reference ("the 2nd one", "#3", "the last", a bare "3")
    var ord = ordinalOf(s);
    if (ord != null && LAST.full && LAST.full.length && !/\bof\b/.test(s) && words.length <= 6) {
      var idx = ord === -1 ? LAST.full.length - 1 : ord - 1;
      if (idx >= 0 && idx < LAST.full.length) return itemCard(LAST.full[idx], q);
    }
    // 6) refine: a metric follow-up with no new subject → apply to the last subject/universe
    if (subject(q) === '' && (LAST.item || LAST.topic)) {
      var ni = bareIntent(s);
      if (ni) {
        if (LAST.item && /floor|price|worth|much|blind|held|reserve|burnt|unsold/.test(s)) return itemCard(LAST.item, q);
        return engine(q, ni, topN(q), { uni: detectUni(sq(q)) || LAST._uni || null, subj: LAST._subj || '', rarity: detectRarity(q) || LAST._rarity || null, useComics: /\bcomics?\b/.test(s) || LAST._useComics });
      }
      if (LAST.item && /(it|this|that|its)\b/.test(s)) return itemCard(LAST.item, q);
    }
    // 7) "what about X" / "how about X" / "and X" → new subject, inherit the last intent
    var wa = s.match(/^(?:what about|how about|and what about|what if|and|also|now)\s+(.+)$/);
    if (wa) {
      var sub = wa[1]; var inh = LAST.order || LAST.cols;
      var i2 = intentOf(sub); if (i2 === 'list' && inh && inh !== 'scarce') i2 = inh;
      return engine(sub, i2, topN(sub));
    }
    return null;
  }

  // ---- public entry: conversational -------------------------------------
  function respond(q) {
    q = (q || '').trim();
    if (!q) return { summary: 'Ask me anything about the collectibles — e.g. "scarcest 5 Spider-Man collectibles", "which Disney collectibles are held back?", or "what is Alligator Loki?"', rows: [] };
    // distribution / "who owns the most" — checked BEFORE the edition locator, because a comic
    // issue number (#15) is not an edition number and shouldn't trigger the locator.
    if (intentOf(q) === 'dist') return engine(q, 'dist', topN(q), parse(q));
    // edition locator ("where is #1987 of X?")
    var em = q.match(/(?:#|edition|mint|no\.?|number)\s*#?\s*(\d{1,7})/i);
    if (em && (/#\s*\d/.test(q) || /where|who|locate|holder|owns?|\bhas\b|sitting/i.test(q))) return locate(q, parseInt(em[1], 10));
    // follow-up to the previous answer?
    var fu = followUp(q);
    if (fu) return fu;
    // "is/why isn't <named item> a <franchise> collectible?" → answer about that specific item
    var belong = itemBelongs(q);
    if (belong) return belong;
    // a specific collectible/comic named (any phrasing) → rich item card
    var card = maybeItemCard(q);
    if (card) return card;
    // fresh query (engine remembers the parse in LAST for later refine follow-ups)
    return engine(q, intentOf(q), topN(q), parse(q));
  }

  g.ASK = {
    ask: respond,
    reset: function () { LAST = null; },
    cost: cost, costStr: costStr, mcp: mcp, reserved: reserved, heldBack: heldBack, totalHeld: totalHeld,
    card: function (id) { var it = itemById(id); return it ? itemCard(it, '', null) : { summary: 'Sorry — I lost track of that one. Ask again?', rows: [] }; },
    desc: function (slug) { return DESC.coll[slug] || ''; },
    stats: { collectibles: C.length, universes: uniList.length, comics: COMICS.length }
  };
})(typeof window !== 'undefined' ? window : this);
