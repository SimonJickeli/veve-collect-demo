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

  var YEARS = {};
  Object.keys(H.years || {}).forEach(function (k) {
    YEARS[k] = (H.years[k] || []).map(function (e) { return { y: e[0], r: e[1] }; });
  });
  var UNIVERSE_YEARS = {};
  Object.keys(H.universeYears || {}).forEach(function (k) {
    UNIVERSE_YEARS[k] = (H.universeYears[k] || []).map(function (e) { return { y: e[0], r: e[1], tier: e[2] }; });
  });
  var UNIVERSE_EGGS = {};
  Object.keys(H.universeEggs || {}).forEach(function (k) {
    UNIVERSE_EGGS[k] = (H.universeEggs[k] || []).map(function (e) { return { n: e[0], r: e[1] }; });
  });

  function mapYears(arr) { return arr.map(function (e) { return { year: e.y, reason: e.r, tier: e.tier }; }); }

  function lookup(character) {
    if (!character) return [];
    var k = String(character).toLowerCase().trim();
    if (YEARS[k]) return mapYears(YEARS[k]);
    for (var key in YEARS) {
      if (YEARS.hasOwnProperty(key) && (k.indexOf(key) >= 0 || key.indexOf(k) >= 0)) return mapYears(YEARS[key]);
    }
    return [];
  }
  function lookupUniverse(universe) {
    if (!universe) return [];
    var k = String(universe).toLowerCase().trim();
    return UNIVERSE_YEARS[k] ? mapYears(UNIVERSE_YEARS[k]) : [];
  }
  function lookupEggs(universe) {
    if (!universe) return [];
    var k = String(universe).toLowerCase().trim();
    return (UNIVERSE_EGGS[k] || []).map(function (e) { return { mint: e.n, reason: e.r }; });
  }

  global.SIG = { years: YEARS, universeYears: UNIVERSE_YEARS, universeEggs: UNIVERSE_EGGS,
    lookup: lookup, lookupUniverse: lookupUniverse, lookupEggs: lookupEggs };
})(typeof window !== 'undefined' ? window : this);
