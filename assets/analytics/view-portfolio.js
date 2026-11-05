/* StackR Analytics — My vault (#/portfolio): what your collection is worth in REAL sales.
   Privacy: reads only the public address the visitor pastes; nothing is stored or sent anywhere but the
   public Collect Chain explorer. This page loads no listing seller handles, so a pasted wallet can't be
   joined to a marketplace username. The sample vault is synthetic — never a real person's wallet. */
(function () {
  'use strict';
  var AN = window.AN, esc = AN.esc, money = AN.money, last = null, MIN = AN.MIN_VENUE_SALES;

  function shell(root, msg) {
    root.innerHTML = '<section class="an-hero"><h1>Your vault, <span>valued honestly</span></h1>' +
      '<p>Paste a VeVe wallet address to see what your collection is worth at <strong>real sale prices</strong> — and what the same pieces fetch on each venue. Read-only: no login, no signing, nothing stored.</p></section>' +
      '<div class="an-card"><div style="display:flex;gap:10px;flex-wrap:wrap"><input class="an-input" id="pf-addr" style="flex:1;min-width:240px" placeholder="0x… your VeVe wallet address" spellcheck="false" autocomplete="off" aria-label="Wallet address" />' +
      '<button class="an-btn" id="pf-go" type="button">Value my vault</button><button class="an-btn ghost" id="pf-sample" type="button">Try a sample vault</button></div>' +
      '<p class="an-basis" style="margin-top:10px">Find it in the VeVe app: Wallet → Send/Receive OMI → Receive. In a launched product this would come from your login, so nobody can look up anyone else.</p>' +
      '<div id="pf-status" class="an-basis" role="status"></div></div><div id="pf-out"></div>';
    if (msg) document.getElementById('pf-status').textContent = msg;
    document.getElementById('pf-go').addEventListener('click', go);
    document.getElementById('pf-addr').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    document.getElementById('pf-sample').addEventListener('click', function () { last = { sample: true, rows: AN.samplePortfolio(), other: 0, comics: 0 }; render(last); });
  }

  async function go() {
    var addr = document.getElementById('pf-addr').value.trim(), st = document.getElementById('pf-status'), btn = document.getElementById('pf-go');
    if (!window.COLLECTSCAN || !window.COLLECTSCAN.isAddress(addr)) { st.textContent = 'That doesn’t look like a 0x wallet address.'; return; }
    btn.disabled = true; st.textContent = 'Reading the vault from the Collect Chain…';
    try {
      var hs = await window.COLLECTSCAN.fetchHoldings(addr, { onProgress: function (n) { st.textContent = 'Reading the vault… ' + AN.num(n) + ' editions so far'; } });
      var map = {}, other = 0, comics = 0;
      hs.forEach(function (h) {
        if (h.format === 'comic') { comics++; return; }
        var c = AN.matchHolding(h); if (!c) { other++; return; }
        var r = map[c.tid] || (map[c.tid] = { c: c, qty: 0, mints: [] }); r.qty++; if (h.mintNumber) r.mints.push(h.mintNumber);
      });
      var rows = Object.keys(map).map(function (k) { var r = map[k]; r.mint = r.mints.sort(function (a, b) { return a - b; })[0]; return r; });
      last = { sample: false, rows: rows, other: other, comics: comics, truncated: !!hs.truncated, read: hs.length };
      st.textContent = AN.num(hs.length) + ' editions read.'; render(last);
    } catch (e) { st.textContent = 'Could not read that wallet (' + (e && e.message ? e.message : 'network error') + '). The public explorer may be rate-limiting — try again in a minute.'; }
    btn.disabled = false;
  }

  function render(P) {
    var out = document.getElementById('pf-out'), rows = P.rows;
    var tot = 0, now = 0, before = 0, liquid = 0, unv = 0, n = 0, onV = 0, onS = 0, both = 0, flV = 0, flBase = 0, flN = 0;
    rows.forEach(function (r) {
      var v = AN.value(r.c), a = r.c._a, k = AN.asks(r.c), vn = AN.venues(r.c); n += r.qty;
      r.v = v; r.k = k;
      if (v.v) { tot += v.v * r.qty; if (a && a.n30 > 0) liquid += r.qty; } else unv += r.qty;
      if (a && a.c30 != null && v.basis === 'traded') { now += a.t30 * r.qty; before += a.t30 / (1 + a.c30 / 100) * r.qty; }   // venue-aware change
      if (vn.veve.n >= MIN && vn.stackr.n >= MIN) { onV += vn.veve.med * r.qty; onS += vn.stackr.med * r.qty; both += r.qty; }
      if (k.veve && vn.veve.n >= MIN) { flV += k.veve * r.qty; flBase += vn.veve.med * r.qty; flN += r.qty; }               // VeVe ask vs VeVe sales
    });
    var chg = before ? (now / before - 1) * 100 : null;
    var h = (P.sample ? '<div class="an-callout" style="margin-top:14px">This is a <strong>made-up sample vault</strong> of ' + AN.num(n) + ' collectibles, built from the catalog to show the view. Paste an address for a real vault.</div>' : '') +
      (P.truncated ? '<div class="an-callout warn" style="margin-top:14px">Only the first ' + AN.num(P.read) + ' editions could be read, so the totals below are a <strong>lower bound</strong>.</div>' : '') +
      '<div class="an-grid c23" style="margin-top:14px"><div class="an-card"><div class="an-biglab">Vault value · at real sale prices</div><div class="an-big">' + money(tot) + '</div>' +
      '<div class="an-chips" style="margin-top:10px">' + (chg != null ? AN.delta(chg, '30 days, same items') : '') + AN.chip(AN.num(n) + ' collectibles') + (P.comics ? AN.chip(AN.num(P.comics) + ' comics not valued') : '') + '</div>' +
      '<div class="an-basis">Each piece at its typical sale price (median of the last 30 days across venues; its last ordinary sale if it hasn’t traded since). ' + (unv ? AN.num(unv) + ' piece' + (unv === 1 ? '' : 's') + ' never traded and count as $0. ' : '') + 'Comics are not in the trade record yet. The 30-day change is measured within each venue.</div></div>' +
      '<div class="an-card"><h3>Same vault, two prices</h3>' +
      (both ? AN.compare([{ label: 'Sold on VeVe', value: onV, color: AN.COLORS.veve }, { label: 'Sold on StackR', value: onS, color: AN.COLORS.stackr }]) +
        '<p style="font-size:13px;line-height:1.5;margin:12px 0 0">The ' + AN.num(both) + ' pieces with 3+ sales on both venues are worth <strong>' + Math.abs(Math.round((onS / onV - 1) * 100)) + '% ' + (onS < onV ? 'less' : 'more') + '</strong> on StackR (paid in OMI) than on the VeVe gem market.</p>' : '<div class="an-empty">Too few of these pieces trade on both venues to compare.</div>') +
      (flN ? '<p class="an-basis">VeVe’s cheapest asks for ' + AN.num(flN) + ' of these pieces add up to ' + money(flV) + ' — ' + Math.abs(Math.round((flV / flBase - 1) * 100)) + '% ' + (flV >= flBase ? 'above' : 'below') + ' what they sell for on VeVe. Asks are not value.</p>' : '') + '</div></div>';
    var best = rows.filter(function (r) { return r.v.v; }).sort(function (x, y) { return y.v.v - x.v.v; })[0];
    h += '<div class="an-kpis" style="margin-top:14px">' +
      AN.kpi('Sellable this month', n ? Math.round(liquid / n * 100) + '%' : '—', 'of your pieces traded at least once in 30 days') +
      AN.kpi('Most valuable piece', best ? money(best.v.v) : '—', best ? esc(best.c.name) : '') +
      AN.kpi('Lowest public mints', AN.num(rows.filter(function (r) { return r.mint && r.c.lowmint && r.mint === r.c.lowmint; }).length), 'pieces held at the first public mint number') +
      (P.other ? AN.kpi('Not matched', AN.num(P.other), 'editions we could not match to one catalog item') : '') + '</div>';

    // allocation — one hue for the biggest slice, gray for the rest (emphasis, not a rainbow)
    var byU = {}; rows.forEach(function (r) { if (r.v.v) byU[r.c.universe] = (byU[r.c.universe] || 0) + r.v.v * r.qty; });
    var al = Object.keys(byU).map(function (u) { return { label: AN.uname(u), value: byU[u] }; }).sort(function (a, b) { return b.value - a.value; });
    if (al.length > 7) { var rest = al.slice(6).reduce(function (s, x) { return s + x.value; }, 0); al = al.slice(0, 6).concat([{ label: 'Other', value: rest }]); }
    if (al.length) al[0].color = AN.COLORS.blended;
    var movers = rows.filter(function (r) { return r.c._a && r.c._a.c30 != null && r.v.basis === 'traded'; }).sort(function (a, b) { return Math.abs(b.c._a.c30) - Math.abs(a.c._a.c30); }).slice(0, 6);
    h += '<div class="an-grid c2" style="margin-top:14px"><div class="an-card"><h3>Where your value sits</h3>' + (al.length ? AN.compare(al) : '<div class="an-empty">No valued pieces.</div>') + '</div>' +
      '<div class="an-card"><h3>Biggest moves in your vault · 30 days</h3>' + (movers.length ? movers.map(function (r) { return AN.itemRow(r.c, '<b>' + money(r.v.v) + '</b><small>' + AN.delta(r.c._a.c30) + '</small>'); }).join('') : '<div class="an-empty">Not enough trading history in these pieces.</div>') + '</div></div>';

    var sorted = rows.slice().sort(function (a, b) { return (b.v.v || 0) * b.qty - (a.v.v || 0) * a.qty; });
    h += AN.h('Holdings', AN.num(rows.length) + ' different collectibles') + '<div class="an-card"><div class="an-scroll"><table class="an-table"><thead><tr><th>Collectible</th><th class="n">Qty</th><th class="n">Mint</th><th class="n">Sells for</th><th class="n">30 days</th><th class="n">Cheapest ask</th><th class="n">Total</th></tr></thead><tbody>' +
      sorted.slice(0, 120).map(function (r) {
        return '<tr><td><a href="' + AN.itemHref(r.c) + '" style="color:var(--text);text-decoration:none;font-weight:700">' + esc(r.c.name) + '</a><br><span style="color:var(--muted);font-size:11.5px">' + esc([r.c.rarity, AN.uname(r.c.universe)].filter(Boolean).join(' · ')) + '</span></td>' +
          '<td class="n">' + r.qty + '</td><td class="n">' + (r.mint ? '#' + AN.num(r.mint) : '—') + '</td>' +
          '<td class="n">' + (r.v.v ? money(r.v.v) + (r.v.basis === 'last' ? '<br><span class="an-stale">last sale ' + esc(AN.daysAgo(r.c._a.la[0])) + '</span>' : '') : '—') + '</td>' +
          '<td class="n">' + (r.c._a && r.c._a.c30 != null ? AN.delta(r.c._a.c30) : '—') + '</td><td class="n">' + (r.k.best ? money(r.k.best.usd) + '<br><span style="color:var(--muted);font-size:11px">' + r.k.best.venue + '</span>' : '—') + '</td><td class="n"><b>' + (r.v.v ? money(r.v.v * r.qty) : '—') + '</b></td></tr>';
      }).join('') + '</tbody></table></div>' + (sorted.length > 120 ? AN.note('Showing the 120 most valuable of ' + AN.num(sorted.length) + '.') : '') +
      AN.note('A low or special mint is valued like a floor copy here — mint premiums need sales data that carries the mint number.') + '</div>';
    out.innerHTML = h;
  }

  AN.view('portfolio', { title: 'My vault', render: function (root) { shell(root); if (last) render(last); } });
})();
