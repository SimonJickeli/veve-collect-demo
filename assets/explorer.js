/*
 * explorer.js — a browsable web Wiki for VeVe Collect. Every collectible, character, universe and set
 * is a cross-linked page (hash-routed, deep-linkable). Content from wiki.js; live data from catalog.js.
 * Routes: #/  #/u/<universe>  #/e/<entity>  #/c/<slug>  #/set/<set>  #/season/<n>  #/q/<query>
 */
(function () {
  'use strict';
  var C = (window.CATALOG && CATALOG.items) || [];
  var COMICS = window.COMICS || [];
  var W = window.WIKI || { coll: {}, ent: {}, dom: {}, col: {} };
  var SM = (window.CATALOG && CATALOG.seasonMeta) || {};
  var nn = window.normName || function (s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var $ = function (s) { return document.querySelector(s); };
  var view = $('#view');

  // ---- indices ----
  var bySlug = {}, byUni = {}, byChar = {}, bySet = {}, bySeason = {}, charToEnt = {};
  C.forEach(function (c) {
    bySlug[c.slug] = c;
    if (c.universe) (byUni[c.universe] = byUni[c.universe] || []).push(c);
    if (c.character) (byChar[nn(c.character)] = byChar[nn(c.character)] || []).push(c);
    if (c.set) (bySet[c.set] = bySet[c.set] || []).push(c);
    if (c.season) (bySeason[c.season] = bySeason[c.season] || []).push(c);
  });
  Object.keys(W.ent).forEach(function (slug) { var e = W.ent[slug]; if (e.t) charToEnt[nn(e.t)] = slug; });
  var uniList = Object.keys(byUni).sort(function (a, b) { return byUni[b].length - byUni[a].length; });

  // ---- comics: title-first universe classifier + indices (comics.js / comics_mcp.js / comic-historic.js) ----
  function cslug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  var COMIC_UNI = [
    ['star-wars', /star wars|darth|vader|skywalker|jedi|sith|mandalor|boba fett|grogu|obi-?wan|\byoda\b|clone wars|ahsoka|thrawn|jango|inquisitor/],
    ['star-trek', /star trek/], ['tmnt', /teenage mutant|tmnt|ninja turtles/], ['transformers', /transformers|optimus|megatron/],
    ['gi-joe', /g\.?i\.?\s*joe/], ['voltron', /voltron/], ['ultraman', /ultraman/],
    ['red-sonja', /red sonja|army of darkness/], ['vampirella', /vampirella/], ['tarzan', /tarzan|lord of the jungle/],
    ['john-carter', /john carter|warlord of mars|barsoom|dejah thoris/], ['battlestar-galactica', /battlestar/],
    ['james-bond', /james bond|\b007\b/], ['assassins-creed', /assassin.?s creed/], ['robocop', /robocop/], ['rambo', /rambo/],
    ['chucky', /chucky|child.?s play/], ['pink-panther', /pink panther/], ['the-simpsons', /simpsons/], ['ghostbusters', /ghostbusters/],
    ['predator', /predator/], ['alien', /\balien|xenomorph|aliens/], ['jurassic-park', /jurassic/], ['back-to-the-future', /back to the future/],
    ['street-fighter', /street fighter/], ['knight-rider', /knight rider/], ['stargate', /stargate/], ['astro-boy', /astro boy/],
    ['solo-leveling', /solo leveling/], ['project-superpowers', /project superpowers|black terror|death-defying/],
    ['dc', /batman|superman|wonder woman|harley|justice league|gotham|aquaman|the flash|green lantern/],
    ['marvel', /spider-?man|avenger|x-men|wolverine|deadpool|venom|\bhulk\b|\bthor\b|silver surfer|fantastic four|daredevil|captain america|iron man|black panther|moon knight|scarlet witch|doctor strange|ghost rider|\bblade\b|punisher|\bnyx\b|dracula|blood hunt|elektra|gwen/]
  ];
  function comicUni(rec) {
    var hay = ((rec.s || '') + ' ' + (rec.t || '')).toLowerCase(), l = (rec.l || '').toLowerCase();
    for (var i = 0; i < COMIC_UNI.length; i++) if (COMIC_UNI[i][1].test(hay)) return COMIC_UNI[i][0];
    if (l === 'dc') return 'dc'; if (l === 'marvel') return 'marvel'; return null;
  }
  var CHIST = (window.COMIC_HISTORIC && COMIC_HISTORIC.issues) || {};
  function chGet(t, n) { return CHIST[nn(t) + ' ' + n] || null; }
  var CMCP = {};
  ((window.COMICS_MCP && COMICS_MCP.items) || []).forEach(function (r) { var k = nn(r.t) + '|' + r.n; var o = CMCP[k] || (CMCP[k] = { tid: r.tid, cov: {} }); if (r.tid) o.tid = r.tid; o.cov[r.r] = { f: r.f, e: r.e }; });
  function cmGet(rec) { return CMCP[nn(rec.t) + '|' + rec.n] || CMCP[nn(rec.s) + '|' + rec.n] || {}; }
  var comicsBySlug = {}, comicsByUni = {}, comicsBySeries = {};
  COMICS.forEach(function (rec) {
    var base = cslug((rec.s || rec.t) + '-' + rec.n), slug = base, i = 1;
    while (comicsBySlug[slug]) slug = base + '-' + (++i);
    rec._slug = slug; rec._uni = comicUni(rec);
    comicsBySlug[slug] = rec;
    if (rec._uni) (comicsByUni[rec._uni] = comicsByUni[rec._uni] || []).push(rec);
    (comicsBySeries[rec.s] = comicsBySeries[rec.s] || []).push(rec);
  });
  function comicSort(a, b) { return (a.s || '').localeCompare(b.s || '') || ((parseInt(a.n, 10) || 0) - (parseInt(b.n, 10) || 0)); }

  // ---- subdomains (franchise / brand layer, from subdomains.js) ----
  var SUBS = window.SUBS || { uni: {}, item: {} };
  var subOf = SUBS.item || {};
  var bySub = {};   // "<universe>/<sub-slug>" -> [items]
  C.forEach(function (c) { var s = subOf[c.slug]; if (s) (bySub[c.universe + '/' + s] = bySub[c.universe + '/' + s] || []).push(c); });
  function subInfo(uni, slug) { var u = SUBS.uni[uni]; if (!u) return null; for (var i = 0; i < u.subs.length; i++) if (u.subs[i].slug === slug) return u.subs[i]; return null; }
  function subLabel(uni, slug) { var s = subInfo(uni, slug); return s ? s.label : cap(slug); }
  function byEd(a, b) { return (a.edition || 1e9) - (b.edition || 1e9); }
  var uniHero = {};   // representative image per universe (scarcest item with one) — front-door cards
  Object.keys(byUni).forEach(function (u) { var it = byUni[u].filter(function (c) { return c.img; }).sort(byEd)[0]; if (it) uniHero[u] = it.img; });

  // ---- helpers ----
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function cap(s) { return (s || '').replace(/-/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); }); }
  function nav(r) { location.hash = '#/' + r; }
  function href(r) { return "location.hash='#/" + r.replace(/'/g, "%27") + "'"; }
  function sq(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  var _fn = nn, FL = {};
  if (window.FLOOR && FLOOR.byName) Object.keys(FLOOR.byName).forEach(function (n) { var k = _fn(n); if (k && !(k in FL)) FL[k] = FLOOR.byName[n]; });
  function stackr(name) { var r = (window.FLOOR && FLOOR.byName && (FLOOR.byName[name] || FL[_fn(name)])) || null; return (r && r.usd > 0) ? r.usd : null; }
  // StackR live TRADED floor is trusted first; the VeVe floor is only a lowest-ASK listing, so it's
  // sanitized (troll listings dropped) and shown as an "ask", not a market value.
  function cost(c) { var k = stackr(c.name); if (k) return { v: k, s: 'StackR ⛓' }; var vv = window.saneVeveFloor ? window.saneVeveFloor(c.floor) : c.floor; if (vv > 0) return { v: vv, s: 'VeVe ask 💠' }; if (!c.blind && c.price > 0) return { v: c.price, s: 'drop' }; return null; }
  function rClass(r) { return 'chip r-' + (r || '').replace(/ /g, ''); }
  window.exImgErr = function (img, cls) { img.outerHTML = '<div class="' + cls + ' noimg">🎴</div>'; };
  function thumb(c, cls) {
    return c.img
      ? '<img class="' + cls + '" src="' + c.img + '" loading="lazy" onerror="exImgErr(this,\'' + cls + '\')">'
      : '<div class="' + cls + ' noimg">🎴</div>';
  }
  function card(c) {
    var co = cost(c);
    return '<a class="excard" onclick="' + href('c/' + c.slug) + '">' + thumb(c, 'thumb') +
      '<div class="body"><div class="nm">' + esc(c.name) + '</div>' +
      '<div class="mt"><span class="' + rClass(c.rarity) + '">' + (c.rarity || '?') + '</span>' +
      (c.edition ? '<span>/' + c.edition.toLocaleString() + '</span>' : '') +
      (co ? '<span>💎' + Math.round(co.v).toLocaleString() + '</span>' : '') + '</div></div></a>';
  }
  function grid(items, limit) {
    limit = limit || 80;
    var shown = items.slice(0, limit).map(card).join('');
    return '<div class="exgrid">' + shown + '</div>' + (items.length > limit ? '<p class="small" style="margin-top:10px">Showing ' + limit + ' of ' + items.length.toLocaleString() + '.</p>' : '');
  }
  function comicCard(rec) {
    var covers = (rec.r || []).length;
    return '<a class="excard" onclick="' + href('comic/' + rec._slug) + '"><div class="thumb noimg">📖</div>' +
      '<div class="body"><div class="nm">' + esc(rec.t) + ' #' + esc(String(rec.n)) + '</div>' +
      '<div class="mt"><span>' + covers + ' cover' + (covers === 1 ? '' : 's') + '</span>' +
      (rec.y ? '<span>' + esc(String(rec.y)) + '</span>' : '') +
      (rec.f ? '<span>💎' + rec.f + '</span>' : '') + '</div></div></a>';
  }
  function comicGrid(list, limit) { limit = limit || 60; return '<div class="exgrid">' + list.slice(0, limit).map(comicCard).join('') + '</div>' + (list.length > limit ? '<p class="small" style="margin-top:10px">Showing ' + limit + ' of ' + list.length.toLocaleString() + ' issues.</p>' : ''); }
  function crumb(parts) { return '<div class="crumb">' + parts.map(function (p, i) { return (i ? '<span class="sep">›</span>' : '') + (p.r ? '<a onclick="' + href(p.r) + '">' + esc(p.t) + '</a>' : '<span>' + esc(p.t) + '</span>'); }).join('') + '</div>'; }

  // ---- filter + sort bar for list grids ----
  function costV(c) { var co = cost(c); return co ? co.v : null; }
  var gridState = { rar: '', sort: 'scarce' };
  window.exGrid = function (k, v) { gridState[k] = v; route(); };
  function applyGS(items) {
    var out = gridState.rar ? items.filter(function (c) { return (c.rarity || '') === gridState.rar; }) : items.slice();
    var s = gridState.sort;
    out.sort(
      s === 'new'    ? function (a, b) { return (b.drop || '').localeCompare(a.drop || ''); } :
      s === 'cheap'  ? function (a, b) { var x = costV(a), y = costV(b); return (x == null ? 1e12 : x) - (y == null ? 1e12 : y); } :
      s === 'pricey' ? function (a, b) { var x = costV(a), y = costV(b); return (y == null ? -1 : y) - (x == null ? -1 : x); } :
      byEd);
    return out;
  }
  function controls(n) {
    var RAR = ['', 'Common', 'Uncommon', 'Rare', 'Ultra Rare', 'Secret Rare'];
    var SORT = [['scarce', 'Scarcest'], ['new', 'Newest'], ['cheap', 'Cheapest'], ['pricey', 'Priciest']];
    return '<div class="exctl"><span class="cnt">' + n.toLocaleString() + ' items</span>' +
      '<label>Rarity <select onchange="exGrid(\'rar\',this.value)">' + RAR.map(function (r) { return '<option value="' + r + '"' + (gridState.rar === r ? ' selected' : '') + '>' + (r || 'All') + '</option>'; }).join('') + '</select></label>' +
      '<label>Sort <select onchange="exGrid(\'sort\',this.value)">' + SORT.map(function (o) { return '<option value="' + o[0] + '"' + (gridState.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>';
  }
  function mainGrid(items, limit) {
    var f = applyGS(items);
    return controls(items.length) + (f.length ? grid(f, limit || 120) : '<p class="small" style="margin-top:6px">No ' + (gridState.rar || '') + ' items in this view — try another rarity.</p>');
  }
  // ---- StackR / VeVe buy links for the collectible page (both keyed by collect_id) ----
  function buyRow(c) {
    if (!c.tid) return '';
    var co = cost(c), isS = co && /StackR/.test(co.s);
    var veve = 'https://www.veve.me/collectibles/en/collectibles/' + c.tid, st = 'https://www.stackr.world/collections/veve/collectible/' + c.tid;
    var pr = isS ? ['🛒 View on StackR', st] : ['🛒 View on VeVe', veve];
    var se = isS ? ['VeVe', veve] : ['StackR', st];
    return '<div class="exbuy"><a class="btn" href="' + pr[1] + '" target="_blank" rel="noopener">' + pr[0] + ' ↗</a>' +
      '<a class="buylink" href="' + se[1] + '" target="_blank" rel="noopener">also on ' + se[0] + ' ↗</a></div>';
  }

  // ---- views ----
  function home() {
    var tiles = uniList.map(function (u) {
      var info = SUBS.uni[u], nsub = info ? info.subs.filter(function (s) { return s.slug !== 'other' && s.slug !== 'artworks'; }).length : 0;
      return '<a class="unitile" onclick="' + href('u/' + u) + '">' +
        (uniHero[u] ? '<img class="uhero" src="' + uniHero[u] + '" loading="lazy" onerror="exImgErr(this,\'uhero\')">' : '<div class="uhero noimg">🎴</div>') +
        '<div class="ubody"><h3>' + esc(cap(u)) + '</h3><div class="c">' + byUni[u].length.toLocaleString() + ' collectibles' + (nsub ? ' · ' + nsub + ' sections' : '') + '</div></div></a>';
    }).join('');
    view.innerHTML =
      '<section class="hero" style="padding:6px 0 14px"><h1>The <span class="grad">VeVe Wiki</span>, explorable.</h1>' +
      '<p>' + C.length.toLocaleString() + ' collectibles · ' + COMICS.length.toLocaleString() + ' comics · ' + Object.keys(W.ent).length.toLocaleString() + ' characters · ' + uniList.length + ' universes · ' + Object.keys(bySet).length.toLocaleString() + ' sets — every one a page, all cross-linked. Search above, or start with a universe.</p></section>' +
      '<div class="sec-h">Universes</div><div class="unigrid">' + tiles + '</div>';
  }

  function notableStrip(list) {
    return '<div class="sec-h">Historically significant mints</div><div class="notable">' +
      list.map(function (n) { var c = bySlug[n.slug]; return '<a class="notecard" onclick="' + href('c/' + n.slug) + '">' + (c ? thumb(c, 'nthumb') : '') + '<div class="ninfo"><div class="nn">' + esc(n.name) + '</div><div class="nw">' + esc(n.why) + '</div></div></a>'; }).join('') + '</div>';
  }
  function subTiles(u, subs) {
    return '<div class="subgrid">' + subs.map(function (s) {
      var muted = (s.slug === 'artworks' || s.slug === 'other');
      return '<a class="subtile' + (muted ? ' muted' : '') + '" onclick="' + href('sub/' + u + '/' + s.slug) + '">' +
        (s.thumb ? '<img class="sthumb" src="' + s.thumb + '" loading="lazy" onerror="exImgErr(this,\'sthumb\')">' : '<div class="sthumb noimg">🎴</div>') +
        '<div class="sinfo"><div class="sl">' + esc(s.label) + '</div><div class="sc">' + s.count.toLocaleString() + (s.cat ? ' · ' + esc(s.cat) : '') + '</div></div></a>';
    }).join('') + '</div>';
  }
  function universe(u) {
    var all = (byUni[u] || []).slice();
    if (!all.length) return notfound('universe “' + u + '”');
    var d = W.dom[u], info = SUBS.uni[u] || { subs: [], notable: [] };
    var hasSubs = info.subs && info.subs.length;
    var mainItems = all.filter(function (c) { return subOf[c.slug] !== 'artworks'; }).sort(byEd);   // artworks live in their own tucked-away section
    var artCount = all.length - mainItems.length;
    var ents = Object.keys(W.ent).filter(function (s) { return W.ent[s].u === u; }).sort(function (a, b) { return W.ent[a].t > W.ent[b].t ? 1 : -1; });
    var sets = Object.keys(bySet).filter(function (s) { return (bySet[s][0] || {}).universe === u; });
    var ucomics = (comicsByUni[u] || []).slice().sort(comicSort);
    view.innerHTML = crumb([{ t: 'Explorer', r: '' }, { t: cap(u) }]) +
      '<h1 style="text-transform:capitalize;margin:0 0 6px">' + esc(cap(u)) + '</h1>' +
      (d ? '<div class="prose">' + esc(d.ov) + '</div>' : '') +
      '<p class="small">' + all.length.toLocaleString() + ' collectibles · ' + ents.length + ' characters · ' + sets.length + ' sets' + (ucomics.length ? ' · ' + ucomics.length.toLocaleString() + ' comics' : '') + '</p>' +
      (hasSubs ? '<div class="sec-h">Explore ' + esc(cap(u)) + '</div>' + subTiles(u, info.subs) : '') +
      (ents.length && !hasSubs ? '<div class="sec-h">Characters</div><div class="tagrow">' + ents.slice(0, 60).map(function (s) { return '<span class="tag" onclick="' + href('e/' + s) + '">' + esc(W.ent[s].t) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="sec-h">' + (hasSubs ? 'All collectibles' : 'Collectibles') + ' <span class="small">(scarcest first' + (artCount ? ' · ' + artCount + ' artworks in their own section above' : '') + ')</span></div>' + mainGrid(mainItems, 120) +
      (ucomics.length ? '<div class="sec-h">📖 Comics <span class="small">(' + ucomics.length.toLocaleString() + ' issue' + (ucomics.length === 1 ? '' : 's') + ' — every cover a page)</span></div>' + comicGrid(ucomics, 60) : '');
  }
  function subPage(uni, slug) {
    var items = (bySub[uni + '/' + slug] || []).slice().sort(byEd);
    if (!items.length) return notfound('section “' + slug + '”');
    var label = subLabel(uni, slug), s = subInfo(uni, slug);
    view.innerHTML = crumb([{ t: 'Explorer', r: '' }, { t: cap(uni), r: 'u/' + uni }, { t: label }]) +
      '<h1>' + esc(label) + ' <span class="small" style="color:var(--muted);text-transform:none">· ' + esc(cap(uni)) + (s && s.cat ? ' · ' + esc(s.cat) : '') + '</span></h1>' +
      (s && s.desc ? '<div class="prose">' + esc(s.desc) + '</div>' : '') +
      '<p class="small">' + items.length.toLocaleString() + ' collectibles' + (slug === 'artworks' ? ' — artwork-variety pieces (prints & Artist Proofs)' : '') + '</p>' + mainGrid(items, 200);
  }

  function entity(slug) {
    var e = W.ent[slug]; if (!e) return notfound('character “' + slug + '”');
    var items = (byChar[nn(e.t)] || []).slice().sort(function (a, b) { return (a.edition || 1e9) - (b.edition || 1e9); });
    view.innerHTML = crumb([{ t: 'Explorer', r: '' }].concat(e.u ? [{ t: cap(e.u), r: 'u/' + e.u }] : []).concat([{ t: e.t }])) +
      '<h1>' + esc(e.t) + '</h1>' +
      '<div class="tagrow">' + (e.u ? '<span class="tag" onclick="' + href('u/' + e.u) + '">' + esc(cap(e.u)) + '</span>' : '') + '</div>' +
      '<div class="prose">' + esc(e.ov) + '</div>' +
      (items.length ? '<div class="sec-h">' + items.length + ' collectible' + (items.length === 1 ? '' : 's') + '</div>' + mainGrid(items) : '<p class="small">No collectibles indexed for this character yet.</p>');
  }

  function setPage(name) {
    var items = (bySet[name] || []).slice().sort(function (a, b) { return (a.edition || 1e9) - (b.edition || 1e9); });
    if (!items.length) return notfound('set “' + name + '”');
    var uni = (items[0] || {}).universe, colSlug = slugForCollection(name);
    var d = colSlug && W.col[colSlug];
    view.innerHTML = crumb([{ t: 'Explorer', r: '' }].concat(uni ? [{ t: cap(uni), r: 'u/' + uni }] : []).concat([{ t: name }])) +
      '<h1>' + esc(name) + '</h1>' +
      (d ? '<div class="prose">' + esc(d.ov) + '</div>' : '') +
      '<p class="small">' + items.length + ' collectibles in this set' + (uni ? ' · ' + cap(uni) : '') + '</p>' + mainGrid(items, 200);
  }

  function seasonPage(n) {
    var items = (bySeason[n] || []).slice().sort(function (a, b) { return (a.edition || 1e9) - (b.edition || 1e9); });
    if (!items.length) return notfound('season ' + n);
    var m = SM[n];
    view.innerHTML = crumb([{ t: 'Explorer', r: '' }, { t: 'Season ' + n }]) +
      '<h1>🗓️ Season ' + n + (m ? ' <span class="small" style="color:var(--muted)">· ~' + m.year + '</span>' : '') + '</h1>' +
      '<p class="small">' + items.length.toLocaleString() + ' collectibles dropped in VeVe Season ' + n + '</p>' + mainGrid(items, 200);
  }

  // ---- historically significant mints: the edition whose NUMBER matches a milestone year ----
  // e.g. a Marvel collectible → #1939 (Marvel founded), #1963 (a character's 1st appearance),
  // #2021 (its VeVe drop year). Only years that fit inside the edition size are real mints.
  function sigMints(c) {
    if (typeof SIG === 'undefined' || !c.edition) return [];
    var E = c.edition, out = [], seen = {};
    function add(y, r) { y = +y; if (y >= 1 && y <= E && !seen[y]) { seen[y] = 1; out.push({ mint: y, reason: r }); } }
    if (c.drop) { var vy = parseInt(String(c.drop).slice(0, 4), 10); if (vy) add(vy, 'VeVe launch year — this collectible dropped'); }
    SIG.lookupUniverse(c.universe).forEach(function (e) { add(e.year, e.reason); });   // licensor founding + franchise milestones
    if (c.character) SIG.lookup(c.character).forEach(function (e) { add(e.year, e.reason); });   // first appearance + character milestones
    out.sort(function (a, b) { return a.mint - b.mint; });
    return out;
  }
  function sigSection(c) {
    var s = sigMints(c); if (!s.length) return '';
    return '<div class="sec-h">🎯 Historically significant mints</div>' +
      '<p class="small" style="margin:-6px 0 12px">The edition whose <strong>mint number</strong> matches a milestone year — a prized pickup. Only years that fit inside this item\'s edition of ' + c.edition.toLocaleString() + ' are shown.</p>' +
      '<div class="notable">' + s.map(function (m) {
        return '<div class="notecard" style="cursor:default"><div class="nthumb noimg" style="font-size:15px;font-weight:800">#' + m.mint + '</div><div class="ninfo"><div class="nn">Mint #' + m.mint.toLocaleString() + '</div><div class="nw">' + esc(m.reason) + '</div></div></div>';
      }).join('') + '</div>';
  }
  function collectible(slug) {
    var c = bySlug[slug]; if (!c) return notfound('“' + slug + '”');
    var w = W.coll[slug] || {}, co = cost(c), entSlug = c.character && charToEnt[nn(c.character)];
    var reserve = (c.lowmint && c.lowmint > 1) ? (c.lowmint - 1) : 0;
    var facts = [];
    if (c.universe) facts.push(['Universe', '<a onclick="' + href('u/' + c.universe) + '">' + esc(cap(c.universe)) + '</a>']);
    if (c.character) facts.push(['Character', entSlug ? '<a onclick="' + href('e/' + entSlug) + '">' + esc(c.character) + '</a>' : esc(c.character)]);
    if (c.set) facts.push(['Set', '<a onclick="' + href('set/' + encodeURIComponent(c.set)) + '">' + esc(c.set) + '</a>']);
    if (c.season) facts.push(['Season', '<a onclick="' + href('season/' + c.season) + '">Season ' + c.season + (SM[c.season] ? ' (~' + SM[c.season].year + ')' : '') + '</a>']);
    facts.push(['Rarity', '<span class="' + rClass(c.rarity) + '">' + (c.rarity || '?') + '</span>' + (c.fe ? ' · First Edition' : '') + (c.sp ? ' · ✨ special edition' : '')]);
    if (c.edition) facts.push(['Edition size', c.edition.toLocaleString()]);
    if (c.drop) facts.push(['Dropped', c.drop]);
    if (co) facts.push(['Market floor', '💎 ' + Math.round(co.v).toLocaleString() + ' <span class="small">(' + co.s + ')</span>']);
    if (c.lowmint) facts.push(['Lowest public mint', '#' + c.lowmint + (reserve ? ' <span class="small">(VeVe reserves #1–#' + reserve + ')</span>' : '')]);
    if (c.held) facts.push(['Held back (total)', c.held.toLocaleString() + ' <span class="small">(reserve + random, per VeVe)</span>']);
    if (c.blind) facts.push(['Distribution', '🎲 Blind box <span class="small">(random pull — no fixed store price)</span>']);
    else if (c.store) facts.push(['Unsold in Store', c.store.toLocaleString()]);
    if (c.burnt) facts.push(['Burnt', c.burnt.toLocaleString()]);
    if (c.circ) facts.push(['In circulation', c.circ.toLocaleString() + ' <span class="small">(in collectors\' hands)</span>']);

    var related = (c.character ? (byChar[nn(c.character)] || []) : (c.set ? bySet[c.set] : byUni[c.universe] || [])).filter(function (x) { return x.slug !== slug; });
    var moreSet = c.set ? (bySet[c.set] || []).filter(function (x) { return x.slug !== slug; }) : [];
    var subSlug = subOf[slug], subCr = (subSlug && subSlug !== 'other') ? [{ t: subLabel(c.universe, subSlug), r: 'sub/' + c.universe + '/' + subSlug }] : [];

    view.innerHTML = crumb([{ t: 'Explorer', r: '' }].concat(c.universe ? [{ t: cap(c.universe), r: 'u/' + c.universe }] : []).concat(subCr).concat(c.set ? [{ t: c.set, r: 'set/' + encodeURIComponent(c.set) }] : []).concat([{ t: c.name }])) +
      '<div class="cpage"><div>' + thumb(c, 'hero-img') + '</div><div>' +
      '<h1>' + esc(c.name) + '</h1>' +
      '<dl class="facts">' + facts.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd>'; }).join('') + '</dl>' +
      buyRow(c) +
      (w.ov ? '<div class="prose">' + esc(w.ov) + '</div>' : '') +
      (w.ab ? '<div class="prose"><h4>About</h4>' + esc(w.ab) + '</div>' : '') +
      '</div></div>' +
      sigSection(c) +
      (moreSet.length ? '<div class="sec-h">More in “' + esc(c.set) + '”</div>' + grid(moreSet, 24) : '') +
      (related.length && (!c.set || !moreSet.length) ? '<div class="sec-h">More ' + esc(c.character || cap(c.universe)) + '</div>' + grid(related, 24) : '') +
      '<div style="margin-top:22px"><span class="backchip" onclick="history.back()">← Back</span></div>';
  }

  function comic(slug) {
    var rec = comicsBySlug[slug]; if (!rec) return notfound('comic “' + slug + '”');
    var uni = rec._uni, hist = chGet(rec.t, rec.n) || chGet(rec.s, rec.n) || {}, mcp = cmGet(rec), tid = mcp.tid;
    var covers = rec.r || [];
    var facts = [];
    if (uni) facts.push(['Universe', '<a onclick="' + href('u/' + uni) + '">' + esc(cap(uni)) + '</a>']);
    facts.push(['Series', esc(rec.s || '?')]);
    facts.push(['Issue', '#' + esc(String(rec.n))]);
    if (rec.y) facts.push(['Published', esc(String(rec.y)) + (rec.a ? ' <span class="small">· ' + esc(rec.a) + ' age</span>' : '')]);
    if (rec.l) facts.push(['Publisher', esc(rec.l)]);
    if (rec.e) facts.push(['Edition (per cover)', (+rec.e).toLocaleString()]);
    if (rec.d) facts.push(['Dropped on VeVe', esc(rec.d)]);
    if (rec.fa) facts.push(['Key issue', '🔑 First appearance']);
    var covRows = covers.map(function (r) {
      var cc = (mcp.cov || {})[r] || {}, ed = cc.e || rec.e;
      return '<dt><span class="' + rClass(r) + '">' + r + '</span></dt><dd>edition ' + (ed ? (+ed).toLocaleString() : '?') + (cc.f ? ' · 💎 ' + cc.f + ' <span class="small">listed floor</span>' : '') + '</dd>';
    }).join('');
    var chars = (hist.ch || []).map(function (ch) { var es = charToEnt[nn(ch)]; return es ? '<span class="tag" onclick="' + href('e/' + es) + '">' + esc(ch) + '</span>' : '<span class="tag" style="cursor:default;opacity:.7">' + esc(ch) + '</span>'; });
    var creators = hist.c || [];
    var series = (comicsBySeries[rec.s] || []).filter(function (x) { return x._slug !== slug; }).sort(comicSort);
    var veve = tid ? 'https://www.veve.me/collectibles/en/comics/' + tid : null, st = tid ? 'https://www.stackr.world/collections/veve/comic/' + tid : null;
    var buy = tid ? '<div class="exbuy"><a class="btn" href="' + st + '" target="_blank" rel="noopener">🛒 View on StackR ↗</a><a class="buylink" href="' + veve + '" target="_blank" rel="noopener">also on VeVe ↗</a></div>' : '';
    view.innerHTML = crumb([{ t: 'Explorer', r: '' }].concat(uni ? [{ t: cap(uni), r: 'u/' + uni }] : []).concat([{ t: rec.t + ' #' + rec.n }])) +
      '<h1>📖 ' + esc(rec.t) + ' #' + esc(String(rec.n)) + '</h1>' +
      '<dl class="facts">' + facts.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd>'; }).join('') + '</dl>' +
      buy +
      '<div class="sec-h">Covers <span class="small">(' + covers.length + ' — a full cover-set)</span></div><dl class="facts">' + covRows + '</dl>' +
      (creators.length ? '<div class="sec-h">Creators</div><p class="prose">' + creators.map(esc).join(' · ') + '</p>' : '') +
      (chars.length ? '<div class="sec-h">Characters</div><div class="tagrow">' + chars.join('') + '</div>' : '') +
      '<div class="prose" style="margin-top:14px"><em># TODO — synopsis / significance in a later research pass.</em></div>' +
      (series.length ? '<div class="sec-h">More in “' + esc(rec.s) + '”</div>' + comicGrid(series, 24) : '') +
      '<div style="margin-top:22px"><span class="backchip" onclick="history.back()">← Back</span></div>';
  }

  function search(q) {
    var s = sq(q); if (s.length < 2) { view.innerHTML = '<p class="small">Type at least 2 characters.</p>'; return; }
    var unis = uniList.filter(function (u) { return sq(cap(u)).indexOf(s) >= 0; });
    var ents = Object.keys(W.ent).filter(function (k) { return sq(W.ent[k].t).indexOf(s) >= 0; }).slice(0, 30);
    var items = C.filter(function (c) { return sq(c.name).indexOf(s) >= 0 || sq(c.character).indexOf(s) >= 0; });
    var comics = COMICS.filter(function (r) { return sq(r.t + ' ' + r.s).indexOf(s) >= 0; });
    view.innerHTML = crumb([{ t: 'Explorer', r: '' }, { t: 'Search: ' + q }]) +
      (unis.length ? '<div class="sec-h">Universes</div><div class="tagrow">' + unis.map(function (u) { return '<span class="tag" onclick="' + href('u/' + u) + '">' + esc(cap(u)) + ' (' + byUni[u].length + ')</span>'; }).join('') + '</div>' : '') +
      (ents.length ? '<div class="sec-h">Characters</div><div class="tagrow">' + ents.map(function (k) { return '<span class="tag" onclick="' + href('e/' + k) + '">' + esc(W.ent[k].t) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="sec-h">Collectibles <span class="small">(' + items.length.toLocaleString() + ')</span></div>' + (items.length ? mainGrid(items, 120) : '<p class="small">No collectibles match “' + esc(q) + '”.</p>') +
      (comics.length ? '<div class="sec-h">📖 Comics <span class="small">(' + comics.length.toLocaleString() + ')</span></div>' + comicGrid(comics.slice().sort(comicSort), 60) : '');
  }

  function notfound(what) { view.innerHTML = '<div class="note">Nothing found for ' + esc(what) + '. <a onclick="' + href('') + '">Back to Explorer</a>.</div>'; }

  // collection slug from a set name (matches gen_wiki_explorer slugging)
  function slugForCollection(name) { var s = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return W.col[s] ? s : null; }

  // ---- router ----
  function route() {
    var h = (location.hash || '').replace(/^#\/?/, ''), p = h.split('/'), t = p[0], id = decodeURIComponent(p.slice(1).join('/') || '');
    window.scrollTo(0, 0);
    if (t === 'c') collectible(id);
    else if (t === 'comic') comic(id);
    else if (t === 'u') universe(id);
    else if (t === 'sub') { var pp = id.split('/'); subPage(pp[0], pp.slice(1).join('/')); }
    else if (t === 'e') entity(id);
    else if (t === 'set') setPage(id);
    else if (t === 'season') seasonPage(id);
    else if (t === 'q') { $('#q').value = id; search(id); }
    else home();
  }
  window.addEventListener('hashchange', route);

  var timer;
  $('#q').addEventListener('input', function () { clearTimeout(timer); var v = this.value.trim(); timer = setTimeout(function () { if (v.length >= 2) nav('q/' + encodeURIComponent(v)); else if (!v) nav(''); }, 220); });

  route();
})();
