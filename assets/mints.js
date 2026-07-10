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
    { key: 'milestone',  label: 'Anniversary / milestone dates' },
    { key: 'low',        label: 'Lowest public mint' },
    { key: 'high',       label: 'Highest (final) mint' },
    { key: 'palindrome', label: 'Palindromes (5+ digits)' },
    { key: 'repdigit',   label: 'Repeating digits (111, 2222…)' },
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
    // We only "know" the reserve when it's researched (firstPublicMint) or explicitly given (reservedCount).
    // Without it, DON'T assume #1 is public (that wrongly flagged #1 as the lowest public mint and hid #21).
    var firstPublicKnown = opts.firstPublicMint != null || withheld > 0;
    var firstPublic = opts.firstPublicMint != null ? Number(opts.firstPublicMint) : (withheld + 1);
    var s = digits(mint);
    var flags = [];
    var add = function (tag, label, tier, cats) { flags.push({ tag: tag, label: label, tier: tier, cats: cats }); };

    if (!mint || mint < 1) return { flags: [], topTier: null, score: 0, special: false };

    // ── position: lowest / top-5-lowest / highest — PUBLIC-focused (the core "special" mints) ──
    if (firstPublicKnown) {
      if (mint === 1 && firstPublic > 1) add('ace', '#1 — the first edition ever (VeVe-reserved #1–' + withheld + ')', 'epic', ['historic', 'low']);
      if (mint === firstPublic) add('lowest-public', '🥇 #' + firstPublic + ' — THE lowest public mint', 'legendary', ['historic', 'low']);
    } else if (opts.eraLpm && mint === Number(opts.eraLpm) && mint > 1) {
      // Reserve not researched, but this item dropped in the 2021-23 era when VeVe uniformly reserved 40 → LPM #41.
      add('lowest-public', '🥇 #' + mint + ' — THE lowest public mint <span class="small">(VeVe reserved 40 for its 2021–23 drop era)</span>', 'epic', ['historic', 'low']);
    }

    if (editionSize > 0 && mint === editionSize) add('highest-public', '🏁 #' + editionSize + ' — THE highest (final) public mint', 'legendary', ['historic', 'high']);

    // ── sequences — ascending is premium ("better than Rare"); both restricted (asc starts 0/1, desc ends 1) ──
    if (isConsecAsc(s)) add('ascending', 'Ascending run (#' + s + ') — highly prized', 'epic', ['sequence']);
    if (isConsecDesc(s)) add('descending', 'Descending run (#' + s + ')', 'rare', ['sequence']);

    // ── palindrome (5+ digits only) ──
    if (isPalindrome(s)) add('palindrome', 'Palindrome (#' + s + ')', 'rare', ['palindrome']);

    // ── repeating digits (3+ digits: #111, #333, #2222, #5555) — a lower "somewhat special" tier ──
    if (s.length >= 3 && isRepdigit(s)) add('repdigit', 'Repeating digits (#' + s + ')', 'notable', ['repdigit']);

    // ── meme / iconic numbers + franchise easter eggs + milestone date-codes ──
    // Eggs can carry cat ('meme' default | 'milestone' for date-codes like #1071 = Oct 1971, #775 = May 1977)
    // and tier (default 'rare'), so anniversary/founding date-codes read as a milestone, not a meme.
    if (MEME_NUMBERS[mint]) add('meme', 'Meme / iconic number — ' + MEME_NUMBERS[mint], 'rare', ['meme']);
    (opts.universeEggs || []).forEach(function (e) {
      if (Number(e.mint) !== mint) return;
      var cat = e.cat || 'meme', tier = e.tier || 'rare';
      var pre = cat === 'milestone' ? '🎂 Milestone — ' : 'Franchise easter egg — ';
      add('egg-' + mint, pre + e.reason, tier, [cat]);
    });

    // ── significant YEARS (release/birth = elite 'historic'; founding/anniversary = 'milestone', tier 2-3).
    // Each entry may carry sy.tier and sy.cat; release/drop years are pushed as legendary by the consumers.
    var sigYears = (opts.significantYears || []).slice();
    if (opts.universeYears) sigYears = sigYears.concat(opts.universeYears);
    if (opts.firstAppearanceYear) sigYears.push({ year: Number(opts.firstAppearanceYear), reason: 'first appearance', tier: 'legendary' });
    var sigSeen = {};
    sigYears.forEach(function (sy) {
      var y = Number(sy.year);
      if (mint === y && !sigSeen[y]) {
        sigSeen[y] = 1;
        var t = sy.tier || 'epic';
        var cat = sy.cat || 'historic';
        var pre = (t === 'legendary') ? '🏆 Grail — ' : (cat === 'milestone' ? '🎂 Milestone — ' : 'Historically significant — ');
        add('historic-' + y, pre + sy.reason + ' (' + y + ')', t, [cat]);
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
      if (dm) sy.push({ year: +dm[1], reason: 'VeVe drop year', tier: 'legendary' });  // release year = elite
      // comics: original publication year + writer/artist birth years (from window.COMIC_HISTORIC)
      var chi = null;
      if (h.format === 'comic' && global.COMIC_HISTORIC && h.nameKey) {
        chi = global.COMIC_HISTORIC.issues[h.nameKey];
        if (chi) {
          if (chi.pub) sy.push({ year: chi.pub, reason: 'comic first published', tier: 'legendary' });  // release year = elite
          (chi.c || []).forEach(function (cr) { var by = global.COMIC_HISTORIC.births[cr]; if (by) sy.push({ year: by, reason: cr + ' (creator) born' }); });
          var cfa = global.COMIC_HISTORIC.cfa || {};
          (chi.ch || []).forEach(function (cc) { var fy = cfa[cc]; if (fy) sy.push({ year: fy, reason: cc + ' first appeared' }); });
        }
      }
      var researchedLpm = h.lowmint != null ? h.lowmint : (c.lowmint != null ? c.lowmint : c.lowest_public_mint);
      // Era inference is an ITEM property (h.lpmEra, set from the catalog DROP YEAR in the live-scan enrichment):
      // VeVe uniformly reserved 40 → LPM #41 for 2021-23 drops (97-100% of researched). NOT holdings-based.
      var eraLpm = (researchedLpm == null) ? (h.lpmEra || null) : null;
      var a = analyzeMint(h.mintNumber, h.editionSize || c.editionSize, {
        firstAppearanceYear: c.firstAppearanceYear,
        withheld: c.withheld,
        firstPublicMint: researchedLpm,   // researched reserve (exact), if known
        eraLpm: eraLpm,                    // else the era-standard LPM (#41 for 2021-23 drops)
        categories: categories,
        significantYears: sy,
        universeYears: (uniLookup && uni) ? uniLookup(uni) : [],
        universeEggs: (eggLookup && uni) ? eggLookup(uni) : []
      });
      // comic AGE — exposed for the "Comics by age" panel + row chip (VeVe's comic-ages category).
      // (First-appearance is NOT a special mint — it lives in the wiki for depth, not here.)
      var age = chi ? (chi.age || null) : null;
      return { holding: h, collectible: c, analysis: a, age: age };
    }).filter(function (r) { return r.analysis.special; })
      .sort(function (x, y) { return y.analysis.score - x.analysis.score; });
  }

  global.MINTS = { analyzeMint: analyzeMint, scanHoldings: scanHoldings, TIER_WEIGHT: TIER_WEIGHT, CATEGORIES: CATEGORIES };
})(typeof window !== 'undefined' ? window : this);
