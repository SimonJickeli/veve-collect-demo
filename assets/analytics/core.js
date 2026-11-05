/* StackR Analytics — concept prototype · core: data layer, honest-value rules, formatters, charts, router.
   Views register with AN.view(name, { title, render(root, params) }) — see tools/analytics_proto_contract.md.
   RULE OF THE HOUSE: a VALUE is always derived from completed sales. An ASK is only ever shown as an ask. */
(function (g) {
  'use strict';
  var A = g.ANALYTICS || { items: {}, market: { daily: [], venue30: {}, auction: { recent: [] } }, months: [], asOf: 0 };
  var CAT = (g.CATALOG && g.CATALOG.items) || [];
  var FL = g.FLOOR || { byTid: {}, omiUsd: 0 };
  var norm = g.normName || function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var AN = g.AN = { A: A, views: {}, norm: norm };

  // venue identity — validated dark-mode categorical palette (fixed order, never re-assigned)
  var VEN = [{ label: 'VeVe', color: '#d95926' }, { label: 'StackR', color: '#0b99ff' }, { label: 'Auction', color: '#199e70' }];
  AN.venue = function (code) { return VEN[code] || VEN[0]; };          // ANALYTICS sale codes: 0 VeVe fixed · 1 StackR · 2 auction
  AN.COLORS = { stackr: '#0b99ff', veve: '#d95926', auction: '#199e70', deem: '#6f7080', accent: '#0b99ff', grid: '#2c2c36', surface: '#1e1e25' };

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
  AN.pct = function (v, d) { return (v == null || isNaN(v)) ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d == null ? 1 : d) + '%'; };
  AN.delta = function (v, suffix) {                         // direction is carried by arrow + sign, colour only reinforces
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

  /* ASKS — cheapest live listing per venue, vanity/troll asks removed. Never a value. */
  AN.asks = function (c) {
    var a = c._a, corr = a ? a.t30 : 0, st = FL.byTid && FL.byTid[c.tid];
    var veve = g.saneVeveFloor ? g.saneVeveFloor(c.floor, corr) : (+c.floor || 0);
    var stackr = (st && st.usd > 0) ? (g.saneStackrFloor ? g.saneStackrFloor(st.usd, corr) : st.usd) : 0;
    var best = null;
    if (veve > 0) best = { usd: veve, venue: 'VeVe' };
    if (stackr > 0 && (!best || stackr < best.usd)) best = { usd: stackr, venue: 'StackR' };
    return { veve: veve, stackr: stackr, omi: st ? st.omi : 0, listings: st ? st.listings : 0, best: best, troll: (+c.floor > 0 && !veve) ? +c.floor : 0 };
  };
  /* VALUE — what it actually sells for. traded (30d median, floor-item basis) → last sale → nothing. NEVER an ask. */
  AN.value = function (c) {
    var a = c && c._a;
    if (a && a.n30 >= 1 && a.t30 > 0) return { v: a.t30, basis: 'traded', thin: a.n30 < 5, how: 'median of ' + a.n30 + ' real sale' + (a.n30 === 1 ? '' : 's') + ' in the last 30 days' };
    if (a && a.last) return { v: a.last[1], basis: 'last', thin: true, how: 'last sale, ' + AN.daysAgo(a.last[0]) + ' — no trade in the last 30 days' };
    return { v: null, basis: null, thin: true, how: 'no recorded sale since July 2025' };
  };
  /* TWO-PRICE MARKET — the same item trades at different dollar prices on the VeVe gem market and on StackR
     (OMI). Compare like with like: a venue's ask against that venue's own sales. */
  AN.venues = function (c) {
    var vm = (c && c._a && c._a.vm) || [0, 0, 0, 0, 0, 0], l = (c && c._a && c._a.l) || [];
    function lastOf(code) { for (var i = 0; i < l.length; i++) if (l[i][2] === code) return l[i]; return null; }
    return { veve: { med: vm[0], n: vm[1], last: lastOf(0) }, stackr: { med: vm[2], n: vm[3], last: lastOf(1) }, auction: { med: vm[4], n: vm[5], last: lastOf(2) } };
  };
  AN.MIN_VENUE_SALES = 3;
  /* like-for-like gap, %: that venue's cheapest ask vs that venue's 30-day median sale. null without 3+ sales or an ask. */
  AN.likeGap = function (c, venue) {
    var vs = AN.venues(c)[venue], k = AN.asks(c), ask = venue === 'veve' ? k.veve : k.stackr;
    return (vs && vs.n >= AN.MIN_VENUE_SALES && vs.med > 0 && ask > 0) ? (ask / vs.med - 1) * 100 : null;
  };
  /* GAP for "is the cheapest listing fair?": the cheapest ask, judged against its OWN venue's sales. */
  AN.gap = function (c) { var k = AN.asks(c); return k.best ? AN.likeGap(c, k.best.venue === 'VeVe' ? 'veve' : 'stackr') : null; };
  /* Market-wide facts behind the page copy — computed from the shipped data on every load, never typed in. */
  AN.facts = function () {
    if (AN._facts) return AN._facts;
    var veveAsk = 0, veveTrade = 0, n = 0, raw = 0;
    AN.items.forEach(function (c) {
      var a = c._a, sup = c.circ || c.issued || c.edition || 0; raw += (+c.floor || 0) * sup;
      if (!a || !(a.n30 > 0) || !(a.t30 > 0) || !sup) return;
      var v = g.saneVeveFloor ? g.saneVeveFloor(c.floor, a.t30) : 0; if (!v) return;
      veveAsk += v * sup; veveTrade += a.t30 * sup; n++;
    });
    return (AN._facts = { veveFloorRatio: veveTrade ? veveAsk / veveTrade : null, veveFloorItems: n, rawFloorCap: raw, venueGap: (A.market && A.market.venueGap) || null });
  };
  /* Match an on-chain holding (COLLECTSCAN.fetchHoldings item) to a catalog item — by normalized name, rarity breaks ties. */
  AN.matchHolding = function (h) {
    var list = byKey[h.nameKey] || byKey[norm(h.name)] || [];
    if (list.length < 2) return list[0] || null;
    for (var i = 0; i < list.length; i++) if (norm(list[i].rarity) === h.rarityKey) return list[i];
    return list[0];
  };
  /* Synthetic sample vault (deterministic). The prototype never shows a real person's wallet as a sample. */
  AN.samplePortfolio = function () {
    var pool = AN.items.filter(function (c) { return c._a && c._a.n30 >= 2 && c.edition > 200 && !c.blind; }).sort(function (x, y) { return x.slug < y.slug ? -1 : 1; });
    var out = [], step = Math.max(1, Math.floor(pool.length / 26));
    for (var i = 3; i < pool.length && out.length < 26; i += step) {
      var c = pool[i]; out.push({ c: c, mint: 41 + ((i * 97) % Math.max(1, c.edition - 41)), qty: (out.length % 9 === 4) ? 2 : 1 });
    }
    return out;
  };

  // ── small UI builders (return HTML strings; every data string goes through AN.esc) ─────────────
  AN.thumb = function (c, size) { size = size || 40; var u = (c && c.img) ? "url('" + AN.esc(String(c.img).replace(/['()\\]/g, '')) + "')" : 'none'; return '<span class="an-thumb" style="width:' + size + 'px;height:' + size + 'px;background-image:' + u + '"></span>'; };
  AN.itemHref = function (c) { return '#/item/' + encodeURIComponent(c.slug); };
  AN.itemRow = function (c, rightHtml, metaHtml) {
    return '<a class="an-row" href="' + AN.itemHref(c) + '">' + AN.thumb(c, 40) + '<span class="t"><b>' + AN.esc(c.name) + '</b><small>' +
      (metaHtml != null ? metaHtml : AN.esc([c.rarity, AN.uname(c.universe)].filter(Boolean).join(' · '))) + '</small></span><span class="r">' + (rightHtml || '') + '</span></a>';
  };
  AN.kpi = function (label, valueHtml, subHtml, extraHtml) { return '<div class="an-kpi"><div class="l">' + AN.esc(label) + '</div><div class="v">' + valueHtml + '</div>' + (subHtml ? '<div class="s">' + subHtml + '</div>' : '') + (extraHtml || '') + '</div>'; };
  AN.h = function (title, subHtml) { return '<div class="an-h"><h2>' + AN.esc(title) + '</h2>' + (subHtml ? '<small>' + subHtml + '</small>' : '') + '</div>'; };
  AN.note = function (html) { return '<div class="an-note">' + html + '</div>'; };
  AN.chip = function (text, tone) { return '<span class="an-chip' + (tone ? ' ' + tone : '') + '">' + AN.esc(text) + '</span>'; };
  AN.venueDot = function (code) { var v = AN.venue(code); return '<span class="an-dot" style="background:' + v.color + '"></span>' + v.label; };
  AN.compare = function (rows) {            // [{label, value, acc, color, fmt}] — emphasis: accent = the point, gray = context; color = venue identity
    var mx = Math.max.apply(null, rows.map(function (r) { return r.value || 0; })) || 1;
    return '<div class="an-cmp">' + rows.map(function (r) {
      return '<div class="row"><span class="lbl">' + AN.esc(r.label) + '</span><span><span class="bar' + (r.acc ? ' acc' : '') + '" style="display:block;width:' + Math.max(1, (r.value || 0) / mx * 100).toFixed(1) + '%' + (r.color ? ';background:' + r.color : '') + '"></span></span><span class="val">' + AN.esc((r.fmt || AN.money)(r.value)) + '</span></div>';
    }).join('') + '</div>';
  };
  AN.split = function (parts) {             // part-to-whole: [{label, value, color}] → stacked bar (2px surface gaps) + labelled legend
    var tot = parts.reduce(function (s, p) { return s + (p.value || 0); }, 0) || 1;
    return '<div class="an-split" role="img" aria-label="' + AN.esc(parts.map(function (p) { return p.label + ' ' + Math.round(p.value / tot * 100) + '%'; }).join(', ')) + '">' +
      parts.map(function (p) { return '<i style="flex:' + Math.max(0.5, p.value / tot * 100).toFixed(2) + ';background:' + p.color + '"></i>'; }).join('') + '</div><div class="an-legend">' +
      parts.map(function (p) { return '<span><i class="box" style="background:' + p.color + '"></i>' + AN.esc(p.label) + ' <b style="color:var(--text)">' + AN.num(p.value) + '</b> · ' + Math.round(p.value / tot * 100) + '%</span>'; }).join('') + '</div>';
  };
  AN.store = { get: function (k, d) { try { var v = localStorage.getItem('an.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set: function (k, v) { try { localStorage.setItem('an.' + k, JSON.stringify(v)); } catch (e) {} } };
  var lazy = {};
  AN.lazy = function (name) {               // lazily load a big dataset (e.g. 'all_listings'); hour-bucketed cache key
    if (lazy[name]) return lazy[name];
    return (lazy[name] = new Promise(function (res) { var s = document.createElement('script'); s.src = 'data/' + name + '.js?v=' + Math.floor(Date.now() / 3600000); s.onload = function () { res(true); }; s.onerror = function () { res(false); }; document.head.appendChild(s); }));
  };

  // ── charts (inline SVG; crosshair + tooltip, keyboard, table view; tooltip text via textContent) ──
  var tt, redraws = [];
  function showTT(x, y, value, label) {
    if (!tt) { tt = document.createElement('div'); tt.className = 'an-tt'; tt.setAttribute('role', 'status'); document.body.appendChild(tt); }
    tt.textContent = '';
    var b = document.createElement('b'); b.textContent = value; var s = document.createElement('span'); s.textContent = label; tt.appendChild(b); tt.appendChild(s);
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
  function tableToggle(host, head, rows) {
    var btn = document.createElement('button'); btn.className = 'an-linkbtn'; btn.type = 'button'; btn.textContent = 'View as table';
    var box = document.createElement('div'); box.className = 'an-scroll'; box.hidden = true;
    box.innerHTML = '<table class="an-table"><thead><tr><th>' + AN.esc(head[0]) + '</th><th class="n">' + AN.esc(head[1]) + '</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + AN.esc(r[0]) + '</td><td class="n">' + AN.esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
    btn.addEventListener('click', function () { box.hidden = !box.hidden; btn.textContent = box.hidden ? 'View as table' : 'Hide table'; });
    host.appendChild(btn); host.appendChild(box);
  }
  function interactive(wrap, pts, fmt, name, markY) {
    var cur = -1;
    function leave() { hideTT(); cur = -1; var a = wrap.querySelector('.xh'), b = wrap.querySelector('.xd'); if (a) a.setAttribute('visibility', 'hidden'); if (b) b.setAttribute('visibility', 'hidden'); wrap.querySelectorAll('.col.hov').forEach(function (e) { e.classList.remove('hov'); e.setAttribute('opacity', '1'); }); }
    function at(i, cx, cy) {
      var q = wrap._geo; if (!q) return;
      cur = Math.max(0, Math.min(pts.length - 1, i)); var p = pts[cur], x = q.X(cur), r = wrap.getBoundingClientRect(), k = r.width / q.W;
      var xh = wrap.querySelector('.xh'), xd = wrap.querySelector('.xd');
      if (xh) { xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible'); }
      if (xd) { if (p.y > 0 && markY) { xd.setAttribute('cx', x); xd.setAttribute('cy', q.Y(p.y)); xd.setAttribute('visibility', 'visible'); } else xd.setAttribute('visibility', 'hidden'); }
      wrap.querySelectorAll('.col').forEach(function (e, n) { var on = n === cur; e.classList.toggle('hov', on); e.setAttribute('opacity', on ? '1' : '.55'); });
      showTT(cx != null ? cx : r.left + x * k, cy != null ? cy : r.top + (p.y > 0 ? q.Y(p.y) : q.T) * k, p.y > 0 ? fmt(p.y) : 'no trades', (name ? name + ' · ' : '') + (p.xl || p.x));
    }
    wrap.addEventListener('pointermove', function (e) { var q = wrap._geo; if (!q) return; var r = wrap.getBoundingClientRect(), x = (e.clientX - r.left) / (r.width / q.W); if (x < q.L - 8 || x > q.L + q.iw + 8) { leave(); return; } at(Math.round((x - q.L) / q.iw * q.n), e.clientX, e.clientY); });
    wrap.addEventListener('pointerleave', leave); wrap.addEventListener('blur', leave);
    wrap.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); at(cur < 0 ? pts.length - 1 : cur + (e.key === 'ArrowRight' ? 1 : -1)); } else if (e.key === 'Escape') leave(); });
  }
  function chartWrap(host, label) {
    host.innerHTML = '';
    var wrap = document.createElement('div'); wrap.className = 'an-chart'; wrap.tabIndex = 0; wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', label);
    host.appendChild(wrap); return wrap;
  }
  /* Single-series price line. cfg: { pts:[{x, xl?, y}] (y<=0 = no trades → the line BREAKS, it is never interpolated),
     name, fmt, h, ref:{y,label} } */
  AN.lineChart = function (host, cfg) {
    var pts = cfg.pts || [], fmt = cfg.fmt || AN.money, valid = pts.filter(function (p) { return p.y > 0; });
    if (valid.length < 2) { host.innerHTML = '<div class="an-empty">Not enough trades in this window to draw a trend.</div>'; return; }
    var wrap = chartWrap(host, (cfg.name || 'Price') + ' over time, ' + valid.length + ' data points. Arrow keys read the values; a table view follows.');
    function draw() {
      var W = Math.max(280, wrap.clientWidth || 600), H = cfg.h || 230, L = 54, R = 62, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
      var ys = valid.map(function (p) { return p.y; }); if (cfg.ref && cfg.ref.y > 0) ys.push(cfg.ref.y);
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), pad = (hi - lo) * 0.14 || hi * 0.1 || 1; lo = Math.max(0, lo - pad); hi += pad;
      var n = (pts.length - 1) || 1, X = function (i) { return L + i / n * iw; }, Y = function (v) { return T + ih - (v - lo) / (hi - lo) * ih; };
      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">';
      ticks(lo, hi, 4).forEach(function (t) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="#2c2c36" stroke-width="1"/><text class="ax" x="' + (L - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + AN.esc(fmt(t)) + '</text>'; });
      [0, Math.round(n / 2), n].forEach(function (i, k) { if (pts[i]) s += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '">' + AN.esc(pts[i].x) + '</text>'; });
      if (cfg.ref && cfg.ref.y > 0) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(cfg.ref.y).toFixed(1) + '" y2="' + Y(cfg.ref.y).toFixed(1) + '" stroke="#6f7080" stroke-width="1.5"/><text class="ax" x="' + (W - R + 6) + '" y="' + (Y(cfg.ref.y) - 5).toFixed(1) + '">' + AN.esc(cfg.ref.label) + '</text>';
      var seg = [], segs = []; pts.forEach(function (p, i) { if (p.y > 0) seg.push([X(i), Y(p.y)]); else if (seg.length) { segs.push(seg); seg = []; } }); if (seg.length) segs.push(seg);
      segs.forEach(function (sg) {
        if (sg.length === 1) { s += '<circle cx="' + sg[0][0].toFixed(1) + '" cy="' + sg[0][1].toFixed(1) + '" r="2.5" fill="#0b99ff"/>'; return; }
        var d = sg.map(function (q, k) { return (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
        s += '<path d="' + d + ' L' + sg[sg.length - 1][0].toFixed(1) + ' ' + (T + ih) + ' L' + sg[0][0].toFixed(1) + ' ' + (T + ih) + ' Z" fill="#0b99ff" opacity=".10"/>';
        s += '<path d="' + d + '" fill="none" stroke="#0b99ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      });
      var li = pts.length - 1; while (li > 0 && !(pts[li].y > 0)) li--;
      s += '<circle cx="' + X(li).toFixed(1) + '" cy="' + Y(pts[li].y).toFixed(1) + '" r="4.5" fill="#0b99ff" stroke="#1e1e25" stroke-width="2"/><text class="lab" x="' + (X(li) + 9).toFixed(1) + '" y="' + (Y(pts[li].y) + 4).toFixed(1) + '">' + AN.esc(fmt(pts[li].y)) + '</text>';
      s += '<line class="xh" y1="' + T + '" y2="' + (T + ih) + '" stroke="#9d9ca0" stroke-width="1" visibility="hidden"/><circle class="xd" r="4.5" fill="#0b99ff" stroke="#1e1e25" stroke-width="2" visibility="hidden"/></svg>';
      wrap.innerHTML = s; wrap._geo = { W: W, L: L, iw: iw, n: n, T: T, X: X, Y: Y };
    }
    draw(); interactive(wrap, pts, fmt, cfg.name, true); redraws.push(function () { if (document.body.contains(wrap)) draw(); });
    tableToggle(host, ['Period', cfg.name || 'Value'], pts.map(function (p) { return [p.xl || p.x, p.y > 0 ? fmt(p.y) : 'no trades']; }));
  };
  /* Single-series columns from a zero baseline. cfg: { pts:[{x, xl?, y}], name, fmt, h } */
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
        var y = Y(p.y || 0), x = X(i) - bw / 2, r = Math.min(4, bw / 2, Math.max(0, T + ih - y));
        s += '<path class="col" d="M' + x.toFixed(1) + ' ' + (T + ih) + ' V' + (y + r).toFixed(1) + ' Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ' ' + y.toFixed(1) + ' H' + (x + bw - r).toFixed(1) + ' Q' + (x + bw).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + bw).toFixed(1) + ' ' + (y + r).toFixed(1) + ' V' + (T + ih) + ' Z" fill="#0b99ff"/>';
      });
      [0, Math.round((n - 1) / 2), n - 1].forEach(function (i, k) { if (pts[i]) s += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '">' + AN.esc(pts[i].x) + '</text>'; });
      s += '</svg>'; wrap.innerHTML = s;
      wrap._geo = { W: W, L: L + slot / 2, iw: iw - slot, n: (n - 1) || 1, T: T, X: X, Y: Y };
    }
    draw(); interactive(wrap, pts, fmt, cfg.name, false); redraws.push(function () { if (document.body.contains(wrap)) draw(); });
    tableToggle(host, ['Period', cfg.name || 'Value'], pts.map(function (p) { return [p.xl || p.x, fmt(p.y)]; }));
  };
  /* Sparkline for a stat tile: de-emphasis line, current point in the accent. Zeros are gaps. */
  AN.spark = function (vals, o) {
    o = o || {}; var w = o.w || 120, h = o.h || 28, pts = [];
    (vals || []).forEach(function (v, i) { if (v > 0) pts.push([i, v]); });
    if (pts.length < 2) return '';
    var n = (vals.length - 1) || 1, ys = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, ys), sp = (Math.max.apply(null, ys) - lo) || 1;
    var X = function (i) { return 3 + i / n * (w - 8); }, Y = function (v) { return h - 4 - (v - lo) / sp * (h - 8); }, e = pts[pts.length - 1];
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + AN.esc(o.label || 'trend') + '"><path d="' +
      pts.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ') +
      '" fill="none" stroke="#6f7080" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + X(e[0]).toFixed(1) + '" cy="' + Y(e[1]).toFixed(1) + '" r="3" fill="#0b99ff" stroke="#1e1e25" stroke-width="1.5"/></svg>';
  };
  var rz; g.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { redraws.forEach(function (f) { f(); }); }, 120); });

  // ── search ────────────────────────────────────────────────────────────────────────────────
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
    function paint() {
      if (!res.length) { box.hidden = true; return; }
      box.innerHTML = res.map(function (c, i) {
        var v = AN.value(c);
        return '<a role="option" href="' + AN.itemHref(c) + '" class="' + (i === sel ? 'on' : '') + '">' + AN.thumb(c, 34) + '<span class="t"><b>' + AN.esc(c.name) + '</b><small>' + AN.esc([c.rarity, AN.uname(c.universe)].filter(Boolean).join(' · ')) + '</small></span><span class="v">' + (v.v ? AN.money(v.v) : '<span style="color:var(--muted);font-weight:600">no sales</span>') + '</span></a>';
      }).join(''); box.hidden = false;
    }
    inp.addEventListener('input', function () { res = AN.search(inp.value); sel = res.length ? 0 : -1; paint(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(res.length - 1, sel + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
      else if (e.key === 'Enter' && res[sel]) { location.hash = AN.itemHref(res[sel]); inp.value = ''; res = []; paint(); inp.blur(); }
      else if (e.key === 'Escape') { res = []; paint(); }
    });
    box.addEventListener('click', function () { inp.value = ''; res = []; setTimeout(paint, 0); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.an-search')) { box.hidden = true; } });
    inp.addEventListener('focus', function () { if (res.length) box.hidden = false; });
  }

  // ── router ────────────────────────────────────────────────────────────────────────────────
  AN.view = function (name, def) { AN.views[name] = def; };
  AN.go = function (hash) { location.hash = hash; };
  AN.start = function () {
    var root = document.getElementById('an-root'), asof = document.getElementById('an-asof');
    if (asof && A.asOf) asof.textContent = 'Trade data as of ' + new Date(A.asOf * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '.';
    initSearch();
    function route() {
      var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean), name = parts[0] || 'overview', v = AN.views[name];
      redraws.length = 0; hideTT();
      document.querySelectorAll('#an-tabs a').forEach(function (a) { var on = a.getAttribute('data-v') === name; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      root.className = 'an-wrap an-view an-view-' + name.replace(/[^a-z]/g, '');
      if (!v) { root.innerHTML = '<div class="an-empty">This section is not built yet.</div>'; return; }
      document.title = (v.title ? v.title + ' — ' : '') + 'StackR Analytics (concept)';
      try { v.render(root, parts.slice(1).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } })); }
      catch (e) { root.innerHTML = '<div class="an-empty">Something went wrong rendering this section.</div>'; if (g.console) console.error(e); }
      g.scrollTo(0, 0);
    }
    g.addEventListener('hashchange', route); route();
  };
})(window);
