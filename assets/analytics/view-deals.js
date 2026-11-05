/* StackR Analytics — Deals (#/deals): listings priced below what the item actually sells for. */
(function () {
  'use strict';
  var AN = window.AN, esc = AN.esc, money = AN.money;

  function under() {
    /* A deal must beat BOTH the 30-day typical AND the latest week's median: when the whole market is
       falling, asks drift below a 30-day median without being cheap at all. */
    var out = [];
    AN.items.forEach(function (c) {
      var a = c._a; if (!a || a.n30 < 5 || a.n7 < 1 || !(a.t30 > 0)) return;
      var k = AN.asks(c); if (!k.best) return;
      var wk = 0; for (var i = a.w.length - 1; i >= Math.max(0, a.w.length - 2); i--) if (a.w[i] > 0) { wk = a.w[i]; break; }
      var ref = wk ? Math.min(a.t30, wk) : a.t30, d = (k.best.usd / a.t30 - 1) * 100;
      if (k.best.usd < ref * 0.9) out.push({ c: c, k: k, d: d, wk: wk });
    });
    return out.sort(function (x, y) { return x.d - y.d; });
  }
  function specials(hidePal) {
    var S = (window.SPECIAL_LISTINGS && window.SPECIAL_LISTINGS.items) || [], out = [];
    S.forEach(function (s) {
      var c = AN.byTid[s.tid]; if (!c || !(s.usd > 0)) return;
      if ((s.market || '').toUpperCase() === 'VEVE' && staleVeve) return;          // dead-token book — not "listed now"
      var cats = s.cats || []; if (hidePal && cats.indexOf('palindrome') >= 0) return;
      var k = AN.asks(c); if (!k.best) return;
      var over = (s.usd / k.best.usd - 1) * 100; if (over > 20) return;
      out.push({ s: s, c: c, over: over, floor: k.best });
    });
    return out.sort(function (x, y) { return x.over - y.over; });
  }
  var staleVeve = false;
  function setsCheap() {
    var S = (window.CATALOG && window.CATALOG.sets) || {}, out = [];
    Object.keys(S).forEach(function (id) {
      var m = S[id].members || []; if (m.length < 3 || m.length > 30) return;
      var cost = 0, val = 0, ok = true, priced = 0;
      for (var i = 0; i < m.length && ok; i++) {
        var c = AN.bySlug[m[i].slug]; if (!c) { ok = false; break; }
        var k = AN.asks(c); if (!k.best) { ok = false; break; }
        cost += k.best.usd; var v = AN.value(c); if (v.v) { val += v.v; priced++; }
      }
      if (ok) out.push({ id: id, uni: S[id].universe, n: m.length, cost: cost, val: priced === m.length ? val : null, first: AN.bySlug[m[0].slug] });
    });
    return out.sort(function (a, b) { return a.cost - b.cost; }).slice(0, 12);
  }

  AN.view('deals', { title: 'Deals', render: function (root) {
    var SL = window.SPECIAL_LISTINGS || {};
    staleVeve = SL.veveAsOf && (Date.now() / 1000 - SL.veveAsOf) > 26 * 3600;
    var hidePal = AN.store.get('hidePal', true);
    var u = under(), sp = specials(hidePal), st = setsCheap();
    var h = '<section class="an-hero"><h1>Listed <span>below what it sells for</span></h1>' +
      '<p>Live listings priced under the item’s real trading level — checked against the last 30 days <em>and</em> the latest week, so a falling market doesn’t masquerade as a bargain.</p></section>';
    if (staleVeve) h += '<div class="an-callout warn" style="margin-bottom:14px">VeVe-market listings are ' + Math.round((Date.now() / 1000 - SL.veveAsOf) / 86400) + ' days old in this prototype (their feed needs a refreshed session), so special-mint deals below show StackR listings only. Floors from both venues are current.</div>';

    h += AN.h('Under the market', AN.num(u.length) + ' items · 5+ sales in 30 days and at least one this week') + '<div class="an-card">' + (u.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>Collectible</th><th>Venue</th><th class="n">Cheapest ask</th><th class="n">Typical sale</th><th class="n">Latest week</th><th class="n">Below typical</th></tr></thead><tbody>' +
      u.slice(0, 40).map(function (x) {
        return '<tr><td><a href="' + AN.itemHref(x.c) + '" style="color:var(--text);text-decoration:none;font-weight:700">' + esc(x.c.name) + '</a><br><span style="color:var(--muted);font-size:11.5px">' + esc([x.c.rarity, AN.uname(x.c.universe)].filter(Boolean).join(' · ')) + ' · ' + x.c._a.n30 + ' sales in 30 days</span></td>' +
          '<td>' + AN.venueDot(x.k.best.venue === 'VeVe' ? 0 : 1) + '</td><td class="n"><b>' + money(x.k.best.usd) + '</b></td><td class="n">' + money(x.c._a.t30) + '</td><td class="n">' + (x.wk ? money(x.wk) : '—') + '</td><td class="n">' + AN.delta(x.d) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (u.length > 40 ? AN.note('Showing the 40 deepest of ' + AN.num(u.length) + '.') : '') : '<div class="an-empty">Nothing is listed meaningfully under its trading level right now.</div>') +
      AN.note('Listings refresh hourly; StackR listings reach us when the data sync runs, so the best ones may already be gone. A floor copy only — premium mints are below.') + '</div>';

    h += AN.h('Special mints near the floor', 'first public mint, birth years, memes… listed within 20% of the cheapest copy') +
      '<div class="an-card"><label style="display:inline-flex;gap:8px;align-items:center;font-size:12.5px;color:var(--ink2);margin-bottom:10px;cursor:pointer"><input type="checkbox" id="dl-pal"' + (hidePal ? ' checked' : '') + '> Hide palindromes</label>' + (sp.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>Collectible</th><th>Mint</th><th>Why it is special</th><th>Venue</th><th class="n">Ask</th><th class="n">Floor</th><th class="n">Premium</th></tr></thead><tbody>' +
      sp.slice(0, 30).map(function (x) {
        return '<tr><td><a href="' + AN.itemHref(x.c) + '" style="color:var(--text);text-decoration:none;font-weight:700">' + esc(x.c.name) + '</a></td><td><b>#' + AN.num(x.s.mint) + '</b></td><td>' + esc(x.s.label || '') + '</td>' +
          '<td>' + AN.venueDot((x.s.market || '').toUpperCase() === 'VEVE' ? 0 : 1) + '</td><td class="n"><b>' + money(x.s.usd) + '</b></td><td class="n">' + money(x.floor.usd) + '</td><td class="n">' + (Math.abs(x.over) < 0.5 ? 'at floor' : AN.pct(x.over, 0)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="an-empty">No special mint is listed near its floor right now.</div>') + '</div>';

    h += AN.h('Cheapest complete sets', 'buy every piece of a set at today’s cheapest asks') + '<div class="an-card">' + (st.length ?
      '<div class="an-scroll"><table class="an-table"><thead><tr><th>Set</th><th class="n">Pieces</th><th class="n">Cost at asks</th><th class="n">Worth at real sales</th></tr></thead><tbody>' +
      st.map(function (s) { return '<tr><td>' + (s.first ? '<a href="' + AN.itemHref(s.first) + '" style="color:var(--text);text-decoration:none;font-weight:700">' + esc(s.id) + '</a>' : esc(s.id)) + '<br><span style="color:var(--muted);font-size:11.5px">' + esc(AN.uname(s.uni)) + '</span></td><td class="n">' + s.n + '</td><td class="n"><b>' + money(s.cost) + '</b></td><td class="n">' + (s.val != null ? money(s.val) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + AN.note('Sets of 3–30 pieces where every piece has a live listing. Completing a set can matter for collector points; the real-sales column shows whether the asks are fair.') : '<div class="an-empty">No set is fully listed right now.</div>') + '</div>';
    root.innerHTML = h;
    document.getElementById('dl-pal').addEventListener('change', function () { AN.store.set('hidePal', this.checked); AN.views.deals.render(root); });
  } });
})();
