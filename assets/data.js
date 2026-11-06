/*
 * data.js — collectible catalog + mock wallet, shaped to the real schema
 * (wiki/meta/architecture.md). Field provenance:
 *   REAL (high confidence): license, firstAppearance(+Ref/Year), rarity, format
 *   MOCK (placeholder):     editionSize, floorGems
 *   TODO (needs data source): dropPriceGems, lowestPublicMint  → null until sourced
 *
 * reservedCount defaults to 40 (VeVe community rule: #1-40 reserved → #41 lowest
 * public) and is used by the significant-mints engine; per-item exact values TBD.
 */
(function (global) {
  'use strict';
  // lowest 5% of editions AVAILABLE TO THE PUBLIC (excludes withheld), per VeVe's MCP rule
  function isLowMint(mint, editionSize, withheld) {
    withheld = withheld || 0;
    var firstPublic = withheld + 1;
    var pool = Math.ceil(Math.max(1, editionSize - withheld) * 0.05);
    return mint >= firstPublic && mint <= firstPublic + pool - 1;
  }

  // c() builds a catalog row with consistent fields.
  function c(o) {
    return {
      id:o.id, name:o.name, brand:o.brand, universe:o.universe, format:o.format,
      license:o.license,                 // licensor (real)
      rarity:o.rarity,
      editionSize:o.editionSize,         // MOCK
      setId:o.setId || null,
      floorGems:o.floorGems,             // MOCK floor (secondary)
      dropPriceGems:o.dropPriceGems ?? null,       // TODO — original primary price
      lowestPublicMint:o.lowestPublicMint ?? null, // TODO — per-item; general rule ~41
      withheld:o.withheld ?? 0,                    // editions VeVe retained (excluded from public low-mint pool)
      firstAppearance:o.firstAppearance || null,        // REAL real-world debut date
      firstAppearanceRef:o.firstAppearanceRef || null,  // REAL the issue/film
      firstAppearanceYear:o.firstAppearanceYear || null,
      dropDate:o.dropDate || null,
      img:o.img
    };
  }

  var collectibles = [
    // ── Star Wars set ──
    c({id:'sw-luke', name:'Luke Skywalker', brand:'star-wars', universe:'star-wars', format:'collectible', license:'Lucasfilm (Disney)', rarity:'Common',      editionSize:10000, withheld:40, setId:'sw-vintage', floorGems:45,   dropDate:'2022-05-04', firstAppearance:'1977-05-25', firstAppearanceRef:'Star Wars (1977 film)', firstAppearanceYear:1977, img:'🧑‍🚀'}),
    c({id:'sw-leia', name:'Princess Leia',  brand:'star-wars', universe:'star-wars', format:'collectible', license:'Lucasfilm (Disney)', rarity:'Uncommon',    editionSize:7500,  setId:'sw-vintage', floorGems:60,   dropDate:'2022-05-04', firstAppearance:'1977-05-25', firstAppearanceRef:'Star Wars (1977 film)', firstAppearanceYear:1977, img:'👸'}),
    c({id:'sw-han',  name:'Han Solo',       brand:'star-wars', universe:'star-wars', format:'collectible', license:'Lucasfilm (Disney)', rarity:'Rare',        editionSize:5000,  setId:'sw-vintage', floorGems:120,  dropDate:'2022-05-04', firstAppearance:'1977-05-25', firstAppearanceRef:'Star Wars (1977 film)', firstAppearanceYear:1977, img:'🤠'}),
    c({id:'sw-vader',name:'Darth Vader',    brand:'star-wars', universe:'star-wars', format:'collectible', license:'Lucasfilm (Disney)', rarity:'Ultra Rare',  editionSize:2500,  setId:'sw-vintage', floorGems:380,  dropDate:'2022-05-04', firstAppearance:'1977-05-25', firstAppearanceRef:'Star Wars (1977 film)', firstAppearanceYear:1977, img:'🦹'}),
    c({id:'sw-yoda', name:'Yoda',           brand:'star-wars', universe:'star-wars', format:'collectible', license:'Lucasfilm (Disney)', rarity:'Secret Rare', editionSize:500,   setId:'sw-vintage', floorGems:1500, dropDate:'2022-05-04', firstAppearance:'1980-05-21', firstAppearanceRef:'The Empire Strikes Back', firstAppearanceYear:1980, img:'🧙'}),
    c({id:'sw-r2',   name:'R2-D2',          brand:'star-wars', universe:'star-wars', format:'collectible', license:'Lucasfilm (Disney)', rarity:'Common',      editionSize:10000, setId:'sw-vintage', floorGems:40,   dropDate:'2022-05-04', firstAppearance:'1977-05-25', firstAppearanceRef:'Star Wars (1977 film)', firstAppearanceYear:1977, img:'🤖'}),

    // ── Marvel Spider-Man set ──
    c({id:'mv-spiderman', name:'Spider-Man',   brand:'spider-man', universe:'marvel', format:'collectible', license:'Marvel (Disney)', rarity:'Rare',        editionSize:6000, setId:'mv-spidey', floorGems:150,  dropDate:'2021-08-21', firstAppearance:'1962-08', firstAppearanceRef:'Amazing Fantasy #15', firstAppearanceYear:1962, img:'🕷️'}),
    c({id:'mv-venom',     name:'Venom',        brand:'spider-man', universe:'marvel', format:'collectible', license:'Marvel (Disney)', rarity:'Ultra Rare',  editionSize:3000, setId:'mv-spidey', floorGems:320,  dropDate:'2021-10-15', firstAppearance:'1988-05', firstAppearanceRef:'Amazing Spider-Man #300 (full)', firstAppearanceYear:1988, img:'🕸️'}),
    c({id:'mv-goblin',    name:'Green Goblin', brand:'spider-man', universe:'marvel', format:'collectible', license:'Marvel (Disney)', rarity:'Secret Rare', editionSize:600,  setId:'mv-spidey', floorGems:1200, dropDate:'2021-10-15', firstAppearance:'1964-07', firstAppearanceRef:'The Amazing Spider-Man #14', firstAppearanceYear:1964, img:'🟢'}),

    // ── Marvel comics (comic point rules) ──
    c({id:'cm-asm1',   name:'Amazing Spider-Man #1',   brand:'spider-man', universe:'marvel', format:'comic', license:'Marvel (Disney)', rarity:'Rare',       editionSize:8000, floorGems:90,  dropDate:'2024-03-01', firstAppearance:'1963-03', firstAppearanceRef:'The Amazing Spider-Man #1', firstAppearanceYear:1963, img:'📕'}),
    c({id:'cm-asm300', name:'Amazing Spider-Man #300', brand:'spider-man', universe:'marvel', format:'comic', license:'Marvel (Disney)', rarity:'Ultra Rare', editionSize:2000, floorGems:260, dropDate:'2024-06-01', firstAppearance:'1988-05', firstAppearanceRef:'The Amazing Spider-Man #300', firstAppearanceYear:1988, img:'📗'}),

    // ── Standalone collectibles ──
    c({id:'dc-batman',     name:'Batman',              brand:'batman',      universe:'dc',               format:'collectible', license:'DC (Warner Bros. Discovery)', rarity:'Ultra Rare', editionSize:4000, floorGems:300, dropDate:'2021-12-01', firstAppearance:'1939-03', firstAppearanceRef:'Detective Comics #27', firstAppearanceYear:1939, img:'🦇'}),
    c({id:'lambo-huracan', name:'Lamborghini Huracán', brand:'lamborghini', universe:'real-world-brand', format:'collectible', license:'Automobili Lamborghini', rarity:'Rare', editionSize:5000, floorGems:110, dropDate:'2023-02-01', firstAppearance:'2014-03', firstAppearanceRef:'Huracán reveal (Geneva Motor Show)', firstAppearanceYear:2014, img:'🏎️'})
  ];

  var sets = [
    { id:'sw-vintage', name:'Star Wars — Vintage Heroes', brand:'star-wars', universe:'star-wars',
      memberCollectibleIds:['sw-luke','sw-leia','sw-han','sw-vader','sw-yoda','sw-r2'] },
    { id:'mv-spidey', name:'Spider-Man — Web Warriors', brand:'spider-man', universe:'marvel',
      memberCollectibleIds:['mv-spiderman','mv-venom','mv-goblin'] }
  ];

  // a wallet's holdings — demonstrates incomplete sets, a duplicate, low mints,
  // AND several SIGNIFICANT mints (#1, #41, palindrome, year-match) for the checker.
  var sampleHoldings = [
    { collectibleId:'sw-luke',     mintNumber:41,   rarity:'Common',     format:'collectible' }, // lowest public!
    { collectibleId:'sw-leia',     mintNumber:1977, rarity:'Uncommon',   format:'collectible' }, // year match
    { collectibleId:'sw-han',      mintNumber:1337, rarity:'Rare',       format:'collectible' },
    { collectibleId:'sw-vader',    mintNumber:1,    rarity:'Ultra Rare', format:'collectible' }, // #1!
    { collectibleId:'mv-spiderman',mintNumber:1331, rarity:'Rare',       format:'collectible' }, // palindrome
    { collectibleId:'mv-spiderman',mintNumber:2500, rarity:'Rare',       format:'collectible' }, // duplicate
    { collectibleId:'cm-asm1',     mintNumber:100,  rarity:'Rare',       format:'comic' },
    { collectibleId:'dc-batman',   mintNumber:1989, rarity:'Ultra Rare', format:'collectible' }
  ];

  var byId = {};
  collectibles.forEach(function (x) { byId[x.id] = x; });
  sampleHoldings.forEach(function (h) {
    var x = byId[h.collectibleId];
    h.lowMint = x ? isLowMint(h.mintNumber, x.editionSize, x.withheld) : false;
  });

  global.DATA = {
    collectibles: collectibles, byId: byId, sets: sets,
    sampleHoldings: sampleHoldings, isLowMint: isLowMint,
    sampleWallet: '0xA11ce…CoLLecT (sample)'
  };
})(typeof window !== 'undefined' ? window : this);
