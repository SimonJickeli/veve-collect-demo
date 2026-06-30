/*
 * significant-years.js — character-specific "historically significant" years,
 * each with a REASON. A mint number that matches one of these years is flagged
 * as historically significant with the explanation (the user's ask: e.g. a Walt
 * Disney piece — birth, founding Disney, Disneyland, Disney World, death).
 *
 * The collectible's own first-appearance year is added separately by mints.js
 * (reason "first appearance"), so it's omitted here to avoid duplication.
 *
 * These are public-knowledge facts. Curated per character; expand during the
 * correction pass. Keys are lowercased; lookup() also matches by substring/alias.
 */
(function (global) {
  'use strict';
  var YEARS = {
    'walt disney':   [{y:1901,r:'Walt Disney born'},{y:1923,r:'The Walt Disney Company founded'},{y:1955,r:'Disneyland opened'},{y:1966,r:'Walt Disney died'},{y:1971,r:'Walt Disney World opened'}],
    'mickey mouse':  [{y:1955,r:'Disneyland opened'},{y:1971,r:'Walt Disney World opened'}],
    'spider-man':    [{y:1922,r:'Stan Lee (co-creator) born'},{y:1963,r:'The Amazing Spider-Man #1'}],
    'iron man':      [{y:1922,r:'Stan Lee (co-creator) born'},{y:2008,r:'Iron Man (MCU film)'}],
    'hulk':          [{y:1922,r:'Stan Lee (co-creator) born'}],
    'venom':         [{y:1988,r:'first full appearance, ASM #300'}],
    'green goblin':  [{y:1922,r:'Stan Lee (co-creator) born'}],
    'batman':        [{y:1915,r:'Bob Kane (co-creator) born'},{y:1940,r:'Batman #1'},{y:1989,r:'Batman (Tim Burton film)'}],
    'superman':      [{y:1914,r:'Jerry Siegel (co-creator) born'},{y:1978,r:'Superman: The Movie'}],
    'wonder woman':  [{y:1942,r:'Wonder Woman #1'}],
    'darth vader':   [{y:1944,r:'George Lucas born'},{y:1980,r:'The Empire Strikes Back'},{y:1983,r:'Return of the Jedi'}],
    'luke skywalker':[{y:1944,r:'George Lucas born'},{y:1951,r:'Mark Hamill born'},{y:1980,r:'The Empire Strikes Back'}],
    'princess leia': [{y:1944,r:'George Lucas born'},{y:1956,r:'Carrie Fisher born'}],
    'han solo':      [{y:1944,r:'George Lucas born'},{y:1942,r:'Harrison Ford born'}],
    'yoda':          [{y:1944,r:'George Lucas born'}],
    'r2-d2':         [{y:1944,r:'George Lucas born'}],
    'lamborghini':   [{y:1916,r:'Ferruccio Lamborghini born'},{y:1963,r:'Automobili Lamborghini founded'}]
  };

  // UNIVERSE-level milestone years — a mint matching the franchise's grail year is
  // significant for EVERY collectible in that universe (e.g. #1977 on any Star Wars
  // piece = A New Hope). tier 'legendary' = the flagship grail year.
  // UNIVERSE grail = the franchise's single FOUNDATIONAL year, applied to every item in that universe
  // (e.g. #1977 on ANY Star Wars piece = A New Hope). Individual character debut years are NOT here —
  // they flow through each collectible's own `comic_debut` (so Superman's 1938 flags only Superman items).
  // Shared-universe publishers (DC) have no single franchise-wide grail → empty; Marvel keeps only the
  // "Marvel Age" (1961) + MCU (2008) as genuinely line-wide markers.
  var UNIVERSE_YEARS = {
    'star-wars':  [{y:1977,r:'Star Wars: A New Hope — the franchise grail',tier:'legendary'}],
    'marvel':     [{y:1961,r:'Fantastic Four #1 — the Marvel Age begins',tier:'legendary'},{y:2008,r:'Iron Man — the MCU begins'}],
    'dc':         [],
    'disney':     [{y:1928,r:'Steamboat Willie — birth of Disney animation',tier:'legendary'}],
    'pixar':      [{y:1995,r:'Toy Story — the first Pixar feature',tier:'legendary'}],
    'star-trek':  [{y:1966,r:'Star Trek: The Original Series debuts',tier:'legendary'}],
    'tmnt':       [{y:1984,r:'TMNT #1 (Mirage) — the original',tier:'legendary'}],
    'ghostbusters':[{y:1984,r:'Ghostbusters (1984 film)',tier:'legendary'}],
    'jurassic-park':[{y:1993,r:'Jurassic Park (1993 film)',tier:'legendary'}],
    'back-to-the-future':[{y:1985,r:'Back to the Future (1985 film)',tier:'legendary'}],
    'street-fighter':[{y:1987,r:'Street Fighter (arcade) debuts',tier:'legendary'}],
    'assassins-creed':[{y:2007,r:'Assassin’s Creed (first game)',tier:'legendary'}],
    'alien':      [{y:1979,r:'Alien (1979 film)',tier:'legendary'}],
    'ultraman':   [{y:1966,r:'Ultraman debuts',tier:'legendary'}],
    'voltron':    [{y:1984,r:'Voltron US TV debut',tier:'legendary'}],
    'monster-hunter':[{y:2004,r:'Monster Hunter (first game)',tier:'legendary'}],
    'predator':   [{y:1987,r:'Predator (1987 film)',tier:'legendary'}],
    'the-simpsons':[{y:1989,r:'The Simpsons series premiere',tier:'legendary'}],
    'tarzan':     [{y:1912,r:'Tarzan of the Apes (The All-Story)',tier:'legendary'}],
    'avatar-the-last-airbender':[{y:2005,r:'Avatar: The Last Airbender premiere',tier:'legendary'}],
    'avatar':     [{y:2009,r:'Avatar (James Cameron film)',tier:'legendary'}],
    'tokidoki':   [{y:2005,r:'tokidoki founded (Simone Legno)',tier:'legendary'}],
    'sesame-street':[{y:1969,r:'Sesame Street premiere',tier:'legendary'}],
    'astro-boy':  [{y:1952,r:'Astro Boy manga debuts',tier:'legendary'}],
    'james-bond': [{y:1962,r:'Dr. No — first Bond film',tier:'legendary'}],
    'knight-rider':[{y:1982,r:'Knight Rider TV premiere',tier:'legendary'}],
    'labyrinth':  [{y:1986,r:'Labyrinth (1986 film)',tier:'legendary'}],
    'rambo':      [{y:1982,r:'First Blood (1982 film)',tier:'legendary'}],
    'rabbids':    [{y:2006,r:'Rayman Raving Rabbids',tier:'legendary'}],
    'ren-and-stimpy':[{y:1991,r:'The Ren & Stimpy Show premiere',tier:'legendary'}],
    'solo-leveling':[{y:2016,r:'Solo Leveling web novel',tier:'legendary'}],
    'cartoon-network':[{y:1992,r:'Cartoon Network launches',tier:'legendary'}],
    'robocop':    [{y:1987,r:'RoboCop (1987 film)',tier:'legendary'}],
    '20th-century':[{y:1935,r:'20th Century-Fox formed',tier:'legendary'}]
  };

  // Optional: franchise-specific "easter egg" numbers (NOT years) — kept franchise-scoped, never universal.
  var UNIVERSE_EGGS = {
    'star-wars': [{n:1138, r:'THX 1138 — Lucas’s signature easter egg'},{n:66, r:'Order 66'},{n:327, r:'Docking Bay 327 (Death Star)'}],
    'marvel':    [{n:616, r:'Earth-616 — the main Marvel universe'}]
  };

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

  global.SIG = { years: YEARS, universeYears: UNIVERSE_YEARS, universeEggs: UNIVERSE_EGGS, lookup: lookup, lookupUniverse: lookupUniverse, lookupEggs: lookupEggs };
})(typeof window !== 'undefined' ? window : this);
