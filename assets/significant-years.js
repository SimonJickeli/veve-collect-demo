/*
 * significant-years.js — historically-significant-year lookups for the Mint Checker.
 *
 * DATA is sourced from window.HISTORIC (app/data/historic-years.js — the single canonical dataset
 * shared with the wiki generator tools/gen_notable_mints.py, so the app and the wiki never drift).
 * This file provides only the lookup API + the global.SIG export. Load historic-years.js BEFORE this.
 *
 * window.HISTORIC shape: { years:{char:[[y,reason],...]}, universeYears:{uni:[[y,reason,tier?],...]},
 *                          universeEggs:{uni:[[n,reason],...]} }  (keys lowercased)
 */
(function (global) {
  'use strict';
  var H = global.HISTORIC || { years: {}, universeYears: {}, universeEggs: {} };

  // tuple formats: year = [year, reason, tier?, cat?] ; egg = [mint, reason, cat?, tier?]
  var YEARS = {};
  Object.keys(H.years || {}).forEach(function (k) {
    YEARS[k] = (H.years[k] || []).map(function (e) { return { y: e[0], r: e[1], tier: e[2], cat: e[3] }; });
  });
  var UNIVERSE_YEARS = {};
  Object.keys(H.universeYears || {}).forEach(function (k) {
    UNIVERSE_YEARS[k] = (H.universeYears[k] || []).map(function (e) { return { y: e[0], r: e[1], tier: e[2], cat: e[3] }; });
  });
  var UNIVERSE_EGGS = {};
  Object.keys(H.universeEggs || {}).forEach(function (k) {
    UNIVERSE_EGGS[k] = (H.universeEggs[k] || []).map(function (e) { return { n: e[0], r: e[1], cat: e[2], tier: e[3] }; });
  });

  function mapYears(arr) { return arr.map(function (e) { return { year: e.y, reason: e.r, tier: e.tier, cat: e.cat }; }); }

  // char → {universe:1} home map, built once from the catalog (authoritative). Used to reject
  // cross-universe character-year collisions (a Star Wars "Beast" must not inherit Marvel Beast's years).
  var CHAR_UNI = (function () {
    var m = {}, C = global.CATALOG;
    if (C && C.items) C.items.forEach(function (it) {
      if (it.character && it.universe) { var c = String(it.character).toLowerCase().trim(); (m[c] = m[c] || {})[it.universe] = 1; }
    });
    return m;
  })();
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function wordHit(hay, needle) { try { return new RegExp('\\b' + esc(needle) + '\\b', 'i').test(hay); } catch (e) { return hay.indexOf(needle) >= 0; } }

  // A comic character's years (creator births, comic debuts) must only apply inside comic-origin universes
  // + the VeVe variant lines that reuse licensed comic characters — never a same-named DIFFERENT character
  // in an unrelated franchise (Marvel's Thing vs Addams Family's Thing; DC's Death vs a Star Wars trooper).
  var COMIC_COMPATIBLE = { 'marvel': 1, 'dc': 1, 'tmnt': 1, 'vampirella': 1, 'red-sonja': 1, 'project-superpowers': 1, 'dynamite-crossover': 1, 'darick-robertson': 1, 'veve-vibes': 1, 'funko-gold': 1 };
  var COMIC_MARK = /\(co-?creators?\)|\(creators?\)|Fantastic Four|Sandman|Amazing Spider|Detective Comics|Action Comics|X-Men|Mirage|#\d/i;
  var _comicKey = {};
  function isComicChar(key) {
    if (_comicKey[key] == null) _comicKey[key] = (YEARS[key] || []).some(function (e) { return COMIC_MARK.test(e.r || ''); });
    return _comicKey[key];
  }
  // find the matching YEARS key: exact first, else WHOLE-WORD containment (never a bare substring, so
  // "ken" no longer matches "franken", "storm" no longer matches "stormtrooper", "boo" not "booklet").
  function matchKey(k) {
    if (YEARS[k]) return k;
    for (var key in YEARS) {
      if (!YEARS.hasOwnProperty(key)) continue;
      if (wordHit(k, key) || wordHit(key, k)) return key;
    }
    return null;
  }

  // lookup(character[, universe]) — universe (optional) rejects a match whose character canonically
  // lives only in OTHER universes, killing cross-franchise collisions. Omit universe for legacy callers.
  function lookup(character, universe) {
    if (!character) return [];
    var k = String(character).toLowerCase().trim();
    var key = matchKey(k);
    if (!key) return [];
    if (universe) {
      var u = String(universe).toLowerCase().trim();
      if (isComicChar(key) && !COMIC_COMPATIBLE[u]) return [];           // comic character bleeding into an unrelated franchise
      var homes = CHAR_UNI[key];
      if (homes && !homes[u] && Object.keys(homes).length) return [];   // catalog says this exact name lives only elsewhere
    }
    return mapYears(YEARS[key]);
  }
  function lookupUniverse(universe) {
    if (!universe) return [];
    var k = String(universe).toLowerCase().trim();
    return UNIVERSE_YEARS[k] ? mapYears(UNIVERSE_YEARS[k]) : [];
  }
  function lookupEggs(universe) {
    if (!universe) return [];
    var k = String(universe).toLowerCase().trim();
    return (UNIVERSE_EGGS[k] || []).map(function (e) { return { mint: e.n, reason: e.r, cat: e.cat, tier: e.tier }; });
  }

  global.SIG = { years: YEARS, universeYears: UNIVERSE_YEARS, universeEggs: UNIVERSE_EGGS,
    lookup: lookup, lookupUniverse: lookupUniverse, lookupEggs: lookupEggs };
})(typeof window !== 'undefined' ? window : this);
