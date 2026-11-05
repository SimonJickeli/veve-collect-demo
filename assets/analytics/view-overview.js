/* StackR Analytics — Market overview (#/overview): the whole VeVe market, in real sales. */
(function () {
  'use strict';
  var AN = window.AN, A = AN.A, esc = AN.esc, money = AN.money;
  AN.view('overview', { title: 'Market', render: function (root) {
    var M = window.MARKETCAP || { rows: [], total: {} }, T = M.total || {}, mk = A.market || {}, daily = mk.daily || [];
    var F = AN.facts(), VG = F.venueGap, LQ = F.liquidity || {}, OMI = F.omi || {};
    function sum(arr, k) { return arr.reduce(function (s, d) { return s + (d[k] || 0); }, 0); }
    var full = mk.partialDay ? daily.slice(0, -1) : daily;                // compare complete days only
    var w1 = full.slice(-7), w0 = full.slice(-14, -7), s1 = sum(w1, 1), s0 = sum(w0, 1), v1 = sum(w1, 2), v0 = sum(w0, 2);
    var vs = mk.venue30 || {}, au = mk.auction || {};

    var h = '<section class="an-hero"><h1>The VeVe market, <span>in real sales</span></h1>' +
      '<p>Prices on this page come from completed trades on the VeVe gem market, StackR and auctions, not from what sellers are asking. Asks appear only where they are labelled as asks — the one exception, for thinly traded items, is spelled out under the market value.</p></section>';

    // hero figure + venue mix
    var newBits = (T.drop7 ? AN.chip('+' + money(T.drop7) + ' from new drops', 'acc') : '') + (T.resumed7 ? AN.chip('+' + money(T.resumed7) + ' from items trading again') : '');
    h += '<div class="an-grid c23"><div class="an-card"><div class="an-biglab">Market value · trade-based</div><div class="an-big">' + money(T.cap) + '</div>' +
      '<div class="an-chips" style="margin-top:10px">' + AN.delta(T.d7, '7 days, same items, all venues') + newBits + '</div>' +
      '<div class="an-basis">Typical traded price × copies in circulation, across ' + AN.num(T.items) + ' catalogued collectibles with a sale in the last 14 days. The 7-day change compares only items counted both times and blends both venues; value that newly counts is shown apart — new drops (by drop date) and older items that sold again after 14+ quiet days. Items with fewer than 3 sales in 30 days are valued at their cheapest live listing when that is lower than their sale price' + (T.clamped ? ' (' + AN.num(T.clamped) + ' items right now; they are left out of the 7-day change)' : '') + '.</div></div>' +
      '<div class="an-card"><h3>Where trades happen · last 30 days</h3>' +
      AN.split([{ label: 'VeVe market', value: vs.fixed || 0, color: AN.COLORS.veve }, { label: 'StackR', value: vs.stackr || 0, color: AN.COLORS.stackr }, { label: 'Auctions', value: vs.auction || 0, color: AN.COLORS.auction }]) +
      '<div id="ov-mix" style="margin-top:12px"></div>' +
      AN.note('StackR’s share of all collectible sales, week by week. When trading moves to Collect, this is the chart that shows the migration as it happens.') + '</div></div>';

    if (VG && VG.n) h += '<div class="an-callout" style="margin-top:14px"><strong>Same collectible, two prices.</strong> On StackR (paid in OMI) an item sells for <strong>' + VG.ratio.toFixed(2) + '×</strong> its price on the VeVe gem market — median of ' + VG.n + ' collectibles with 3+ sales on both in 30 days; for the middle half the ratio is ' + VG.p25.toFixed(2) + '–' + VG.p75.toFixed(2) + '×.' +
      (OMI.chg30 != null ? ' OMI itself moved ' + AN.pct(OMI.chg30, 0) + ' against the dollar in 30 days.' : '') + ' So every ask-versus-sale comparison here is made venue by venue, and StackR in OMI; market-wide totals combine both venues.</div>';

    var spark = full.slice(-28).map(function (d) { return d[1]; }), vspark = full.slice(-28).map(function (d) { return d[2]; });
    h += '<div class="an-kpis" style="margin-top:14px">' +
      AN.kpi('Sales · last 7 days', AN.num(s1), (s0 ? AN.delta((s1 / s0 - 1) * 100, 'vs prior 7 days') : ''), AN.spark(spark, { label: 'daily sales, 4 weeks' })) +
      AN.kpi('Volume · last 7 days', money(v1), (v0 ? AN.delta((v1 / v0 - 1) * 100, 'vs prior 7 days') : ''), AN.spark(vspark, { label: 'daily volume, 4 weeks' })) +
      AN.kpi('Collectibles traded', AN.num(LQ.traded), 'at least one sale in 30 days') +
      AN.kpi('Thinly traded', LQ.traded ? Math.round((LQ.traded - LQ.n5) / LQ.traded * 100) + '%' : '—', 'of them had fewer than 5 sales in 30 days · ' + AN.num(LQ.n1) + ' sold once') + '</div>';

    var narrow = (root.clientWidth || 800) < 640, dd = narrow ? daily.slice(-30) : daily;
    var thru = mk.dataThrough ? new Date(mk.dataThrough * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '';
    h += AN.h('Daily sales', (narrow ? 'last 30 days' : 'last 90 days') + ' · all collectible sales, all venues' + (mk.partialDay ? ' · the last day is incomplete (data through ' + thru + ') and faded' : '')) + '<div class="an-card"><div id="ov-daily"></div></div>';

    // movers — change measured WITHIN each venue (4+ sales in both windows), so a venue-mix shift can't fake a move
    var mv = AN.items.filter(function (c) { return c._a && c._a.c30 != null && c._a.n30 >= 5 && c._a.t30 >= 1; });
    var up = mv.slice().sort(function (a, b) { return b._a.c30 - a._a.c30; }).slice(0, 7), dn = mv.slice().sort(function (a, b) { return a._a.c30 - b._a.c30; }).slice(0, 7);
    function basis(a) { return a.cb === 'veve+stackr' ? 'both venues' : a.cb === 'veve' ? 'on VeVe' : 'on StackR'; }
    function mprice(c) { var a = c._a; return a.cb === 'veve' ? a.vm[0] : a.cb === 'stackr' ? AN.stackrToday(c).sales : a.t30; }   // price on the venue the change was measured on
    function mrow(c) { return AN.itemRow(c, '<b>' + money(mprice(c)) + '</b><small>' + AN.delta(c._a.c30) + '</small>', esc(AN.uname(c.universe)) + ' · ' + c._a.n30 + ' sales · ' + basis(c._a)); }
    h += AN.h('Biggest moves · 30 days', 'median sale price vs the 30 days before, measured within each venue · 5+ sales') +
      '<div class="an-grid c2"><div class="an-card"><h3>▲ Rising</h3>' + up.map(mrow).join('') + '</div><div class="an-card"><h3>▼ Falling</h3>' + dn.map(mrow).join('') + '</div></div>';

    // franchises — "rising" = share of the franchise's measurable items whose price rose this month (computed here)
    var rise = {}; AN.items.forEach(function (c) { var a = c._a; if (!a || a.c30 == null) return; var r = rise[c.universe] || (rise[c.universe] = [0, 0]); r[1]++; if (a.c30 > 0) r[0]++; });
    h += AN.h('Franchises', 'trade-based value · “7 days” compares the same items') +
      '<div class="an-card"><div class="an-scroll"><table class="an-table"><thead><tr><th>Franchise</th><th class="n">Market value</th><th class="n">7 days</th><th class="n">30 days</th><th class="n">Sales 24 h</th><th class="n">Items</th><th class="n">Rising this month</th></tr></thead><tbody>' +
      (M.rows || []).slice(0, 14).map(function (r) {
        var rs = rise[r.universe];
        return '<tr><td><b>' + esc(AN.uname(r.universe)) + '</b></td><td class="n"><b>' + money(r.cap) + '</b></td><td class="n">' + AN.delta(r.d7) + '</td><td class="n">' + AN.delta(r.d30) + '</td><td class="n">' + AN.num(r.sales24) + '</td><td class="n">' + AN.num(r.items) + '</td><td class="n">' + (rs && rs[1] >= 5 ? Math.round(rs[0] / rs[1] * 100) + '% <span style="color:var(--muted)">of ' + rs[1] + '</span>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      AN.note('“Rising this month” = share of the franchise’s items with enough trades to measure (4+ sales on a venue in both 30-day windows) whose price went up. A big headline move with a low share means one item carried it. <a href="market.html" style="color:var(--accent-2)">All ' + AN.num(((window.INDEXES && window.INDEXES.indexes) || []).length) + ' franchise &amp; character indexes →</a>') + '</div>';

    // most traded + auctions (auctions compared with ordinary sales on the VeVe market, where auctions run)
    var hot = AN.items.filter(function (c) { return c._a && c._a.n7 > 0; }).sort(function (a, b) { return b._a.n7 - a._a.n7; }).slice(0, 8);
    var rec = (au.recent || []).slice(0, 8);
    h += '<div class="an-grid c2" style="margin-top:14px"><div class="an-card"><h3>Most traded this week</h3>' +
      hot.map(function (c) { return AN.itemRow(c, '<b>' + money(AN.value(c).v) + '</b><small>' + c._a.n7 + ' sales</small>'); }).join('') + '</div>' +
      '<div class="an-card"><h3>Auctions · last 30 days</h3>' +
      (au.n ? '<p style="font-size:13.5px;line-height:1.5;margin:0 0 8px">The median auction closed at <strong>' + (au.ratio || 0).toFixed(2) + '×</strong> the item’s ordinary price on the VeVe market (' + au.n + ' auctions of items with 3+ VeVe sales); <strong>' + au.above + '%</strong> closed above it.</p>' : '<div class="an-empty">No comparable auctions in 30 days.</div>') +
      rec.map(function (r) { var c = AN.byTid[r[0]]; return c ? AN.itemRow(c, '<b>' + money(r[2]) + '</b><small>' + r[3].toFixed(2) + '× VeVe price</small>', esc(AN.ago(r[1]))) : ''; }).join('') + '</div></div>';

    root.innerHTML = h;
    AN.columns(document.getElementById('ov-daily'), { name: 'Sales', h: 200, extra: { head: ['Volume'], cells: function (p) { return [money(p.vol)]; } },
      pts: dd.map(function (d, i) { var dt = new Date(d[0] + 'T12:00:00Z'), lab = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), part = mk.partialDay && i === dd.length - 1;
        return { x: lab, xl: lab + (part ? ' (through ' + thru + ')' : ''), y: d[1], vol: d[2], partial: part }; }) });
    var E = A.weekEdges || [], wk = mk.weekly || [];
    AN.lineChart(document.getElementById('ov-mix'), { h: 150, fmt: function (v) { return Math.round(v) + '%'; },
      x: wk.map(function (w, i) { var end = new Date(((E[i + 1] || A.asOf) - 1) * 1000), lab = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); return { x: lab, xl: 'week to ' + lab }; }),
      series: [{ name: 'StackR share of sales', color: AN.COLORS.stackr, ys: wk.map(function (w) { var t = w[0] + w[1] + w[2]; return t ? w[1] / t * 100 : 0; }) }] });
  } });
})();
