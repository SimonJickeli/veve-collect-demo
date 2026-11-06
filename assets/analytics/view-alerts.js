/* StackR Analytics — Alerts (#/alerts): a watchlist with rules, evaluated against today's data.
   Concept: in the product these would be delivered as push / Telegram. The community toolset already runs
   such an engine every 60 s — but it can only see a listing once the data sync delivers it (hours today).
   Here the list lives in this browser only; everything read back from storage is validated. */
(function () {
  'use strict';
  var AN = window.AN, esc = AN.esc, money = AN.money;
  function list() { return AN.store.watch(); }
  function save(w) { AN.store.set('watch', w); }
  function mints() { return AN.store.ints('mints', [21, 221]); }
  AN.isWatched = function (tid) { return list().some(function (x) { return x.tid === tid; }); };
  /* default price alert: 10% under the CHEAPER venue's typical sale — a default built on the blended price
     would fire on every ordinary StackR listing (StackR runs ~2/3 of the VeVe price) */
  function defaultBelow(c) {
    var vn = AN.venues(c), st = AN.stackrToday(c), meds = [];             // StackR at today's OMI rate — the rate its asks are shown at
    if (vn.veve.n >= AN.MIN_VENUE_SALES && vn.veve.med > 0) meds.push(vn.veve.med);
    if (st.n >= AN.MIN_VENUE_SALES && st.sales > 0) meds.push(st.sales);
    var ref = meds.length ? Math.min.apply(null, meds) : AN.value(c).v;
    return ref ? Math.round(ref * 0.9 * 100) / 100 : 0;
  }
  AN.toggleWatch = function (tid) {
    var w = list(), i = -1; w.forEach(function (x, n) { if (x.tid === tid) i = n; });
    if (i >= 0) w.splice(i, 1); else if (AN.byTid[tid]) w.push({ tid: tid, below: defaultBelow(AN.byTid[tid]), under: 15 });
    save(w); return i < 0;
  };
  function evaluate(x) {
    var c = AN.byTid[x.tid]; if (!c) return null;
    var k = AN.asks(c), v = AN.value(c), hits = [];
    if (x.below > 0 && k.best && k.best.usd <= x.below) hits.push('listed at ' + money(k.best.usd) + ' on ' + k.best.venue + ' — under your ' + money(x.below));
    var gi = k.best ? AN.likeGapInfo(c, k.best.key) : null;              // cheapest ask vs sales on its OWN venue (StackR in OMI)
    if (x.under > 0 && gi && gi.gap <= -x.under) hits.push(Math.round(-gi.gap) + '% under what it sells for on ' + k.best.venue);
    return { c: c, k: k, v: v, gi: gi, hits: hits };
  }

  AN.view('alerts', { title: 'Alerts', render: function (root) {
    var w = list(), ms = mints();
    var h = '<section class="an-hero"><h1>Be told <span>the moment it matters</span></h1>' +
      '<p>Watch the pieces you want and set the rules. In a launched product these would arrive as a push or Telegram message. The community toolset already runs that engine every 60 seconds; today it can only see a listing once the data sync delivers it, which takes hours — with direct access to the marketplace it would be seconds. Try the rules against the current market here.</p></section>';
    h += '<div class="an-callout">Your watchlist is kept in this browser only. Add pieces with <strong>☆ Watch</strong> on any item page, or start from the search above.</div>';
    h += AN.h('Your watchlist', w.length ? AN.num(w.length) + ' pieces · rules checked against current listings' : '') + '<div class="an-card">';
    if (!w.length) h += '<div class="an-empty">Nothing watched yet. <button class="an-linkbtn" id="al-demo" type="button">Add three popular pieces to try it</button></div>';
    else {
      h += '<div class="an-scroll"><table class="an-table"><thead><tr><th>Collectible</th><th class="n">Sells for</th><th class="n">Cheapest ask</th><th>Alert under</th><th>…or this far under its venue</th><th>Right now</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>';
      w.forEach(function (x, i) {
        var e = evaluate(x); if (!e) return;
        h += '<tr><td><a href="' + AN.itemHref(e.c) + '" style="color:var(--text);text-decoration:none;font-weight:700">' + esc(e.c.name) + '</a></td><td class="n">' + (e.v.v ? money(e.v.v) : '—') + '</td><td class="n">' + (e.k.best ? money(e.k.best.usd) + '<br><span style="color:var(--muted);font-size:11px">' + e.k.best.venue + '</span>' : '—') + '</td>' +
          '<td>$ <input class="an-input" data-i="' + i + '" data-f="below" type="number" min="0" step="0.01" value="' + Number(x.below || 0) + '" style="width:92px;padding:6px 8px" aria-label="Alert price for ' + esc(e.c.name) + '"></td>' +
          '<td><input class="an-input" data-i="' + i + '" data-f="under" type="number" min="0" max="90" step="1" value="' + Number(x.under || 0) + '" style="width:64px;padding:6px 8px" aria-label="Percent under its venue for ' + esc(e.c.name) + '"> %</td>' +
          '<td style="white-space:normal;min-width:170px">' + (e.hits.length ? '<span class="an-chip good">🔔 would fire</span><br><span style="font-size:11.5px;color:var(--ink2)">' + esc(e.hits[0]) + '</span>' : '<span style="color:var(--muted);font-size:12px">quiet</span>') + '</td>' +
          '<td><button class="an-iconbtn" data-rm="' + i + '" type="button" aria-label="Remove ' + esc(e.c.name) + '" title="Remove">✕</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    h += AN.h('Mint numbers', 'alert whenever a specific mint number is listed — on any collectible') + '<div class="an-card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      ms.map(function (m) { return '<span class="an-chip acc">#' + m + ' <button class="an-iconbtn sm" data-mrm="' + m + '" type="button" aria-label="Stop watching mint ' + m + '">✕</button></span>'; }).join('') +
      '<input class="an-input" id="al-mint" type="number" min="1" placeholder="add a mint #" style="width:130px;padding:6px 10px" aria-label="Add a mint number"><button class="an-btn ghost" id="al-madd" type="button" style="padding:7px 12px">Add</button></div>' +
      '<div id="al-mres" class="an-basis" style="margin-top:12px" role="status">Checking live listings…</div></div>';
    h += AN.h('What else the alert engine can do', '') + '<div class="an-grid c3">' +
      ['Special mint near floor|A first public mint, a birth-year or a meme number listed within 20% of the cheapest copy on the same venue.',
       'Missing piece for your set|The one collectible you still need for a set is listed under what it sells for.',
       'Vault moves|A piece in your vault moves more than 15% in a week, or sells for a new record.'].map(function (t) {
        var p = t.split('|'); return '<div class="an-card"><h3>' + esc(p[0]) + '</h3><p style="font-size:13px;line-height:1.5;margin:0;color:var(--ink2)">' + esc(p[1]) + '</p></div>'; }).join('') + '</div>';
    root.innerHTML = h;

    var demo = document.getElementById('al-demo');
    if (demo) demo.addEventListener('click', function () {
      AN.items.filter(function (c) { return c._a && c._a.n30 >= 8; }).sort(function (a, b) { return b._a.n30 - a._a.n30; }).slice(0, 3).forEach(function (c) { if (!AN.isWatched(c.tid)) AN.toggleWatch(c.tid); });
      AN.views.alerts.render(root);
    });
    root.querySelectorAll('input[data-f]').forEach(function (inp) { inp.addEventListener('change', function () { var w2 = list(), x = w2[+inp.getAttribute('data-i')]; if (!x) return; x[inp.getAttribute('data-f')] = Math.max(0, parseFloat(inp.value) || 0); save(w2); AN.views.alerts.render(root); }); });
    root.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { var w2 = list(); w2.splice(+b.getAttribute('data-rm'), 1); save(w2); AN.views.alerts.render(root); }); });
    root.querySelectorAll('[data-mrm]').forEach(function (b) { b.addEventListener('click', function () { AN.store.set('mints', mints().filter(function (m) { return m !== +b.getAttribute('data-mrm'); })); AN.views.alerts.render(root); }); });
    function addMint() { var v = parseInt(document.getElementById('al-mint').value, 10); if (v > 0 && v < 1e6) { var m = mints(); if (m.indexOf(v) < 0) m.push(v); AN.store.set('mints', m.sort(function (a, b) { return a - b; })); AN.views.alerts.render(root); } }
    document.getElementById('al-madd').addEventListener('click', addMint);
    document.getElementById('al-mint').addEventListener('keydown', function (e) { if (e.key === 'Enter') addMint(); });

    AN.lazy('analytics_listings').then(function () {
      var box = document.getElementById('al-mres'); if (!box) return;
      var L = window.AN_LISTINGS; if (!L || !ms.length) { box.textContent = ms.length ? 'Live listings could not be loaded.' : 'No mint numbers watched.'; return; }
      var found = [];
      (L.s || []).forEach(function (r) { var c = AN.byTid[L.tids[r[0]]]; if (c && ms.indexOf(r[1]) >= 0) found.push({ c: c, m: r[1], usd: r[3], ven: 1 }); });
      (L.v || []).forEach(function (r) { var c = AN.byTid[L.tids[r[0]]]; if (c && ms.indexOf(r[1]) >= 0) found.push({ c: c, m: r[1], usd: r[2], ven: 0 }); });
      found.sort(function (a, b) { return a.usd - b.usd; });
      box.innerHTML = found.length ? '<p style="margin:0 0 8px;color:var(--ink2)"><strong style="color:var(--text)">' + AN.num(found.length) + '</strong> listings of your mint numbers are live right now' + (L.veveFresh ? '' : ' on StackR (the VeVe-market feed is stale)') + ' — cheapest first:</p>' +
        found.slice(0, 8).map(function (f) { return AN.itemRow(f.c, '<b>' + money(f.usd) + '</b><small>#' + f.m + ' · ' + AN.venue(f.ven).label + '</small>'); }).join('') : 'None of your mint numbers is listed right now.';
    });
  } });
})();
