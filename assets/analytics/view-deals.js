/* StackR Analytics — Deals (#/deals): listings priced below what the item sells for ON THE SAME VENUE. */
(function () {
  'use strict';
  var AN = window.AN, esc = AN.esc, money = AN.money, A = AN.A;
  var MIN = 5, MIN_ASK = 1, MAX_AGE_D = 14;
  function omiUsd() { return (window.FLOOR && window.FLOOR.omiUsd) || 0; }

  /* LIKE FOR LIKE, with guards against the ways a non-deal looks like one:
     · venue mix — StackR runs ~2/3 of the VeVe price, so compare within the venue only;
     · currency — StackR judged in OMI (OMI's dollar price moves ±20–30% a month);
     · thin or stale venues — 5+ sales there in 30 days and the latest sale there within 14 days;
     · a falling market — the ask must beat BOTH the 30-day median and that latest sale by 10%+;
     · dust — asks under $1 are left out (OMI rounding swamps the percentage). */
  function under() {
    var out = [], ou = omiUsd(), now = Date.now() / 1000;
    AN.items.forEach(function (c) {
      var k = AN.asks(c), vn = AN.venues(c);
      ['veve', 'stackr'].forEach(function (key) {
        var gi = AN.likeGapInfo(c, key, MIN), usd = key === 'veve' ? k.veve : k.stackr; if (!gi || usd < MIN_ASK) return;
        var lastTs, lastVal;
        if (key === 'veve') { if (!vn.veve.last) return; lastTs = vn.veve.last[0]; lastVal = vn.veve.last[1]; }
        else if (gi.basis === 'omi') { if (!vn.stackr.lastOmi) return; lastTs = vn.stackr.lastOmi[0]; lastVal = vn.stackr.lastOmi[1]; }
        else { if (!vn.stackr.last) return; lastTs = vn.stackr.last[0]; lastVal = vn.stackr.last[1]; }
        if ((now - lastTs) / 86400 > MAX_AGE_D) return;
        if (!(gi.ask < Math.min(gi.ref, lastVal) * 0.9)) return;
        var save = gi.basis === 'omi' ? (gi.ref - gi.ask) * ou : gi.ref - gi.ask;
        out.push({ c: c, key: key, code: key === 'veve' ? 0 : 1, gi: gi, usd: usd, lastTs: lastTs, lastVal: lastVal, save: save });
      });
    });
    return out.sort(function (x, y) { return x.gi.gap - y.gi.gap; });
  }
  function specials(hidePal) {
    var out = [];
    AN.specials().forEach(function (s) {
      if (hidePal && s.cats.indexOf('palindrome') >= 0) return;
      var k = AN.asks(s.c), ou = AN.ou();                                           // the SAME venue's floor copy; StackR in OMI
      var floor = s.code === 0 ? k.veve : (k.omi > 0 && ou ? k.omi * ou : k.stackr);
      if (!(floor > 0)) return;
      var over = s.code === 1 && k.omi > 0 && s.price > 0 ? (s.price / k.omi - 1) * 100 : (s.usd / floor - 1) * 100;
      if (over > 20) return;
      out.push({ s: s, over: over, floor: floor });
    });
    return out.sort(function (x, y) { return x.over - y.over; });
  }
  function setsCheap() {
    var S = (window.CATALOG && window.CATALOG.sets) || {}, out = [], ou = omiUsd();
    Object.keys(S).forEach(function (id) {
      var m = S[id].members || []; if (m.length < 3 || m.length > 30) return;
      var cost = 0, worth = 0, ok = true, priced = true, onS = 0;
      for (var i = 0; i < m.length; i++) {
        var c = AN.bySlug[m[i].slug]; if (!c) { ok = false; break; }
        var k = AN.asks(c); if (!k.best) { ok = false; break; }
        cost += k.best.usd; var vn = AN.venues(c);
        if (k.best.key === 'stackr') { onS++; if (vn.stackr.omiN >= 3 && ou) worth += vn.stackr.omi * ou; else if (vn.stackr.n >= 3) worth += vn.stackr.med; else priced = false; }
        else { if (vn.veve.n >= 3) worth += vn.veve.med; else priced = false; }
      }
      if (ok) out.push({ id: id, uni: S[id].universe, n: m.length, cost: cost, worth: priced ? worth : null, onS: onS, first: AN.bySlug[m[0].slug] });
    });
    var withW = out.filter(function (s) { return s.worth; }).sort(function (a, b) { return (a.cost / a.worth) - (b.cost / b.worth); });
    return withW.length >= 6 ? withW.slice(0, 12) : out.sort(function (a, b) { return a.cost - b.cost; }).slice(0, 12);
  }
  function nameCell(c, sub) { return '<td><a href="' + AN.itemHref(c) + '" style="color:var(--text);text-decoration:none;font-weight:700">' + esc(c.name) + '</a>' + (sub ? '<br><span style="color:var(--muted);font-size:11.5px">' + sub + '</span>' : '') + '</td>'; }

  AN.view('deals', { title: 'Deals', render: function (root) {
    var mk = A.market || {}, hidePal = AN.store.bool('hidePal', true);
    var u = under(), sp = specials(hidePal), st = setsCheap();
    var h = '<section class="an-hero"><h1>Listed <span>below what it sells for</span></h1>' +
      '<p>Live listings priced under what the same item actually sells for <em>on the same venue</em> — checked against the 30-day median and the latest sale there, with StackR measured in OMI so a falling OMI price doesn’t pass for a bargain.</p></section>';
    var VF = window.VEVE_FLOORS, fAge = VF && VF.floorsAsOf ? AN.ago(VF.floorsAsOf) : null;
    if (!mk.veveListingsFresh) h += '<div class="an-callout warn" style="margin-bottom:14px">VeVe-market special-mint listings are hidden: that feed is currently stale.' + (fAge ? ' VeVe floors (the cheapest VeVe ask per item) were last updated ' + esc(fAge) + '.' : '') + '</div>';

    h += AN.h('Under the market', AN.num(u.length) + ' listings · 5+ sales on that venue in 30 days, latest within 14 days') + '<div class="an-card">' + (u.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>Collectible</th><th>Venue</th><th class="n">Cheapest ask</th><th class="n">Sells for there</th><th class="n">Latest sale there</th><th class="n">You save</th><th class="n">Below</th></tr></thead><tbody>' +
      u.slice(0, 40).map(function (x) {
        var f = x.gi.basis === 'omi' ? AN.omi : money;
        return '<tr>' + nameCell(x.c, esc([x.c.rarity, AN.uname(x.c.universe)].filter(Boolean).join(' · ')) + ' · ' + x.gi.n + ' sales there') +
          '<td>' + AN.venueDot(x.code) + '</td><td class="n"><b>' + f(x.gi.ask) + '</b>' + (x.gi.basis === 'omi' ? '<br><span style="color:var(--muted);font-size:11px">≈ ' + money(x.usd) + '</span>' : '') + '</td>' +
          '<td class="n">' + f(x.gi.ref) + '</td><td class="n">' + f(x.lastVal) + '<br><span style="color:var(--muted);font-size:11px">' + esc(AN.ago(x.lastTs)) + '</span></td>' +
          '<td class="n">' + money(x.save) + '</td><td class="n">' + AN.delta(x.gi.gap) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (u.length > 40 ? AN.note('Showing the 40 deepest of ' + AN.num(u.length) + '.') : '') : '<div class="an-empty">Nothing is listed meaningfully under its own market right now.</div>') +
      AN.note('Listings refresh hourly and reach us when the data sync runs, so the best ones may already be gone. Floor copies only — premium mints are below. Asks under $1 are left out.') + '</div>';

    h += AN.h('Special mints near the floor', 'first public mint, birth years, memes… listed within 20% of the cheapest copy on the same venue') +
      '<div class="an-card"><label style="display:inline-flex;gap:8px;align-items:center;font-size:12.5px;color:var(--ink2);margin-bottom:10px;cursor:pointer"><input type="checkbox" id="dl-pal"' + (hidePal ? ' checked' : '') + '> Hide palindromes</label>' + (sp.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>Collectible</th><th>Mint</th><th>Why it is special</th><th>Venue</th><th class="n">Ask</th><th class="n">Floor there</th><th class="n">Premium</th></tr></thead><tbody>' +
      sp.slice(0, 30).map(function (x) {
        return '<tr>' + nameCell(x.s.c) + '<td><b>#' + AN.num(x.s.mint) + '</b></td><td>' + esc(x.s.label) + '</td><td>' + AN.venueDot(x.s.code) + '</td><td class="n"><b>' + money(x.s.usd) + '</b></td><td class="n">' + money(x.floor) + '</td><td class="n">' + (Math.abs(x.over) < 0.5 ? 'at floor' : AN.pct(x.over, 0)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="an-empty">No special mint is listed near its floor right now.</div>') + '</div>';

    h += AN.h('Cheapest complete sets', 'every piece at today’s cheapest ask, against what those pieces sell for on the same venues') + '<div class="an-card">' + (st.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>Set</th><th class="n">Pieces</th><th class="n">Cost at asks</th><th class="n">Same pieces sell for</th><th class="n">Difference</th></tr></thead><tbody>' +
      st.map(function (s) { return '<tr>' + (s.first ? nameCell(s.first, esc(AN.uname(s.uni)) + ' · set: ' + esc(s.id)) : '<td>' + esc(s.id) + '</td>') + '<td class="n">' + s.n + '<br><span style="color:var(--muted);font-size:11px">' + s.onS + ' on StackR</span></td><td class="n"><b>' + money(s.cost) + '</b></td><td class="n">' + (s.worth ? money(s.worth) : '—') + '</td><td class="n">' + (s.worth ? AN.delta((s.cost / s.worth - 1) * 100) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + AN.note('Sets of 3–30 pieces where every piece has a live listing, sorted by how far the total cost sits under what the same pieces sell for (StackR pieces valued in OMI at today’s rate). Completing a set can matter for collector points.') : '<div class="an-empty">No set is fully listed right now.</div>') + '</div>';
    root.innerHTML = h;
    document.getElementById('dl-pal').addEventListener('change', function () { AN.store.set('hidePal', this.checked); AN.views.deals.render(root); });
  } });
})();
