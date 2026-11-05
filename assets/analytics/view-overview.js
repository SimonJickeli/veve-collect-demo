/* StackR Analytics — Market overview (#/overview): the whole VeVe market, in real sales. */
(function () {
  'use strict';
  var AN = window.AN, A = AN.A, esc = AN.esc, money = AN.money;
  AN.view('overview', { title: 'Market', render: function (root) {
    var M = window.MARKETCAP || { rows: [], total: {} }, T = M.total || {}, mk = A.market || {}, daily = mk.daily || [];
    function sum(arr, k) { return arr.reduce(function (s, d) { return s + (d[k] || 0); }, 0); }
    var full = daily.slice(0, -1);                       // today is partial — compare complete days only
    var w1 = full.slice(-7), w0 = full.slice(-14, -7);
    var s1 = sum(w1, 1), s0 = sum(w0, 1), v1 = sum(w1, 2), v0 = sum(w0, 2);
    var traded = AN.items.filter(function (c) { return c._a; });
    var active7 = traded.filter(function (c) { return c._a.n7 > 0; }).length;
    var vs = mk.venue30 || {}, au = mk.auction || {};

    var h = '<section class="an-hero"><h1>The VeVe market, <span>in real sales</span></h1>' +
      '<p>Every number on this page comes from completed trades on the VeVe gem market, StackR and auctions — not from what sellers are asking. Ask-based totals overstate the market about 2×; this is what collectibles actually change hands for.</p></section>';

    h += '<div class="an-grid c23"><div class="an-card"><div class="an-biglab">Market value · trade-based</div><div class="an-big">' + money(T.cap) + '</div>' +
      '<div class="an-chips" style="margin-top:10px">' + AN.delta(T.d7, '7 days, same items') + (T.new7 ? AN.chip('+' + money(T.new7) + ' from new drops', 'acc') : '') + '</div>' +
      '<div class="an-basis">Typical traded price × copies in circulation, across ' + AN.num(T.items) + ' collectibles with a sale in the last 14 days. New drops are reported separately so they don’t look like growth.</div></div>' +
      '<div class="an-card"><h3>Where trades happen · last 30 days</h3>' +
      AN.split([{ label: 'StackR', value: vs.stackr || 0, color: AN.COLORS.stackr }, { label: 'VeVe market', value: vs.fixed || 0, color: AN.COLORS.veve }, { label: 'Auctions', value: vs.auction || 0, color: AN.COLORS.auction }]) +
      AN.note('Completed collectible sales by venue. When trading moves to Collect, this view shows the migration as it happens.') + '</div></div>';

    var spark = daily.slice(-29, -1).map(function (d) { return d[1]; }), vspark = daily.slice(-29, -1).map(function (d) { return d[2]; });
    h += '<div class="an-kpis" style="margin-top:14px">' +
      AN.kpi('Sales · last 7 days', AN.num(s1), (s0 ? AN.delta((s1 / s0 - 1) * 100, 'vs prior week') : ''), AN.spark(spark, { label: 'daily sales, 4 weeks' })) +
      AN.kpi('Volume · last 7 days', money(v1), (v0 ? AN.delta((v1 / v0 - 1) * 100, 'vs prior week') : ''), AN.spark(vspark, { label: 'daily volume, 4 weeks' })) +
      AN.kpi('Sales · last 24 h', AN.num(T.sales24), money(T.vol24) + ' traded') +
      AN.kpi('Collectibles traded', AN.num(active7), 'at least one sale in 7 days · of ' + AN.num(AN.items.length)) + '</div>';

    h += AN.h('Daily sales', 'last 90 days · completed collectible sales, all venues') + '<div class="an-card"><div id="ov-daily"></div></div>';

    // movers — need enough trades in BOTH 30-day windows (core sets c30 only then)
    var mv = traded.filter(function (c) { return c._a.c30 != null && c._a.n30 >= 5 && c._a.t30 >= 1; });
    var up = mv.slice().sort(function (a, b) { return b._a.c30 - a._a.c30; }).slice(0, 7);
    var dn = mv.slice().sort(function (a, b) { return a._a.c30 - b._a.c30; }).slice(0, 7);
    function mrow(c) { return AN.itemRow(c, '<b>' + money(c._a.t30) + '</b><small>' + AN.delta(c._a.c30) + '</small>', esc(AN.uname(c.universe)) + ' · ' + c._a.n30 + ' sales in 30 days'); }
    h += AN.h('Biggest moves · 30 days', 'typical sale price vs the 30 days before · only items with 5+ sales') +
      '<div class="an-grid c2"><div class="an-card"><h3>▲ Rising</h3>' + up.map(mrow).join('') + '</div><div class="an-card"><h3>▼ Falling</h3>' + dn.map(mrow).join('') + '</div></div>';

    // franchises — breadth is the honesty check on the headline number
    var IX = {}; ((window.INDEXES && window.INDEXES.indexes) || []).forEach(function (i) { if (i.type === 'franchise') IX[i.key] = i; });
    h += AN.h('Franchises', 'trade-based value · “7 days” compares the same items, new drops excluded') +
      '<div class="an-card"><div class="an-scroll"><table class="an-table"><thead><tr><th>Franchise</th><th class="n">Market value</th><th class="n">7 days</th><th class="n">30 days</th><th class="n">Sales 24 h</th><th class="n">Items</th><th class="n">Rising</th></tr></thead><tbody>' +
      (M.rows || []).slice(0, 14).map(function (r) {
        var ix = IX[r.universe];
        return '<tr><td><b>' + esc(AN.uname(r.universe)) + '</b></td><td class="n"><b>' + money(r.cap) + '</b></td><td class="n">' + AN.delta(r.d7) + '</td><td class="n">' + AN.delta(r.d30) + '</td><td class="n">' + AN.num(r.sales24) + '</td><td class="n">' + AN.num(r.items) + '</td><td class="n">' + (ix && ix.breadth != null ? ix.breadth + '%' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      AN.note('“Rising” = share of the franchise’s items trading above their first sale (Star Wars, Marvel, Disney). A big headline move with low breadth means one item carried it. <a href="market.html" style="color:var(--accent-2)">All 52 indexes →</a>') + '</div>';

    // most traded this week + auctions
    var hot = traded.filter(function (c) { return c._a.n7 > 0; }).sort(function (a, b) { return b._a.n7 - a._a.n7; }).slice(0, 8);
    var rec = (au.recent || []).slice(0, 8);
    h += '<div class="an-grid c2" style="margin-top:14px"><div class="an-card"><h3>Most traded this week</h3>' +
      hot.map(function (c) { return AN.itemRow(c, '<b>' + money(c._a.t30) + '</b><small>' + c._a.n7 + ' sales</small>'); }).join('') + '</div>' +
      '<div class="an-card"><h3>Auctions · last 30 days</h3>' +
      (au.n ? '<p style="font-size:13.5px;line-height:1.5;margin:0 0 8px">Auctions closed at <strong>' + (au.ratio || 0).toFixed(2) + '×</strong> the item’s typical sale price (median of ' + au.n + '); only <strong>' + au.above + '%</strong> beat it. Auctions are where buyers find bargains.</p>' : '<div class="an-empty">No comparable auctions in 30 days.</div>') +
      rec.map(function (r) { var c = AN.byTid[r[0]]; return c ? AN.itemRow(c, '<b>' + money(r[2]) + '</b><small>' + r[3].toFixed(2) + '× typical</small>', esc(AN.ago(r[1]))) : ''; }).join('') + '</div></div>';

    root.innerHTML = h;
    AN.columns(document.getElementById('ov-daily'), { name: 'Sales', h: 200, pts: daily.map(function (d) {
      var dt = new Date(d[0] + 'T12:00:00Z'), lab = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return { x: lab, xl: lab + ' · ' + AN.money(d[2]) + ' volume', y: d[1] }; }) });
  } });
})();
