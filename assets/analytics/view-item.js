/* StackR Analytics — Items view: "what does it REALLY sell for?"  (#/item and #/item/<slug>) */
(function () {
  'use strict';
  var AN = window.AN, A = AN.A, esc = AN.esc, money = AN.money;

  function landing(root) {
    var traded = AN.items.filter(function (c) { return c._a && c._a.n30 > 0; });
    var top = traded.slice().sort(function (a, b) { return b._a.n30 - a._a.n30; }).slice(0, 10);
    var over = traded.map(function (c) { var k = AN.asks(c); return { c: c, k: k, x: k.best ? AN.likeGapInfo(c, k.best.key, 5) : null }; })
      .filter(function (o) { return o.x && o.x.gap > 25; }).sort(function (a, b) { return b.x.gap - a.x.gap; }).slice(0, 10);
    root.innerHTML =
      '<section class="an-hero"><h1>What is it <span>really worth?</span></h1>' +
      '<p>Search any collectible above. You get what it <strong>actually sells for</strong> — the median of real sales — next to what sellers are <em>asking</em>, venue by venue. The two are often far apart.</p></section>' +
      '<div class="an-grid c2"><div class="an-card"><h3>Most traded · last 30 days</h3>' +
      top.map(function (c) { var v = AN.value(c); return AN.itemRow(c, '<b>' + money(v.v) + '</b><small>' + c._a.n30 + ' sales</small>'); }).join('') + '</div>' +
      '<div class="an-card"><h3>Even the cheapest listing is far above the market</h3>' +
      (over.length ? over.map(function (o) {
        var f = o.x.basis === 'omi' ? AN.omi : money;
        return AN.itemRow(o.c, '<b>' + AN.pct(o.x.gap, 0) + '</b><small>ask ' + f(o.x.ask) + ' · sells ' + f(o.x.ref) + '</small>', esc(AN.uname(o.c.universe)) + ' · on ' + o.k.best.venue);
      }).join('') : '<div class="an-empty">No item is listed far above its own market right now.</div>') +
      AN.note('The cheapest live listing compared with what the item sells for on that same venue (5+ sales there in 30 days; StackR compared in OMI). A listing price is not the market.') + '</div></div>';
  }

  function detail(root, c) {
    var a = c._a, v = AN.value(c), k = AN.asks(c), vn = AN.venues(c), blind = !!c.blind, SL = A.market || {};
    var watched = AN.isWatched && AN.isWatched(c.tid);
    var chips = [c.rarity, AN.uname(c.universe), c.drop ? 'Dropped ' + c.drop : '', c.edition ? AN.num(c.edition) + ' editions' : ''].filter(Boolean).map(function (t) { return AN.chip(t); }).join('');
    var h = '<div class="an-itemhead">' + AN.thumb(c, 112) + '<div style="flex:1;min-width:220px"><h1>' + esc(c.name) + '</h1><div class="an-chips">' + chips + '</div>' +
      '<div class="an-chips" style="margin-top:10px"><a class="an-chip acc" href="wiki.html#/collectibles/' + encodeURIComponent(c.slug) + '">📖 wiki page</a>' +
      '<a class="an-chip acc" href="https://stackr.world/collections/veve/collectible/' + encodeURIComponent(c.tid) + '" rel="noopener">🛒 live listings</a>' +
      '<button class="an-chip acc an-chipbtn" id="it-watch" type="button" aria-pressed="' + !!watched + '">' + (watched ? '★ Watching' : '☆ Watch') + '</button></div></div></div>';

    // hero — exactly one figure per view
    var cb = a && a.cb ? (a.cb === 'veve+stackr' ? 'within each venue' : 'on ' + (a.cb === 'veve' ? 'VeVe' : 'StackR')) : '';
    h += '<div class="an-grid c23" style="margin-top:18px"><div class="an-card"><div class="an-biglab">' + (v.basis === 'last' ? 'Last sold for' : 'Typically sells for') + '</div>' +
      '<div class="an-big">' + (v.v ? money(v.v) : '—') + '</div>' +
      '<div class="an-chips" style="margin-top:10px">' + (a && a.c30 != null ? AN.delta(a.c30, 'vs the 30 days before, ' + cb) : '') +
      (v.basis === 'traded' && v.thin ? AN.chip('thin market — few sales', 'warn') : '') + (v.basis === 'last' ? AN.chip('no sale in 30 days', 'warn') : '') + '</div>' +
      '<div class="an-basis">' + esc(v.how.charAt(0).toUpperCase() + v.how.slice(1)) + ', all venues. Premium-mint prints (a #1, a far-above-normal one-off) are left out of this figure and kept as records.</div>' +
      ((vn.veve.n || vn.stackr.n) ? '<div class="an-chips" style="margin-top:10px">' +
        (vn.veve.n ? '<span class="an-chip">' + AN.venueDot(0) + '&nbsp;sells for <b style="color:var(--text);margin-left:4px">' + money(vn.veve.med) + '</b>&nbsp;· ' + vn.veve.n + ' sales</span>' : '') +
        (vn.stackr.n ? '<span class="an-chip">' + AN.venueDot(1) + '&nbsp;sells for <b style="color:var(--text);margin-left:4px">' + money(vn.stackr.med) + '</b>' + (vn.stackr.omi ? '&nbsp;(' + AN.omi(vn.stackr.omi) + ')' : '') + '&nbsp;· ' + vn.stackr.n + ' sales</span>' : '') +
        '</div>' : '') + '</div>';

    // ask vs sales, like for like (StackR verdict in OMI)
    var rows = [], lines = [];
    [['veve', 'VeVe', k.veve, 0], ['stackr', 'StackR', k.stackr, 1]].forEach(function (x) {
      var s = vn[x[0]];
      if (s.n) rows.push({ label: x[1] + ' sales', value: s.med, color: AN.venue(x[3]).color });
      if (x[2]) rows.push({ label: x[1] + ' ask', value: x[2] });
      var gi = AN.likeGapInfo(c, x[0]);
      if (!gi) { if (x[2]) lines.push(x[1] + ': listed at ' + money(x[2]) + ', but too few sales there in 30 days to judge it.'); return; }
      var f = gi.basis === 'omi' ? AN.omi : money, g = gi.gap;
      lines.push(x[1] + ': cheapest ask ' + f(gi.ask) + ' vs ' + f(gi.ref) + ' typical — ' + (g > 10 ? '<strong>' + Math.round(g) + '% above</strong>.' : g < -10 ? '<strong>' + Math.round(-g) + '% below</strong>, worth a look.' : 'in line.'));
    });
    var verdict = !k.best ? 'No live listing on either venue right now.' : (lines.join('<br>') || 'Too few recent sales on either venue to judge the listings.');
    if (vn.veve.n >= 3 && vn.stackr.n >= 3) verdict += '<br><span style="color:var(--muted)">Same item, two prices: on StackR it sells at ' + (vn.stackr.med / vn.veve.med).toFixed(2) + '× its VeVe price.</span>';
    if (k.troll) verdict += '<br><span style="color:var(--muted)">A vanity ask of 💎' + AN.num(k.troll) + ' on VeVe was ignored.</span>';
    h += '<div class="an-card"><h3>Asking price vs. real sales</h3>' + (rows.length ? AN.compare(rows) + '<p class="an-basis" style="margin-top:8px">Sales = 30-day median on that venue · ask = cheapest live listing (gray). StackR is judged in OMI, so OMI’s own price moves don’t count as a bargain.</p>' : '<div class="an-empty">No sale and no listing.</div>') +
      '<p style="font-size:13px;line-height:1.55;margin:10px 0 0">' + verdict + '</p></div></div>';

    // stat row
    var last = a && a.l && a.l[0];
    h += '<div class="an-kpis" style="margin-top:14px">' +
      AN.kpi('Last sale', last ? money(last[1]) : (a && a.last ? money(a.last[1]) : '—'), last ? esc(AN.ago(last[0])) + ' · ' + AN.venueDot(last[2]) : (a && a.last ? esc(AN.daysAgo(a.last[0])) : 'none recorded')) +
      AN.kpi('Sales', a ? AN.num(a.n30) : '0', a ? 'in 30 days · ' + AN.num(a.n7) + ' in 7 · ' + AN.num(a.n90) + ' in 90' : 'since July 2025') +
      AN.kpi('Traded volume', a ? money(a.v30) : '—', 'last 30 days') +
      AN.kpi('Record sale', a && a.hi ? money(a.hi[0]) : '—', a && a.hi ? esc(a.hi[1]) + ' · premium mints included' : '') +
      ((!blind && c.price > 0 && v.v) ? AN.kpi('Since the drop', AN.delta((v.v / c.price - 1) * 100), 'drop price 💎' + AN.num(c.price) + (c.drop ? ' · ' + esc(c.drop) : '')) : '') + '</div>';

    h += AN.h('Price history', 'typical sale price · gaps mean no trades, lines are never interpolated') +
      '<div class="an-card"><div class="an-charthead"><div class="an-seg" id="it-seg" role="group" aria-label="Time range"><button type="button" data-w="w" class="on" aria-pressed="true">13 weeks · by venue</button><button type="button" data-w="m" aria-pressed="false">Since Jul 2025 · all venues</button></div></div><div id="it-chart"></div></div>';

    // latest sales — each judged against its own venue
    var sales = (a && a.l) || [];
    function venueMed(code) { var s = code === 0 ? vn.veve : code === 1 ? vn.stackr : null; return s && s.n >= 3 ? s.med : 0; }
    function vsTypical(price, m) { if (!m) return '—'; var r = price / m; return r >= 3 ? '<span class="an-d up">' + (r >= 10 ? Math.round(r) : r.toFixed(1)) + '× typical</span>' : AN.delta((r - 1) * 100); }
    h += '<div class="an-grid c23" style="margin-top:14px"><div class="an-card"><h3>Latest sales</h3>' + (sales.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>When</th><th>Venue</th><th class="n">Price</th><th class="n">vs typical there</th></tr></thead><tbody>' +
      sales.map(function (s) { var m = venueMed(s[2]); return '<tr><td title="' + esc(new Date(s[0] * 1000).toISOString().slice(0, 16).replace('T', ' ')) + ' UTC">' + esc(AN.ago(s[0])) + '</td><td>' + AN.venueDot(s[2]) + '</td><td class="n"><b>' + money(s[1]) + '</b></td><td class="n">' + vsTypical(s[1], m) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="an-empty">No sale in the last 90 days.</div>') +
      AN.note('The public trade record carries no mint number, so a premium mint shows up here as a price far above typical.') + '</div>';
    var sc = [['Edition size', c.edition], ['In collectors’ hands', c.circ], ['Burnt', c.burnt], ['Held back by VeVe', c.held]];
    if (!blind) sc.push(['Unsold in the store', c.store]);
    sc = sc.filter(function (r) { return r[1] > 0; });
    h += '<div class="an-card"><h3>Scarcity</h3>' + (sc.length ? '<table class="an-table"><tbody>' + sc.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="n"><b>' + AN.num(r[1]) + '</b></td></tr>'; }).join('') + '</tbody></table>' : '<div class="an-empty">No supply data.</div>') +
      (c.lowmint ? '<p class="an-basis">Lowest public mint: #' + AN.num(c.lowmint) + '.</p>' : '') + '</div></div>';

    // special mints listed now (handle-free; VeVe rows only while that feed is fresh)
    var sp = AN.specials().filter(function (s) { return s.c === c; }).sort(function (x, y) { return x.usd - y.usd; }).slice(0, 6);
    if (sp.length) {
      h += AN.h('Special mints listed right now', 'a premium mint costs more than a floor copy — compared with ordinary sales on the same venue') + '<div class="an-card"><div class="an-scroll"><table class="an-table"><thead><tr><th>Mint</th><th>Why it is special</th><th>Venue</th><th class="n">Ask</th><th class="n">vs typical there</th></tr></thead><tbody>' +
        sp.map(function (s) { var m = venueMed(s.code); return '<tr><td><b>#' + AN.num(s.mint) + '</b></td><td>' + esc(s.label) + '</td><td>' + AN.venueDot(s.code) + '</td><td class="n"><b>' + money(s.usd) + '</b></td><td class="n">' + vsTypical(s.usd, m) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        (!SL.veveListingsFresh ? AN.note('VeVe-market listings are not shown: that feed is currently stale.') : '') + '</div>';
    }
    root.innerHTML = h;

    function chart(mode) {
      var host = document.getElementById('it-chart');
      if (mode === 'm') {
        var mm = a ? a.m.slice() : [], off = 0; while (off < mm.length - 1 && !(mm[off] > 0)) off++;
        var xs = mm.slice(off).map(function (y, i) { var ym = A.months[i + off] || ''; return { x: ym, xl: ym + (i + off === A.months.length - 1 ? ' (month to date)' : '') }; });
        AN.lineChart(host, { x: xs, series: [{ name: 'Typical sale, all venues', color: AN.COLORS.blended, ys: mm.slice(off) }], h: 240 });
      } else {
        var wv = (a && a.wv) || [[], []], E = A.weekEdges || [], st = 0;
        while (st < 12 && !(wv[0][st] > 0) && !(wv[1][st] > 0)) st++;            // start at the first traded week
        var xw = []; for (var i = st; i < 13; i++) { var end = new Date(((E[i + 1] || A.asOf) - 1) * 1000), lab = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); xw.push({ x: lab, xl: 'week to ' + lab + (i === 12 ? ' (so far)' : '') }); }
        AN.lineChart(host, { x: xw, series: [{ name: 'VeVe', color: AN.COLORS.veve, ys: (wv[0] || []).slice(st) }, { name: 'StackR', color: AN.COLORS.stackr, ys: (wv[1] || []).slice(st) }], h: 240 });
      }
    }
    chart('w');
    document.getElementById('it-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      chart(b.getAttribute('data-w'));
    });
    var wb = document.getElementById('it-watch');
    if (wb && AN.toggleWatch) wb.addEventListener('click', function () { var on = AN.toggleWatch(c.tid); wb.textContent = on ? '★ Watching' : '☆ Watch'; wb.setAttribute('aria-pressed', String(on)); });
  }

  AN.view('item', { title: 'Items', render: function (root, params) {
    var c = params[0] ? AN.bySlug[params[0]] : null;
    if (params[0] && !c) { root.innerHTML = '<div class="an-empty">That collectible is not in the catalog. Try the search above.</div>'; return; }
    if (c) { document.title = c.name + ' — StackR Analytics (concept)'; detail(root, c); } else landing(root);
  } });
})();
