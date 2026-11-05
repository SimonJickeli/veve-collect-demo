/* StackR Analytics — concept prototype · core: data layer, honest-value rules, formatters, charts, router.
   Views register with AN.view(name, { title, render(root, params) }).

   RULES OF THE HOUSE
   1. A VALUE is always derived from completed sales. An ASK is only ever shown as an ask.
   2. Two-price market: StackR (OMI) trades at ~2/3 of the VeVe gem market for the same item, so an ask is
      only ever compared with sales ON ITS OWN VENUE — and StackR in OMI, because OMI's dollar price swings.
   3. No number in the copy is typed in; every claim is computed from the shipped data.
   4. No seller handles are loaded on this page (a page that reads pasted wallets must not also hold
      listing handles — together they would map wallets to usernames). */
(function (g) {
  'use strict';
  var A = g.ANALYTICS || { items: {}, market: { daily: [], venue30: {}, weekly: [], auction: { recent: [] } }, months: [], specials: [], asOf: 0 };
  var CAT = (g.CATALOG && g.CATALOG.items) || [];
  var FL = g.FLOOR || { byTid: {}, omiUsd: 0 };
  var norm = g.normName || function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var AN = g.AN = { A: A, views: {}, norm: norm, MIN_VENUE_SALES: 3 };

  /* Colour roles — validated for dark mode (dataviz validator, panel #1e1e25 and page #131317, all checks pass in
     this fixed order). Blue is the brand AND the blended (all-venue) series; each venue has its own identity hue
     and is always labelled in text too. Status colours (good/bad) are never used for a series. */
  var VEN = [{ key: 'veve', label: 'VeVe', color: '#d95926' }, { key: 'stackr', label: 'StackR', color: '#199e70' }, { key: 'auction', label: 'Auction', color: '#c98500' }];
  AN.venue = function (code) { return VEN[code] || VEN[0]; };        // sale codes: 0 VeVe gem market · 1 StackR · 2 auction
  AN.COLORS = { blended: '#0b99ff', veve: '#d95926', stackr: '#199e70', auction: '#c98500', deem: '#6f7080', grid: '#2c2c36', surface: '#1e1e25' };

  // ── formatters ────────────────────────────────────────────────────────────────────────────
  AN.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  AN.money = function (n) {
    if (n == null || isNaN(n)) return '—';
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e5) return s + '$' + Math.round(a / 1e3) + 'K';
    if (a >= 1e4) return s + '$' + (a / 1e3).toFixed(1) + 'K';
    if (a >= 100) return s + '$' + Math.round(a).toLocaleString('en-US');
    return s + '$' + a.toFixed(2);
  };
  AN.num = function (n) { return (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US'); };
  AN.omi = function (n) { return (n == null || isNaN(n) || !n) ? '—' : AN.num(n) + ' OMI'; };
  AN.pct = function (v, d) { return (v == null || isNaN(v)) ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d == null ? 1 : d) + '%'; };
  AN.delta = function (v, suffix) {                         // direction = arrow + sign; colour only reinforces
    if (v == null || isNaN(v)) return '<span class="an-d flat">—</span>';
    var c = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat', ar = c === 'up' ? '▲' : c === 'down' ? '▼' : '■';
    return '<span class="an-d ' + c + '">' + ar + ' ' + Math.abs(v).toFixed(1) + '%' + (suffix ? ' <span style="font-weight:600;color:var(--muted)">' + AN.esc(suffix) + '</span>' : '') + '</span>';
  };
  AN.day = function (ts) { var d = new Date(ts * 1000); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
  AN.ago = function (ts) { var dd = Math.floor((Date.now() / 1000 - ts) / 86400); return dd <= 0 ? 'today' : dd === 1 ? 'yesterday' : dd < 30 ? dd + ' days ago' : AN.day(ts); };
  AN.daysAgo = function (n) { return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 60 ? n + ' days ago' : Math.round(n / 30) + ' months ago'; };
  var UN = { 'dc': 'DC', 'tmnt': 'TMNT', 'blackpink': 'BLACKPINK', 'veve-vibes': 'VeVe Vibes', 'real-world-brand': 'Real-World Brands' };
  AN.uname = function (u) { return UN[u] || String(u || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };

  // ── items ─────────────────────────────────────────────────────────────────────────────────
  AN.items = []; AN.byTid = {}; AN.bySlug = {}; var byKey = {};
  CAT.forEach(function (c) {
    if (!c.tid) return;
    c._a = A.items[c.tid] || null;
    AN.items.push(c); AN.byTid[c.tid] = c; AN.bySlug[c.slug] = c;
    var k = norm(c.name); (byKey[k] = byKey[k] || []).push(c);
  });

  /* ASKS — cheapest live listing per venue, vanity/troll asks removed. Never a value. StackR also in OMI. */
  AN.asks = function (c) {
    var a = c._a, corr = a ? a.t30 : 0, st = FL.byTid && FL.byTid[c.tid];
    var veve = g.saneVeveFloor ? g.saneVeveFloor(c.floor, corr) : (+c.floor || 0);
    var stackr = (st && st.usd > 0) ? (g.saneStackrFloor ? g.saneStackrFloor(st.usd, corr) : st.usd) : 0;
    var best = null;
    if (veve > 0) best = { usd: veve, venue: 'VeVe', key: 'veve', code: 0 };
    if (stackr > 0 && (!best || stackr < best.usd)) best = { usd: stackr, venue: 'StackR', key: 'stackr', code: 1 };
    return { veve: veve, stackr: stackr, omi: stackr && st ? st.omi : 0, listings: st ? st.listings : 0, best: best, troll: (+c.floor > 0 && !veve) ? +c.floor : 0 };
  };
  /* VALUE — what it actually sells for, across venues. 30-day median of guarded sales → last guarded sale → nothing. */
  AN.value = function (c) {
    var a = c && c._a;
    if (a && a.nt >= 1 && a.t30 > 0) return { v: a.t30, basis: 'traded', thin: a.nt < 5, how: 'median of ' + a.nt + ' sale' + (a.nt === 1 ? '' : 's') + ' in the last 30 days' };
    if (a && a.la) return { v: a.la[1], basis: 'last', thin: true, how: 'last ordinary sale, ' + AN.daysAgo(a.la[0]) + ' — none in the last 30 days' };
    return { v: null, basis: null, thin: true, how: 'no recorded ordinary sale since July 2025' };
  };
  /* Per-venue facts. veve/stackr: { med (USD, 30d), n, last:[ts,usd]|0 }; stackr also { omi: median OMI, omiN, lastOmi }. */
  AN.venues = function (c) {
    var a = (c && c._a) || {}, vm = a.vm || [0, 0, 0, 0, 0, 0], lv = a.lv || [0, 0, 0];
    return { veve: { med: vm[0], n: vm[1], last: lv[0] || null },
             stackr: { med: vm[2], n: vm[3], last: lv[1] || null, omi: a.so || 0, omiN: a.sn || 0, lastOmi: a.slo || null },
             auction: { med: vm[4], n: vm[5], last: lv[2] || null } };
  };
  /* LIKE-FOR-LIKE gap, % — that venue's cheapest ask vs that venue's own 30-day median. StackR in OMI when available. */
  AN.likeGapInfo = function (c, venue, min) {
    min = min || AN.MIN_VENUE_SALES;
    var vn = AN.venues(c), k = AN.asks(c);
    if (venue === 'veve') return (k.veve > 0 && vn.veve.n >= min && vn.veve.med > 0) ? { gap: (k.veve / vn.veve.med - 1) * 100, basis: 'usd', ask: k.veve, ref: vn.veve.med, n: vn.veve.n } : null;
    if (!(k.stackr > 0)) return null;
    if (k.omi > 0 && vn.stackr.omiN >= min && vn.stackr.omi > 0) return { gap: (k.omi / vn.stackr.omi - 1) * 100, basis: 'omi', ask: k.omi, ref: vn.stackr.omi, n: vn.stackr.omiN };
    return (vn.stackr.n >= min && vn.stackr.med > 0) ? { gap: (k.stackr / vn.stackr.med - 1) * 100, basis: 'usd', ask: k.stackr, ref: vn.stackr.med, n: vn.stackr.n } : null;
  };
  AN.likeGap = function (c, venue) { var x = AN.likeGapInfo(c, venue); return x ? x.gap : null; };
  /* "Is the cheapest listing fair?" — the cheapest ask, judged on its own venue. */
  AN.gap = function (c) { var k = AN.asks(c); return k.best ? AN.likeGap(c, k.best.key) : null; };
  /* Market-wide facts behind copy — computed on every load, never typed in. */
  AN.facts = function () {
    if (AN._facts) return AN._facts;
    var r = [];
    AN.items.forEach(function (c) { var x = AN.likeGapInfo(c, 'veve'); if (x) r.push(x.ask / x.ref); });
    r.sort(function (a, b) { return a - b; });
    return (AN._facts = { veveAskToSale: r.length ? r[r.length >> 1] : null, veveAskItems: r.length, venueGap: (A.market && A.market.venueGap) || null,
                          liquidity: (A.market && A.market.liquidity) || null, omi: (A.market && A.market.omi) || null });
  };
  /* Match an on-chain holding to a catalog item: name, then edition size, then rarity. Still ambiguous → null (left unvalued). */
  AN.matchHolding = function (h) {
    var list = byKey[h.nameKey] || byKey[norm(h.name)] || [];
    if (list.length < 2) return list[0] || null;
    var byEd = h.editionSize ? list.filter(function (c) { return (c.edition || c.issued) === h.editionSize; }) : [];
    if (byEd.length === 1) return byEd[0];
    var pool = byEd.length ? byEd : list, byR = pool.filter(function (c) { return norm(c.rarity) === h.rarityKey; });
    return byR.length === 1 ? byR[0] : null;
  };
  /* Synthetic sample vault (deterministic). Never a real person's wallet. Two rows hold the lowest public mint. */
  AN.samplePortfolio = function () {
    var pool = AN.items.filter(function (c) { return c._a && c._a.nt >= 2 && c.edition > 200 && !c.blind; }).sort(function (x, y) { return x.slug < y.slug ? -1 : 1; });
    var out = [], step = Math.max(1, Math.floor(pool.length / 26));
    for (var i = 3; i < pool.length && out.length < 26; i += step) {
      var c = pool[i], low = (out.length === 2 || out.length === 11) && c.lowmint;
      out.push({ c: c, mint: low ? c.lowmint : 41 + ((i * 97) % Math.max(1, c.edition - 41)), qty: (out.length % 9 === 4) ? 2 : 1 });
    }
    return out;
  };
  /* Special mints listed now (handle-free projection built by gen_analytics.py). */
  AN.specials = function () {
    if (AN._sp) return AN._sp;
    return (AN._sp = (A.specials || []).map(function (s) { return { c: AN.byTid[s[0]], mint: s[1], usd: s[2], price: s[3], code: s[4], label: s[5], cats: s[6] || [] }; }).filter(function (x) { return x.c; }));
  };

  // ── small UI builders (return HTML strings; every data string goes through AN.esc) ─────────────
  AN.thumb = function (c, size) { size = size || 40; var u = (c && c.img && /^https:\/\//.test(c.img)) ? "url('" + AN.esc(String(c.img).replace(/['()\\\s]/g, '')) + "')" : 'none'; return '<span class="an-thumb" style="width:' + size + 'px;height:' + size + 'px;background-image:' + u + '"></span>'; };
  AN.itemHref = function (c) { return '#/item/' + encodeURIComponent(c.slug); };
  AN.itemRow = function (c, rightHtml, metaHtml) {
    return '<a class="an-row" href="' + AN.itemHref(c) + '">' + AN.thumb(c, 40) + '<span class="t"><b>' + AN.esc(c.name) + '</b><small>' +
      (metaHtml != null ? metaHtml : AN.esc([c.rarity, AN.uname(c.universe)].filter(Boolean).join(' · '))) + '</small></span><span class="r">' + (rightHtml || '') + '</span></a>';
  };
  AN.kpi = function (label, valueHtml, subHtml, extraHtml) { return '<div class="an-kpi"><div class="l">' + AN.esc(label) + '</div><div class="v">' + valueHtml + '</div>' + (subHtml ? '<div class="s">' + subHtml + '</div>' : '') + (extraHtml || '') + '</div>'; };
  AN.h = function (title, subHtml) { return '<div class="an-h"><h2>' + AN.esc(title) + '</h2>' + (subHtml ? '<small>' + subHtml + '</small>' : '') + '</div>'; };
  AN.note = function (html) { return '<div class="an-note">' + html + '</div>'; };
  AN.chip = function (text, tone) { return '<span class="an-chip' + (tone ? ' ' + tone : '') + '">' + AN.esc(text) + '</span>'; };
  AN.venueDot = function (code) { var v = AN.venue(code); return '<span class="an-dot" style="background:' + v.color + '" aria-hidden="true"></span>' + v.label; };
  AN.compare = function (rows) {            // [{label, value, color, fmt}] — colour = venue identity; no colour = context (gray)
    var mx = Math.max.apply(null, rows.map(function (r) { return r.value || 0; })) || 1;
    return '<div class="an-cmp">' + rows.map(function (r) {
      return '<div class="row"><span class="lbl">' + AN.esc(r.label) + '</span><span><span class="bar" style="display:block;width:' + Math.max(1, (r.value || 0) / mx * 100).toFixed(1) + '%' + (r.color ? ';background:' + r.color : '') + '"></span></span><span class="val">' + AN.esc((r.fmt || AN.money)(r.value)) + '</span></div>';
    }).join('') + '</div>';
  };
  AN.split = function (parts) {             // part-to-whole: [{label, value, color}] → stacked bar (2px surface gaps) + labelled legend
    var tot = parts.reduce(function (s, p) { return s + (p.value || 0); }, 0) || 1;
    return '<div class="an-split" role="img" aria-label="' + AN.esc(parts.map(function (p) { return p.label + ' ' + Math.round(p.value / tot * 100) + '%'; }).join(', ')) + '">' +
      parts.map(function (p) { return '<i style="flex:' + Math.max(0.5, p.value / tot * 100).toFixed(2) + ';background:' + p.color + '"></i>'; }).join('') + '</div><div class="an-legend">' +
      parts.map(function (p) { return '<span><i class="box" style="background:' + p.color + '"></i>' + AN.esc(p.label) + ' <b style="color:var(--text)">' + AN.num(p.value) + '</b> · ' + Math.round(p.value / tot * 100) + '%</span>'; }).join('') + '</div>';
  };
  /* localStorage is per-origin but shared by every page on github.io — validate EVERYTHING read back. */
  AN.store = {
    raw: function (k) { try { var v = localStorage.getItem('an.' + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } },
    set: function (k, v) { try { localStorage.setItem('an.' + k, JSON.stringify(v)); } catch (e) {} },
    bool: function (k, d) { var v = AN.store.raw(k); return typeof v === 'boolean' ? v : d; },
    ints: function (k, d) { var v = AN.store.raw(k); return Array.isArray(v) ? v.map(Number).filter(function (n) { return Number.isInteger(n) && n > 0 && n < 1e6; }) : d; },
    watch: function () {
      var v = AN.store.raw('watch'); if (!Array.isArray(v)) return [];
      return v.filter(function (x) { return x && typeof x.tid === 'string' && AN.byTid[x.tid]; })
              .map(function (x) { return { tid: x.tid, below: Math.max(0, Number(x.below) || 0), under: Math.min(90, Math.max(0, Number(x.under) || 0)) }; });
    }
  };
  var lazy = {};
  AN.lazy = function (name) {               // lazily load a dataset (hour-bucketed cache key)
    if (lazy[name]) return lazy[name];
    return (lazy[name] = new Promise(function (res) { var s = document.createElement('script'); s.src = 'data/' + name + '.js?v=' + Math.floor(Date.now() / 3600000); s.onload = function () { res(true); }; s.onerror = function () { res(false); }; document.head.appendChild(s); }));
  };

  // ── charts (inline SVG; crosshair + tooltip, keyboard, touch, table view; tooltip text via textContent) ──
  var tt, redraws = [], uid = 0;
  function showTT(x, y, lines) {
    if (!tt) { tt = document.createElement('div'); tt.className = 'an-tt'; tt.setAttribute('role', 'status'); document.body.appendChild(tt); }
    tt.textContent = '';
    lines.forEach(function (ln, i) {
      var row = document.createElement('div'); row.className = 'ttr';
      if (ln.color) { var k = document.createElement('i'); k.style.background = ln.color; row.appendChild(k); }
      var b = document.createElement('b'); b.textContent = ln.value; row.appendChild(b);
      if (ln.label) { var s = document.createElement('span'); s.textContent = ' ' + ln.label; row.appendChild(s); }
      tt.appendChild(row);
    });
    tt.hidden = false;
    tt.style.left = Math.min(window.innerWidth - tt.offsetWidth - 8, Math.max(8, x + 14)) + 'px';
    tt.style.top = Math.max(8, y - tt.offsetHeight - 12) + 'px';
  }
  function hideTT() { if (tt) tt.hidden = true; }
  function ticks(lo, hi, n) {
    var span = (hi - lo) || 1, step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10)), err = span / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var t = [], v = Math.ceil(lo / step) * step;
    for (; v <= hi + step * 1e-6; v += step) t.push(+v.toFixed(6));
    return t;
  }
  /* table-view twin: head = ['Period', 'Series A', …], rows = [['label', 'a', …], …] */
  function tableToggle(host, head, rows) {
    var id = 'an-tbl-' + (++uid), btn = document.createElement('button'); btn.className = 'an-linkbtn'; btn.type = 'button'; btn.textContent = 'View as table';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
    var box = document.createElement('div'); box.className = 'an-scroll'; box.hidden = true; box.id = id;
    box.innerHTML = '<table class="an-table"><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="n"' : '') + '>' + AN.esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="n"' : '') + '>' + AN.esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    btn.addEventListener('click', function () { box.hidden = !box.hidden; btn.textContent = box.hidden ? 'View as table' : 'Hide table'; btn.setAttribute('aria-expanded', String(!box.hidden)); });
    host.appendChild(btn); host.appendChild(box);
  }
  function interactive(wrap, n, lineFor, markY) {
    var cur = -1;
    function leave() {
      hideTT(); cur = -1;
      wrap.querySelectorAll('.xh,.xd').forEach(function (e) { e.setAttribute('visibility', 'hidden'); });
      wrap.querySelectorAll('.col').forEach(function (e) { e.setAttribute('opacity', e.getAttribute('data-op') || '1'); });
    }
    function at(i, cx, cy) {
      var q = wrap._geo; if (!q) return;
      cur = Math.max(0, Math.min(n - 1, i)); var x = q.X(cur), r = wrap.getBoundingClientRect(), k = r.width / q.W, info = lineFor(cur);
      var xh = wrap.querySelector('.xh'); if (xh) { xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible'); }
      wrap.querySelectorAll('.xd').forEach(function (d, si) { var y = markY ? markY(si, cur) : null; if (y != null) { d.setAttribute('cx', x); d.setAttribute('cy', y); d.setAttribute('visibility', 'visible'); } else d.setAttribute('visibility', 'hidden'); });
      wrap.querySelectorAll('.col').forEach(function (e, m) { e.setAttribute('opacity', m === cur ? '1' : '.5'); });
      showTT(cx != null ? cx : r.left + x * k, cy != null ? cy : r.top + q.T * k + 20, info);
    }
    function fromEvent(e) { var q = wrap._geo; if (!q) return; var r = wrap.getBoundingClientRect(), x = (e.clientX - r.left) / (r.width / q.W); if (x < q.L - 8 || x > q.L + q.iw + 8) { leave(); return; } at(Math.round((x - q.L) / q.iw * q.n), e.clientX, e.clientY); }
    wrap.addEventListener('pointermove', fromEvent);
    wrap.addEventListener('pointerdown', fromEvent);                                  // touch: tap / scrub reveals the value
    wrap.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') leave(); });
    document.addEventListener('pointerdown', function (e) { if (cur >= 0 && !wrap.contains(e.target)) leave(); });
    wrap.addEventListener('blur', leave);
    wrap.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); at(cur < 0 ? n - 1 : cur + (e.key === 'ArrowRight' ? 1 : -1)); } else if (e.key === 'Escape') leave(); });
  }
  function chartWrap(host, label) {
    host.innerHTML = '';
    var wrap = document.createElement('div'); wrap.className = 'an-chart'; wrap.tabIndex = 0; wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', label);
    host.appendChild(wrap); return wrap;
  }
  /* Price lines, one y-axis, no area fill (the axis does not start at zero). cfg: { x:[{x, xl}], series:[{name, color, ys:[number|0]}], fmt, h }.
     A value <= 0 means "no trades": the line BREAKS — it is never interpolated. >= 2 series → legend + direct end labels. */
  AN.lineChart = function (host, cfg) {
    var X0 = cfg.x || [], S = (cfg.series || []).filter(function (s) { return s.ys.filter(function (v) { return v > 0; }).length >= 2; }), fmt = cfg.fmt || AN.money;
    if (!S.length) { host.innerHTML = '<div class="an-empty">Not enough trades in this window to draw a trend.</div>'; return; }
    var wrap = chartWrap(host, (S.length > 1 ? S.map(function (s) { return s.name; }).join(' and ') : S[0].name) + ' over time. Arrow keys read the values; a table view follows.');
    function draw() {
      var W = Math.max(280, wrap.clientWidth || 600), H = cfg.h || 230, L = 54, R = 70, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
      var ys = []; S.forEach(function (s) { s.ys.forEach(function (v) { if (v > 0) ys.push(v); }); });
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), pad = (hi - lo) * 0.14 || hi * 0.1 || 1; lo = Math.max(0, lo - pad); hi += pad;
      var n = (X0.length - 1) || 1, X = function (i) { return L + i / n * iw; }, Y = function (v) { return T + ih - (v - lo) / (hi - lo) * ih; };
      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">';
      ticks(lo, hi, 4).forEach(function (t) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="#2c2c36" stroke-width="1"/><text class="ax" x="' + (L - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + AN.esc(fmt(t)) + '</text>'; });
      [0, Math.round(n / 2), n].forEach(function (i, k) { if (X0[i]) s += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '">' + AN.esc(X0[i].x) + '</text>'; });
      var ends = [];
      S.forEach(function (sr) {
        var seg = [], segs = []; sr.ys.forEach(function (v, i) { if (v > 0) seg.push([X(i), Y(v)]); else if (seg.length) { segs.push(seg); seg = []; } }); if (seg.length) segs.push(seg);
        segs.forEach(function (sg) {
          if (sg.length === 1) { s += '<circle cx="' + sg[0][0].toFixed(1) + '" cy="' + sg[0][1].toFixed(1) + '" r="3" fill="' + sr.color + '"/>'; return; }
          s += '<path d="' + sg.map(function (q, k) { return (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ') + '" fill="none" stroke="' + sr.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        });
        var li = sr.ys.length - 1; while (li > 0 && !(sr.ys[li] > 0)) li--;
        if (sr.ys[li] > 0) { s += '<circle cx="' + X(li).toFixed(1) + '" cy="' + Y(sr.ys[li]).toFixed(1) + '" r="4.5" fill="' + sr.color + '" stroke="#1e1e25" stroke-width="2"/>'; ends.push({ y: Y(sr.ys[li]), x: X(li), t: fmt(sr.ys[li]) }); }
      });
      if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) { var mid = (ends[0].y + ends[1].y) / 2, up = ends[0].y <= ends[1].y ? 0 : 1; ends[up].y = mid - 8; ends[1 - up].y = mid + 8; }
      ends.forEach(function (e) { s += '<text class="lab" x="' + (e.x + 9).toFixed(1) + '" y="' + (e.y + 4).toFixed(1) + '">' + AN.esc(e.t) + '</text>'; });
      s += '<line class="xh" y1="' + T + '" y2="' + (T + ih) + '" stroke="#9d9ca0" stroke-width="1" visibility="hidden"/>' + S.map(function (sr) { return '<circle class="xd" r="4.5" fill="' + sr.color + '" stroke="#1e1e25" stroke-width="2" visibility="hidden"/>'; }).join('') + '</svg>';
      wrap.innerHTML = s; wrap._geo = { W: W, L: L, iw: iw, n: n, T: T, X: X, Y: Y };
    }
    draw();
    interactive(wrap, X0.length, function (i) {
      var out = [{ value: X0[i].xl || X0[i].x, label: '' }];
      S.forEach(function (sr) { out.push({ color: S.length > 1 ? sr.color : null, value: sr.ys[i] > 0 ? fmt(sr.ys[i]) : 'no trades', label: sr.name }); });
      return out;
    }, function (si, i) { var v = S[si].ys[i]; return v > 0 ? wrap._geo.Y(v) : null; });
    redraws.push(function () { if (document.body.contains(wrap)) draw(); });
    if (S.length > 1) { var lg = document.createElement('div'); lg.className = 'an-legend'; lg.innerHTML = S.map(function (sr) { return '<span><i style="background:' + sr.color + '"></i>' + AN.esc(sr.name) + '</span>'; }).join(''); host.appendChild(lg); }
    tableToggle(host, ['Period'].concat(S.map(function (s) { return s.name; })), X0.map(function (p, i) { return [p.xl || p.x].concat(S.map(function (s) { return s.ys[i] > 0 ? fmt(s.ys[i]) : 'no trades'; })); }));
  };
  /* Single-series columns from a zero baseline. cfg: { pts:[{x, xl, y, partial}], name, fmt, h, extra:{head, cells(p)} } */
  AN.columns = function (host, cfg) {
    var pts = cfg.pts || [], fmt = cfg.fmt || AN.num;
    if (!pts.length) { host.innerHTML = '<div class="an-empty">No data.</div>'; return; }
    var wrap = chartWrap(host, (cfg.name || 'Value') + ' per period, ' + pts.length + ' columns. Arrow keys read the values; a table view follows.');
    function draw() {
      var W = Math.max(280, wrap.clientWidth || 600), H = cfg.h || 190, L = 44, R = 10, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
      var hi = Math.max.apply(null, pts.map(function (p) { return p.y || 0; })) * 1.08 || 1, n = pts.length, slot = iw / n, bw = Math.max(1, Math.min(24, slot - 2));
      var X = function (i) { return L + slot * i + slot / 2; }, Y = function (v) { return T + ih - v / hi * ih; };
      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">';
      ticks(0, hi, 3).forEach(function (t) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="#2c2c36" stroke-width="1"/><text class="ax" x="' + (L - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + AN.esc(fmt(t)) + '</text>'; });
      pts.forEach(function (p, i) {
        var y = Y(p.y || 0), x = X(i) - bw / 2, r = Math.min(4, bw / 2, Math.max(0, T + ih - y)), op = p.partial ? '.4' : '1';
        s += '<path class="col" data-op="' + op + '" opacity="' + op + '" d="M' + x.toFixed(1) + ' ' + (T + ih) + ' V' + (y + r).toFixed(1) + ' Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ' ' + y.toFixed(1) + ' H' + (x + bw - r).toFixed(1) + ' Q' + (x + bw).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + bw).toFixed(1) + ' ' + (y + r).toFixed(1) + ' V' + (T + ih) + ' Z" fill="' + (cfg.color || AN.COLORS.blended) + '"/>';
      });
      [0, Math.round((n - 1) / 2), n - 1].forEach(function (i, k) { if (pts[i]) s += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '">' + AN.esc(pts[i].x) + '</text>'; });
      s += '</svg>'; wrap.innerHTML = s;
      wrap._geo = { W: W, L: L + slot / 2, iw: iw - slot, n: (n - 1) || 1, T: T, X: X, Y: Y };
    }
    draw();
    interactive(wrap, pts.length, function (i) { var p = pts[i]; return [{ value: fmt(p.y), label: (cfg.name || '') + ' · ' + (p.xl || p.x) }]; });
    redraws.push(function () { if (document.body.contains(wrap)) draw(); });
    var ex = cfg.extra;
    tableToggle(host, ['Period', cfg.name || 'Value'].concat(ex ? ex.head : []), pts.map(function (p) { return [p.xl || p.x, fmt(p.y)].concat(ex ? ex.cells(p) : []); }));
  };
  /* Sparkline for a stat tile: de-emphasis line (2px), current point in the accent; zeros break the line. */
  AN.spark = function (vals, o) {
    o = o || {}; var w = o.w || 120, h = o.h || 28, pos = (vals || []).filter(function (v) { return v > 0; });
    if (pos.length < 2) return '';
    var n = (vals.length - 1) || 1, lo = Math.min.apply(null, pos), sp = (Math.max.apply(null, pos) - lo) || 1;
    var X = function (i) { return 3 + i / n * (w - 8); }, Y = function (v) { return h - 4 - (v - lo) / sp * (h - 8); }, d = '', pen = false, li = -1;
    vals.forEach(function (v, i) { if (v > 0) { d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; li = i; } else pen = false; });
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + AN.esc(o.label || 'trend') + '"><path d="' + d +
      '" fill="none" stroke="#6f7080" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + X(li).toFixed(1) + '" cy="' + Y(vals[li]).toFixed(1) + '" r="3" fill="#0b99ff" stroke="#1e1e25" stroke-width="1.5"/></svg>';
  };
  var rz; g.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { redraws.forEach(function (f) { f(); }); }, 120); });

  // ── search (accessible combobox) ──────────────────────────────────────────────────────────
  AN.search = function (q, limit) {
    var toks = norm(q).split(' ').filter(Boolean); if (!toks.length || toks.join('').length < 2) return [];
    var out = [];
    for (var i = 0; i < AN.items.length; i++) {
      var c = AN.items[i], n = c._n || (c._n = norm(c.name + ' ' + (c.character || '') + ' ' + (c.universe || ''))), ok = true, p0 = n.indexOf(toks[0]);
      for (var t = 0; t < toks.length && ok; t++) if (n.indexOf(toks[t]) < 0) ok = false;
      if (!ok) continue;
      out.push([(p0 === 0 ? 0 : n.charAt(p0 - 1) === ' ' ? 1 : 2) * 100000 - Math.min(99999, c._a ? c._a.n30 : 0), c]);
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out.slice(0, limit || 8).map(function (x) { return x[1]; });
  };
  function initSearch() {
    var inp = document.getElementById('an-q'), box = document.getElementById('an-sug'), res = [], sel = -1;
    if (!inp || !box) return;
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
    function close() { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); }
    function paint() {
      if (!res.length) { close(); return; }
      box.innerHTML = res.map(function (c, i) {
        var v = AN.value(c);
        return '<a role="option" id="an-opt-' + i + '" aria-selected="' + (i === sel) + '" href="' + AN.itemHref(c) + '" class="' + (i === sel ? 'on' : '') + '">' + AN.thumb(c, 34) + '<span class="t"><b>' + AN.esc(c.name) + '</b><small>' + AN.esc([c.rarity, AN.uname(c.universe)].filter(Boolean).join(' · ')) + '</small></span><span class="v">' + (v.v ? AN.money(v.v) : '<span style="color:var(--muted);font-weight:600">no sales</span>') + '</span></a>';
      }).join(''); box.hidden = false; inp.setAttribute('aria-expanded', 'true');
      if (sel >= 0) inp.setAttribute('aria-activedescendant', 'an-opt-' + sel);
    }
    inp.addEventListener('input', function () { res = AN.search(inp.value); sel = res.length ? 0 : -1; paint(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(res.length - 1, sel + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
      else if (e.key === 'Enter' && res[sel]) { location.hash = AN.itemHref(res[sel]); inp.value = ''; res = []; paint(); inp.blur(); }
      else if (e.key === 'Escape') { res = []; paint(); }
    });
    box.addEventListener('click', function () { inp.value = ''; res = []; setTimeout(paint, 0); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.an-search')) close(); });
    inp.addEventListener('focus', function () { if (res.length) paint(); });
  }

  // ── router ────────────────────────────────────────────────────────────────────────────────
  AN.view = function (name, def) { AN.views[name] = def; };
  AN.start = function () {
    var root = document.getElementById('an-root'), asof = document.getElementById('an-asof'), first = true;
    root.setAttribute('tabindex', '-1');
    if (asof && A.asOf) asof.textContent = 'Trade data as of ' + new Date(A.asOf * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '.';
    initSearch();
    function route() {
      var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean), name = parts[0] || 'overview', v = AN.views[name];
      redraws.length = 0; hideTT();
      document.querySelectorAll('#an-tabs a').forEach(function (a) {
        var on = a.getAttribute('data-v') === name; a.classList.toggle('on', on);
        if (on) { a.setAttribute('aria-current', 'page'); if (a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else a.removeAttribute('aria-current');
      });
      root.className = 'an-wrap an-view an-view-' + name.replace(/[^a-z]/g, '');
      if (!v) { root.innerHTML = '<div class="an-empty">This section is not built yet.</div>'; return; }
      document.title = (v.title ? v.title + ' — ' : '') + 'StackR Analytics (concept)';
      try { v.render(root, parts.slice(1).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } })); }
      catch (e) { root.innerHTML = '<div class="an-empty">Something went wrong rendering this section.</div>'; if (g.console) console.error(e); }
      g.scrollTo(0, 0);
      if (!first && root.focus) root.focus({ preventScroll: true });     // announce the new view to keyboard / screen-reader users
      first = false;
    }
    g.addEventListener('hashchange', route); route();
  };
})(window);
