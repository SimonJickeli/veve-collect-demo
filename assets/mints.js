/*
 * mints.js — "Significant / special mint" detection engine, with selectable
 * categories so a collector can filter by what they care about.
 *
 * Categories (LEAN model — kept deliberately tight so "special" stays meaningful):
 *   historic   — THE lowest public mint, THE highest public mint, #1, historical-year matches
 *   low        — Top-5 lowest available mints (incl. THE lowest)
 *   high       — THE highest (final) public mint
 *   palindrome — Palindromes (4+ digits only)
 *   sequence   — Ascending (starts 0/1, e.g. 123/1234 — premium, "better than Rare") /
 *                descending (ends 1, e.g. 321/4321)
 *   meme       — Meme / iconic numbers (#69/#420/#1337) + per-universe easter eggs
 * Deliberately NOT special (too noisy — "too many special mints"): low numbers per se
 * (sub-50/sub-100), 2-digit repeating digits, round/milestone numbers, near-ceiling band.
 *
 * Nothing is invented — every flag is an objective property of the number. The
 * VeVe rule (#1-40 usually reserved → #41 lowest PUBLIC) is configurable via
 * opts.reservedCount.
 */
(function (global) {
  'use strict';

  var TIER_WEIGHT = { legendary: 100, epic: 50, rare: 25, notable: 10 };

  var CATEGORIES = [
    { key: 'historic',   label: 'Historically significant' },
    { key: 'low',        label: 'Lowest mints (top 5)' },
    { key: 'high',       label: 'Highest (final) mint' },
    { key: 'palindrome', label: 'Palindromes (5+ digits)' },
    { key: 'sequence',   label: 'Ascending / descending' },
    { key: 'meme',       label: 'Meme / iconic numbers' }
  ];

  // Universal "meme"/fun numbers collectors chase, regardless of franchise (kept deliberately tight).
  // Franchise-specific easter eggs (e.g. Star Wars #1138) belong in per-universe data, not here.
  var MEME_NUMBERS = { 69: '69 (nice)', 420: '420', 1337: '1337 (leet)' };

  function digits(n) { return String(n); }
  function isRepdigit(s) { return s.length >= 2 && /^(\d)\1+$/.test(s); }
  // Palindromes only count at 5+ digits (e.g. #12321, #123321) — 3-4 digit ones are too common to be notable.
  function isPalindrome(s) { return s.length >= 5 && s === s.split('').reverse().join(''); }
  // Ascending counts ONLY when it starts at 0 or 1 (e.g. 123, 1234, 01234) — not 234/345.
  function isConsecAsc(s) { if (s.length < 3 || (s[0] !== '0' && s[0] !== '1')) return false; for (var i = 1; i < s.length; i++) if (+s[i] !== +s[i - 1] + 1) return false; return true; }
  // Descending counts ONLY when it ends at 1 (e.g. 321, 4321, 54321) — not 543/432.
  function isConsecDesc(s) { if (s.length < 3 || s[s.length - 1] !== '1') return false; for (var i = 1; i < s.length; i++) if (+s[i] !== +s[i - 1] - 1) return false; return true; }
  function isAbab(s) { return s.length === 4 && s[0] === s[2] && s[1] === s[3] && s[0] !== s[1]; }

  /**
   * analyzeMint(mint, editionSize, opts)
   *   opts.firstAppearanceYear : number
   *   opts.reservedCount       : number (default 40)
   *   opts.categories          : string[] — if given, only flags in these categories are returned
   * returns { flags:[{tag,label,tier,cats:[]}], topTier, score, special }
   */
  function analyzeMint(mint, editionSize, opts) {
    opts = opts || {};
    mint = Number(mint);
    editionSize = Number(editionSize) || 0;
    // withheld = editions VeVe retained (excluded from the "public" low-mint pool).
    var withheld = opts.withheld != null ? Number(opts.withheld)
                 : (opts.reservedCount != null ? Number(opts.reservedCount) : 0);
    var firstPublic = opts.firstPublicMint != null ? Number(opts.firstPublicMint) : (withheld + 1);
    var s = digits(mint);
    var flags = [];
    var add = function (tag, label, tier, cats) { flags.push({ tag: tag, label: label, tier: tier, cats: cats }); };

    if (!mint || mint < 1) return { flags: [], topTier: null, score: 0, special: false };

    // ── position: lowest / top-5-lowest / highest — PUBLIC-focused (the core "special" mints) ──
    if (mint === 1 && firstPublic > 1) add('ace', '#1 — the first edition ever (VeVe-reserved #1–' + withheld + ')', 'epic', ['historic', 'low']);
    if (mint === firstPublic) add('lowest-public', '🥇 #' + firstPublic + ' — THE lowest public mint', 'legendary', ['historic', 'low']);
    else if (mint > firstPublic && mint <= firstPublic + 4) add('top5-low', 'Top-5 lowest available mint (#' + firstPublic + '–#' + (firstPublic + 4) + ')', 'epic', ['low']);

    if (editionSize > 0 && mint === editionSize) add('highest-public', '🏁 #' + editionSize + ' — THE highest (final) public mint', 'legendary', ['historic', 'high']);

    // ── sequences — ascending is premium ("better than Rare"); both restricted (asc starts 0/1, desc ends 1) ──
    if (isConsecAsc(s)) add('ascending', 'Ascending run (#' + s + ') — highly prized', 'epic', ['sequence']);
    if (isConsecDesc(s)) add('descending', 'Descending run (#' + s + ')', 'rare', ['sequence']);

    // ── palindrome (4+ digits only) ──
    if (isPalindrome(s)) add('palindrome', 'Palindrome (#' + s + ')', 'rare', ['palindrome']);

    // ── meme / iconic numbers + franchise easter eggs (kept tight) ──
    if (MEME_NUMBERS[mint]) add('meme', 'Meme / iconic number — ' + MEME_NUMBERS[mint], 'rare', ['meme']);
    (opts.universeEggs || []).forEach(function (e) { if (Number(e.mint) === mint) add('meme', 'Franchise easter egg — ' + e.reason, 'rare', ['meme']); });

    // ── historically significant years (character-specific, WITH reasons) ──
    var sigYears = (opts.significantYears || []).slice();
    if (opts.universeYears) sigYears = sigYears.concat(opts.universeYears);
    if (opts.firstAppearanceYear) sigYears.push({ year: Number(opts.firstAppearanceYear), reason: 'first appearance' });
    var sigSeen = {};
    sigYears.forEach(function (sy) {
      var y = Number(sy.year);
      if (mint === y && !sigSeen[y]) {
        sigSeen[y] = 1;
        var t = sy.tier || 'epic';
        var pre = (t === 'legendary') ? '🏆 Grail — ' : 'Historically significant — ';
        add('historic-' + y, pre + sy.reason + ' (' + y + ')', t, ['historic']);
      }
    });

    // dedupe by tag
    var seen = {}, deduped = [];
    flags.forEach(function (f) { if (!seen[f.tag]) { seen[f.tag] = 1; deduped.push(f); } });

    // category filter
    if (opts.categories && opts.categories.length) {
      deduped = deduped.filter(function (f) { return f.cats.some(function (c) { return opts.categories.indexOf(c) >= 0; }); });
    }

    var score = deduped.reduce(function (a, f) { return a + (TIER_WEIGHT[f.tier] || 0); }, 0);
    var order = ['legendary', 'epic', 'rare', 'notable'], topTier = null;
    for (var i = 0; i < order.length; i++) if (deduped.some(function (f) { return f.tier === order[i]; })) { topTier = order[i]; break; }

    return { flags: deduped, topTier: topTier, score: score, special: deduped.length > 0 };
  }

  function scanHoldings(holdings, catalogById, categories, sigLookup, uniLookup, eggLookup) {
    return holdings.map(function (h) {
      var c = catalogById[h.collectibleId] || {};
      var uni = c.universe || h.universe;
      // VeVe drop year — a mint matching the year this NFT dropped (on-chain dropDate, else catalog drop)
      var sy = (sigLookup ? sigLookup(c.character || c.name) : []).slice();
      var dd = h.dropDate || c.drop, dm = dd ? String(dd).match(/(\d{4})/) : null;
      if (dm) sy.push({ year: +dm[1], reason: 'VeVe drop year' });
      // comics: original publication year + writer/artist birth years (from window.COMIC_HISTORIC)
      var chi = null;
      if (h.format === 'comic' && global.COMIC_HISTORIC && h.nameKey) {
        chi = global.COMIC_HISTORIC.issues[h.nameKey];
        if (chi) {
          if (chi.pub) sy.push({ year: chi.pub, reason: 'comic first published' });
          (chi.c || []).forEach(function (cr) { var by = global.COMIC_HISTORIC.births[cr]; if (by) sy.push({ year: by, reason: cr + ' (creator) born' }); });
          var cfa = global.COMIC_HISTORIC.cfa || {};
          (chi.ch || []).forEach(function (cc) { var fy = cfa[cc]; if (fy) sy.push({ year: fy, reason: cc + ' first appeared' }); });
        }
      }
      var a = analyzeMint(h.mintNumber, c.editionSize, {
        firstAppearanceYear: c.firstAppearanceYear,
        withheld: c.withheld,
        firstPublicMint: c.lowmint != null ? c.lowmint : c.lowest_public_mint,
        categories: categories,
        significantYears: sy,
        universeYears: (uniLookup && uni) ? uniLookup(uni) : [],
        universeEggs: (eggLookup && uni) ? eggLookup(uni) : []
      });
      // comic AGE + FIRST-APPEARANCE (VeVe's "comic ages" + key-issue categories) — a property of the
      // book itself, not the mint number; the FA flag makes a key issue "special" regardless of mint.
      var age = chi ? (chi.age || null) : null, isFa = !!(chi && chi.fa);
      if (isFa && (!categories || !categories.length || categories.indexOf('fa') >= 0 || categories.indexOf('historic') >= 0)) {
        a.flags.push({ tag: 'fa', label: '🔑 First appearance / key issue', tier: 'legendary', cats: ['fa', 'historic'] });
        a.special = true; a.topTier = 'legendary'; a.score += (TIER_WEIGHT.legendary || 100);
      }
      return { holding: h, collectible: c, analysis: a, age: age, fa: isFa };
    }).filter(function (r) { return r.analysis.special; })
      .sort(function (x, y) { return y.analysis.score - x.analysis.score; });
  }

  global.MINTS = { analyzeMint: analyzeMint, scanHoldings: scanHoldings, TIER_WEIGHT: TIER_WEIGHT, CATEGORIES: CATEGORIES };
})(typeof window !== 'undefined' ? window : this);
