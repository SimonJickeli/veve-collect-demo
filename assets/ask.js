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
  var DESC = g.WIKI_DESC || { coll: {}, lore: {} };

  function nz(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function sq(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function esc(s) { return (s || '').replace(/</g, '&lt;'); }
  function L(lbl) { return (lbl && lbl !== 'all') ? esc(lbl) + ' ' : ''; }

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
  // HELD BACK = reserved low mints (#1 → lowest-public−1). UNSOLD = Store stock. BURNT = removed. All separate.
  function reserved(it) { return (it.lowmint && it.lowmint > 1) ? (it.lowmint - 1) : 0; }
  function heldBack(it) { return reserved(it); }
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
    'scarce scarcest rare rarest rarer common commons uncommon uncommons secret ultra proof artist floor floors ' +
    'price prices priced pricing worth value valuable priciest cheap cheapest expensive count counted counting ' +
    'number numbers how many much top best good better great highest lowest smallest biggest largest fewest ' +
    'own owns owned owning holder holders where locate located sitting has have got');
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

  function comicItems() {
    return COMICS.map(function (c) {
      var rank = { 'Secret Rare': 0, 'Ultra Rare': 1, 'Rare': 2, 'Uncommon': 3, 'Common': 4 };
      var top = (c.r || []).slice().sort(function (a, b) { return (rank[a] == null ? 9 : rank[a]) - (rank[b] == null ? 9 : rank[b]); })[0] || '';
      return { name: c.t + (c.n ? ' #' + c.n : ''), universe: nz(c.l), character: '', rarity: top, edition: c.e, price: null, floor: c.f, blind: false, drop: c.d, _comic: true, age: c.a, series: c.s };
    });
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
      var nar = items.filter(function (it) { return sq(it.name).indexOf(subjq) >= 0 || sq(it.character).indexOf(subjq) >= 0 || sq(it.series || '').indexOf(subjq) >= 0; });
      if (nar.length) items = nar;
      else if (!p.uni) { var b2 = base.filter(function (it) { return sq(it.universe).indexOf(subjq) >= 0 || sq(it.name).indexOf(subjq) >= 0 || sq(it.character).indexOf(subjq) >= 0; }); if (b2.length) items = b2; }
      // universe set + no name match → keep the universe list (don't over-narrow)
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
    var sj = sq(sub), it = null;
    if (sj) {
      var m = C.filter(function (x) { return sq(x.name).indexOf(sj) >= 0 || sq(x.character).indexOf(sj) >= 0; });
      if (!m.length) { var toks = sub.split(' ').filter(function (t) { return t.length > 1; }); m = C.filter(function (x) { var nm = sq(x.name) + sq(x.character); return toks.length && toks.every(function (t) { return nm.indexOf(sq(t)) >= 0; }); }); }
      it = m.sort(function (a, b) { return sq(a.name).length - sq(b.name).length; })[0];
    }
    if (!it) return fin(q, { topic: 'an edition', empty: true, emptyWhy: 'I need to know which collectible.' }, { summary: 'Which collectible? Try e.g. "where is #41 of Alligator Loki?"', rows: [] });
    var lpm = it.lowmint, iss = issuedOf(it), res = reserved(it), bn = burnt(it), st = unsold(it);
    var head = '<strong>#' + N + ' of ' + esc(it.name) + '</strong> <span class="small">(' + (it.rarity || '?') + (it.edition ? ', edition of ' + it.edition.toLocaleString() : '') + ')</span> — ';
    var meta = { item: it, topic: '#' + N + ' of ' + it.name };
    if (iss && N > iss) return fin(q, meta, { summary: head + '❔ there is no #' + N + ' — only ' + iss.toLocaleString() + ' editions were minted.', rows: [] });
    if (lpm && N > 0 && N < lpm) return fin(q, meta, { summary: head + '🔒 <strong>Held back by VeVe</strong> — a reserved mint below the lowest public mint (#' + lpm + '). It sits in VeVe\'s reserve wallet and was never sold to collectors.', rows: [] });
    var bits = []; if (res) bits.push('#1–#' + (lpm - 1) + ' reserved'); if (bn) bits.push(bn.toLocaleString() + ' burnt'); if (st) bits.push(st.toLocaleString() + ' unsold');
    var ctx = bits.length ? ' For ' + esc(it.name) + ': ' + bits.join(' · ') + '.' : '';
    if (!lpm) return fin(q, meta, { summary: head + '❔ the lowest public mint isn\'t recorded for this one, so I can\'t say for certain whether #' + N + ' is reserved.' + ctx + ' <span class="small">Mints below the reserve are held back; the rest are with collectors, unsold, or burnt — exact per-edition owner needs VeVe\'s app.</span>', rows: [] });
    return fin(q, meta, { summary: head + '👤 in the <strong>public range</strong> (#' + lpm + '+), so #' + N + ' is with a collector, unsold, or burnt — not a VeVe reserve.' + ctx + ' <span class="small">Pinpointing which needs VeVe\'s app / a full on-chain owner scan; only mints below #' + lpm + ' are certainly held back.</span>', rows: [] });
  }

  // ---- the query engine (stateless core) ----------------------------------
  function engine(q, intent, N, pIn) {
    var p = pIn || parse(q); CURP = p;
    var items = selectItems(p), lbl = labelOf(p);
    var kind = p.useComics ? 'comics' : 'collectibles';

    if (intent === 'about') {
      var key = sq(p.subj), hit = null;
      for (var k in DESC.lore) { if (sq(DESC.lore[k].t) === key || (key && sq(DESC.lore[k].t).indexOf(key) >= 0)) { hit = DESC.lore[k]; break; } }
      if (hit) { var proof = topBy(items, 'scarce').slice(0, 5); return fin(q, { topic: hit.t, item: hit, full: proof, cols: 'scarce' }, { summary: '<strong>' + hit.t + '</strong> <span class="small">(' + hit.k + (hit.u ? ' · ' + hit.u : '') + ')</span><br>' + hit.d, note: proof.length ? 'Top pieces:' : '', rows: proof, cols: 'scarce' }); }
      intent = 'list';
    }

    if (!items.length) return fin(q, { topic: lbl, empty: true, emptyWhy: 'no ' + kind + ' matched ' + (lbl === 'all' ? 'that' : '“' + lbl + '”') + '.', suggest: 'Try a universe (Marvel, Star Wars, Disney) or a character (Boba Fett).' },
      { summary: 'No ' + kind + ' found for <strong>' + esc(lbl) + '</strong>. Try a universe (Spider-Man, Star Wars, Disney…) or a character (Boba Fett).', rows: [] });

    if (intent === 'count') {
      var byR = {}; items.forEach(function (it) { byR[rarLabel(it)] = (byR[rarLabel(it)] || 0) + 1; });
      var br = Object.keys(byR).sort(function (a, b) { return byR[b] - byR[a]; }).map(function (r) { return byR[r] + ' ' + r; }).join(' · ');
      return fin(q, { topic: L(lbl) + kind + ' count', empty: false }, { summary: '<strong>' + items.length + '</strong> ' + L(lbl) + kind + ' in the catalog.<br><span class="small">' + br + '</span>', rows: [] });
    }

    if (intent === 'held' || intent === 'burnt' || intent === 'unsold') {
      var metricFn = intent === 'held' ? heldBack : (intent === 'burnt' ? burnt : unsold);
      var full = items.filter(function (it) { return metricFn(it) > 0; }).sort(function (a, b) { return metricFn(b) - metricFn(a); });
      var word = intent === 'held' ? 'held back (reserved low mints, #1 → lowest-public)' : (intent === 'burnt' ? 'burnt (removed from supply)' : 'unsold (still in VeVe\'s Store)');
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
      if (subjq && exact.length) { var it0 = exact[0]; var c0 = cost(it0); return fin(q, { item: it0, topic: 'the floor of ' + it0.name }, { summary: '<strong>' + esc(it0.name) + '</strong> — floor ' + (c0 ? '💎 ' + Math.round(c0.v).toLocaleString() + (c0.src === 'veve' ? ' (VeVe Gem floor)' : c0.src === 'stackr' ? ' (StackR OMI floor)' : ' (drop price)') : 'unknown') + ' · ' + rarLabel(it0) + (it0.edition ? ' · edition ' + it0.edition.toLocaleString() : '') + (DESC.coll[it0.slug] ? '<br><span class="small">' + DESC.coll[it0.slug] + '</span>' : ''), rows: [] }); }
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

  // detail card for one collectible (used by row/pronoun follow-ups)
  function itemCard(it, q) {
    var c = cost(it), bits = [];
    bits.push((it.rarity || '?') + (it.edition ? ' · edition ' + it.edition.toLocaleString() : ''));
    if (it.universe) bits.push(it.universe);
    if (it.set) bits.push('set: ' + it.set);
    var lines = [];
    lines.push('Floor: ' + (c ? '💎 ' + Math.round(c.v).toLocaleString() + (c.src === 'veve' ? ' (VeVe 💠)' : c.src === 'stackr' ? ' (StackR ⛓)' : ' (drop)') : (it.blind ? '🎲 blind box — no fixed price' : 'unlisted')));
    if (reserved(it)) lines.push('🔒 ' + reserved(it).toLocaleString() + ' held back (#1–#' + (it.lowmint - 1) + ' reserved)');
    if (burnt(it)) lines.push('🔥 ' + burnt(it).toLocaleString() + ' burnt');
    if (unsold(it)) lines.push('📦 ' + unsold(it).toLocaleString() + ' unsold in store');
    var lore = DESC.coll[it.slug];
    return fin(q, { item: it, topic: it.name }, {
      summary: '<strong>' + esc(it.name) + '</strong> <span class="small">(' + esc(bits.join(' · ')) + ')</span><br>' +
        '<span class="small">' + lines.join(' &nbsp;·&nbsp; ') + '</span>' + (lore ? '<br>' + esc(lore) : ''), rows: []
    });
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
        return engine(q, ni, topN(q), { uni: LAST._uni || null, subj: LAST._subj || '', rarity: LAST._rarity || null, useComics: false });
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
    // edition locator ("where is #1987 of X?")
    var em = q.match(/(?:#|edition|mint|no\.?|number)\s*#?\s*(\d{1,7})/i);
    if (em && (/#\s*\d/.test(q) || /where|who|locate|holder|owns?|\bhas\b|sitting/i.test(q))) return locate(q, parseInt(em[1], 10));
    // follow-up to the previous answer?
    var fu = followUp(q);
    if (fu) return fu;
    // fresh query (engine remembers the parse in LAST for later refine follow-ups)
    return engine(q, intentOf(q), topN(q), parse(q));
  }

  g.ASK = {
    ask: respond,
    reset: function () { LAST = null; },
    cost: cost, costStr: costStr, mcp: mcp, reserved: reserved, heldBack: heldBack,
    desc: function (slug) { return DESC.coll[slug] || ''; },
    stats: { collectibles: C.length, universes: uniList.length, comics: COMICS.length }
  };
})(typeof window !== 'undefined' ? window : this);
