/* StackR Analytics — Items view: "what does it REALLY sell for?"  (#/item and #/item/<slug>) */
(function () {
  'use strict';
  var AN = window.AN, A = AN.A, esc = AN.esc, money = AN.money;

  function landing(root) {
    var traded = AN.items.filter(function (c) { return c._a && c._a.n30 > 0; });
    var top = traded.slice().sort(function (a, b) { return b._a.n30 - a._a.n30; }).slice(0, 10);
    var gaps = traded.map(function (c) { return { c: c, g: AN.gap(c) }; })
      .filter(function (x) { return x.g != null && x.g > 25; }).sort(function (a, b) { return b.g - a.g; }).slice(0, 10);
    root.innerHTML =
      '<section class="an-hero"><h1>What is it <span>really worth?</span></h1>' +
      '<p>Search any collectible above. You get what it <strong>actually sells for</strong> — the median of real sales on VeVe, StackR and auctions — next to what sellers are <em>asking</em>. Those two numbers are often far apart.</p></section>' +
      '<div class="an-grid c2"><div class="an-card"><h3>Most traded · last 30 days</h3>' +
      top.map(function (c) { return AN.itemRow(c, '<b>' + money(c._a.t30) + '</b><small>' + c._a.n30 + ' sales</small>'); }).join('') + '</div>' +
      '<div class="an-card"><h3>Asking far more than it sells for</h3>' +
      gaps.map(function (x) { var k = AN.asks(x.c), s = AN.venues(x.c)[k.best.venue === 'VeVe' ? 'veve' : 'stackr']; return AN.itemRow(x.c, '<b>' + money(s.med) + '</b><small>ask ' + money(k.best.usd) + ' · ' + AN.pct(x.g, 0) + '</small>', esc(AN.uname(x.c.universe)) + ' · ' + k.best.venue + ': sells vs cheapest ask'); }).join('') +
      AN.note('Even the cheapest listing sits far above what the item sells for on that same venue (3+ sales there in 30 days). The listing price is not the market.') + '</div></div>';
  }

  function detail(root, c) {
    var a = c._a, v = AN.value(c), k = AN.asks(c), vn = AN.venues(c), blind = !!c.blind;
    var chips = [c.rarity, AN.uname(c.universe), c.drop ? 'Dropped ' + c.drop : '', c.edition ? AN.num(c.edition) + ' editions' : ''].filter(Boolean).map(function (t) { return AN.chip(t); }).join('');
    var h = '<div class="an-itemhead">' + AN.thumb(c, 112) + '<div style="flex:1;min-width:220px"><h1>' + esc(c.name) + '</h1><div class="an-chips">' + chips + '</div>' +
      '<div class="an-chips" style="margin-top:10px"><a class="an-chip acc" href="wiki.html#/collectibles/' + encodeURIComponent(c.slug) + '">📖 wiki page</a>' +
      '<a class="an-chip acc" href="https://stackr.world/collections/veve/collectible/' + encodeURIComponent(c.tid) + '" rel="noopener">🛒 live listings</a>' +
      '<button class="an-chip acc" id="it-watch" type="button" style="cursor:pointer;background:none">' + (AN.isWatched && AN.isWatched(c.tid) ? '★ Watching' : '☆ Watch') + '</button></div></div></div>';

    // hero figure — exactly one per view
    h += '<div class="an-grid c23" style="margin-top:18px"><div class="an-card"><div class="an-biglab">' + (v.basis === 'last' ? 'Last sold for' : 'Typically sells for') + '</div>' +
      '<div class="an-big">' + (v.v ? money(v.v) : '—') + '</div>' +
      '<div class="an-chips" style="margin-top:10px">' + (a && a.c30 != null ? AN.delta(a.c30, 'vs the 30 days before') : '') +
      (v.basis === 'traded' && v.thin ? AN.chip('thin market — few sales', 'warn') : '') + (v.basis === 'last' ? AN.chip('no sale in 30 days', 'warn') : '') + '</div>' +
      '<div class="an-basis">' + esc(v.how.charAt(0).toUpperCase() + v.how.slice(1)) + '. Both venues and auctions; one-off premium-mint prints are excluded from this figure.</div>' +
      ((vn.veve.n || vn.stackr.n) ? '<div class="an-chips" style="margin-top:10px">' +
        (vn.veve.n ? '<span class="an-chip">' + AN.venueDot(0) + ' sells for <b style="color:var(--text);margin-left:4px">' + money(vn.veve.med) + '</b>&nbsp;· ' + vn.veve.n + ' sales</span>' : '') +
        (vn.stackr.n ? '<span class="an-chip">' + AN.venueDot(1) + ' sells for <b style="color:var(--text);margin-left:4px">' + money(vn.stackr.med) + '</b>&nbsp;· ' + vn.stackr.n + ' sales</span>' : '') +
        '</div>' : '') + '</div>';

    // ask vs real sales, LIKE FOR LIKE: each venue's cheapest ask against that venue's own sales.
    // Emphasis: sales are the point (accent), asks are context (gray).
    var rows = [], lines = [];
    [['veve', 'VeVe', k.veve, 0], ['stackr', 'StackR', k.stackr, 1]].forEach(function (x) {
      var s = vn[x[0]];
      if (s.n) rows.push({ label: x[1] + ' sales', value: s.med, color: AN.venue(x[3]).color });
      if (x[2]) rows.push({ label: x[1] + ' ask', value: x[2] });
      var gp = AN.likeGap(c, x[0]);
      if (gp == null) { if (x[2] && !s.n) lines.push(x[1] + ': listed at ' + money(x[2]) + ', but no sale there in 30 days to judge it.'); return; }
      lines.push(x[1] + ': cheapest ask ' + (gp > 10 ? '<strong>' + Math.round(gp) + '% above</strong> what it sells for there.' : gp < -10 ? '<strong>' + Math.round(-gp) + '% below</strong> what it sells for there — worth a look.' : 'in line with sales there.'));
    });
    if (!rows.length && v.v) rows.push({ label: v.basis === 'last' ? 'Last sale' : 'Typical sale', value: v.v, acc: true });
    var verdict = !k.best ? 'No live listing on either venue right now.' : (lines.join('<br>') || 'Too few recent sales on either venue to judge the listings.');
    if (vn.veve.n >= 3 && vn.stackr.n >= 3) verdict += '<br><span style="color:var(--muted)">Same item, two prices: StackR (paid in OMI) is at ' + (vn.stackr.med / vn.veve.med).toFixed(2) + '× the VeVe gem-market price.</span>';
    if (k.troll) verdict += '<br><span style="color:var(--muted)">A vanity ask of 💎' + AN.num(k.troll) + ' on VeVe was ignored.</span>';
    h += '<div class="an-card"><h3>Asking price vs. real sales</h3>' + (rows.length ? AN.compare(rows) + '<p class="an-basis" style="margin-top:8px">Sales = 30-day median on that venue · ask = cheapest live listing (gray).</p>' : '<div class="an-empty">No sale and no listing.</div>') +
      '<p style="font-size:13px;line-height:1.5;margin:12px 0 0">' + verdict + '</p>' +
      (k.listings ? '<p class="an-basis" style="margin-top:6px">' + AN.num(k.listings) + ' live StackR listing' + (k.listings === 1 ? '' : 's') + (k.omi ? ' from ' + AN.num(k.omi) + ' OMI' : '') + '.</p>' : '') + '</div></div>';

    // stat row
    var last = a && a.l && a.l[0];
    h += '<div class="an-kpis" style="margin-top:14px">' +
      AN.kpi('Last sale', last ? money(last[1]) : (a && a.last ? money(a.last[1]) : '—'), last ? esc(AN.ago(last[0])) + ' · ' + AN.venueDot(last[2]) : (a && a.last ? esc(AN.daysAgo(a.last[0])) : 'none recorded')) +
      AN.kpi('Sales', a ? AN.num(a.n30) : '0', a ? 'in 30 days · ' + AN.num(a.n7) + ' in 7 · ' + AN.num(a.n90) + ' in 90' : 'since July 2025') +
      AN.kpi('Traded volume', a ? money(a.v30) : '—', 'last 30 days') +
      AN.kpi('Record sale', a && a.hi ? money(a.hi[0]) : '—', a && a.hi ? esc(a.hi[1]) + ' · includes premium mints' : '') +
      ((!blind && c.price > 0 && v.v) ? AN.kpi('Since the drop', AN.delta((v.v / c.price - 1) * 100), 'drop price 💎' + AN.num(c.price) + (c.drop ? ' · ' + esc(c.drop) : '')) : '') + '</div>';

    // price history
    h += AN.h('Price history', 'typical sale price per period — gaps mean no trades, the line is never interpolated') +
      '<div class="an-card"><div class="an-charthead"><div class="an-seg" id="it-seg"><button type="button" data-w="w" class="on">13 weeks</button><button type="button" data-w="m">Since Jul 2025</button></div></div><div id="it-chart"></div></div>';

    // last sales + scarcity
    var sales = (a && a.l) || [];
    h += '<div class="an-grid c23" style="margin-top:14px"><div class="an-card"><h3>Latest sales</h3>' + (sales.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>When</th><th>Venue</th><th class="n">Price</th><th class="n">vs typical</th></tr></thead><tbody>' +
      sales.map(function (s) { return '<tr><td title="' + esc(new Date(s[0] * 1000).toISOString().slice(0, 16).replace('T', ' ')) + ' UTC">' + esc(AN.ago(s[0])) + '</td><td>' + AN.venueDot(s[2]) + '</td><td class="n"><b>' + money(s[1]) + '</b></td><td class="n">' + (a.t30 ? AN.delta((s[1] / a.t30 - 1) * 100) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="an-empty">No sale in the last 90 days.</div>') +
      AN.note('Sales carry no mint number in the public trade record, so a premium mint shows up here as a price far above typical.') + '</div>';
    var sc = [['Edition size', c.edition], ['In collectors’ hands', c.circ], ['Burnt', c.burnt], ['Held back by VeVe', c.held]];
    if (!blind) sc.push(['Unsold in the store', c.store]);
    sc = sc.filter(function (r) { return r[1] > 0; });
    h += '<div class="an-card"><h3>Scarcity</h3>' + (sc.length ? '<table class="an-table"><tbody>' + sc.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="n"><b>' + AN.num(r[1]) + '</b></td></tr>'; }).join('') + '</tbody></table>' : '<div class="an-empty">No supply data.</div>') +
      (c.lowmint ? '<p class="an-basis">Lowest public mint: #' + AN.num(c.lowmint) + '.</p>' : '') + '</div></div>';

    // special mints listed right now
    var sp = ((window.SPECIAL_LISTINGS && window.SPECIAL_LISTINGS.items) || []).filter(function (s) { return s.tid === c.tid; }).sort(function (x, y) { return (x.usd || 0) - (y.usd || 0); }).slice(0, 6);
    if (sp.length) {
      h += AN.h('Special mints listed right now', 'a premium mint costs more than a floor copy — compare with the typical sale') + '<div class="an-card"><div class="an-scroll"><table class="an-table"><thead><tr><th>Mint</th><th>Why it is special</th><th>Venue</th><th class="n">Ask</th><th class="n">vs typical</th></tr></thead><tbody>' +
        sp.map(function (s) { return '<tr><td><b>#' + AN.num(s.mint) + '</b></td><td>' + esc(s.label || '') + '</td><td>' + AN.venueDot((s.market || '').toUpperCase() === 'VEVE' ? 0 : 1) + '</td><td class="n"><b>' + money(s.usd) + '</b></td><td class="n">' + (v.v ? AN.delta((s.usd / v.v - 1) * 100) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    }
    root.innerHTML = h;

    function chart(mode) {
      var pts;
      if (mode === 'm') {
        var mm = a ? a.m.slice() : [], off = 0; while (off < mm.length - 1 && !(mm[off] > 0)) off++;   // start at the first traded month
        pts = mm.slice(off).map(function (y, i) { var ym = A.months[i + off] || '', cur = i + off === A.months.length - 1; return { x: ym, xl: ym + (cur ? ' (month to date)' : ''), y: y }; });
      }
      else pts = (a ? a.w : []).map(function (y, i) { var end = new Date((A.asOf - 7 * 86400 * (12 - i)) * 1000); var lab = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); return { x: lab, xl: 'week to ' + lab, y: y }; });
      AN.lineChart(document.getElementById('it-chart'), { pts: pts, name: 'Typical sale price', h: 240 });
    }
    chart('w');
    var wb = document.getElementById('it-watch');
    if (wb && AN.toggleWatch) wb.addEventListener('click', function () { var on = AN.toggleWatch(c.tid); wb.textContent = on ? '★ Watching' : '☆ Watch'; });
    document.getElementById('it-seg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); chart(b.getAttribute('data-w')); });
  }

  AN.view('item', { title: 'Items', render: function (root, params) {
    var c = params[0] ? AN.bySlug[params[0]] : null;
    if (params[0] && !c) { root.innerHTML = '<div class="an-empty">That collectible is not in the catalog. Try the search above.</div>'; return; }
    if (c) { document.title = c.name + ' — StackR Analytics (concept)'; detail(root, c); } else landing(root);
  } });
})();
