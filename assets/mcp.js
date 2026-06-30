/*
 * mcp.js — Canonical Master Collector Points (MCP) daily-points engine.
 *
 * This is the REAL VeVe formula, transcribed from VeVe's official MCP blog pages
 * (see wiki/sources/economy-gems-omi-mcp.md). Implement exactly; do not invent.
 *
 * Scope: Daily ASSET points (what drives competitive Rank). One-off points,
 * daily-activity points (+1/action cap 25), and the OMI reward tier are modeled
 * as optional add-ons but the optimizer focuses on daily asset points because
 * that is the recurring, holdings-driven engine.
 *
 * Documented unknowns (NEVER faked here):
 *   - Exact per-Level (1..100) thresholds — not public.
 *   - OMI reward-tier curve — not public.
 *   - Whether VeVe counts duplicate copies "best-first". We assume best-first
 *     (highest intrinsic value gets the 1.0 factor) as the optimistic standard.
 */
(function (global) {
  'use strict';

  var RARITIES = ['Common', 'Uncommon', 'Rare', 'Ultra Rare', 'Secret Rare'];

  // --- Collectibles (figures): base 1.0 + rarity bonus + low-mint bonus ---
  var COLLECTIBLE_RARITY_BONUS = {
    'Common': 0, 'Uncommon': 0, 'Rare': 0.25, 'Ultra Rare': 0.5, 'Secret Rare': 5.0
  };
  // Duplicate diminishing for the SAME collectible — VeVe OFFICIAL, re-confirmed 2026-06-27 from
  // veve.me/blog/veve/mcp/...earning-mcp-points: 1st full, 2nd 0.75, 3rd 0.35, 4th+ 0.10.
  // (The brief "no-dup" experiment was WRONG — the real undercount was the 1,500-edition fetch cap,
  // now fixed to 400 pages; the dup curve is genuine.)
  var COLLECTIBLE_DUP = [1.0, 0.75, 0.35, 0.10];
  var COLLECTIBLE_LOWMINT_BONUS = 0.5;

  // --- Comics: rarity IS the base ---
  var COMIC_BASE = {
    'Common': 0.25, 'Uncommon': 0.5, 'Rare': 2.0, 'Ultra Rare': 3.0, 'Secret Rare': 6.0
  };
  var COMIC_DUP = [1.0, 0.5, 0.25, 0.10]; // 2nd 50% / 3rd 25% / 4th+ 10% (VeVe official)
  var COMIC_LOWMINT_MULT = 1.5; // +50% for the 5% lowest-mint comic
  var COMIC_DUP_EXEMPT = { 'Common': true, 'Uncommon': true }; // Common/Uncommon comics: each counts full

  // --- Set completion (daily) by set size ---
  function setBaseBySize(size) {
    if (size <= 0) return 0;
    if (size >= 5) return 5.0;
    return [0, 1.0, 2.0, 3.0, 4.0][size];
  }
  var SET_DUP = [1.0, 0.30, 0.20, 0.10]; // owning multiple complete copies of a set

  // --- One-off points ---
  var ONE_OFF = { onboarding: 100, completeSet: 100, storeBuy: 25, marketBuy: 15 };
  var DAILY_ACTIVITY_CAP = 25;

  function dupFactor(schedule, copyIndex /* 1-based */) {
    var i = Math.max(1, copyIndex) - 1;
    return schedule[Math.min(i, schedule.length - 1)];
  }

  // Intrinsic per-copy daily value BEFORE the duplicate factor.
  function collectibleIntrinsic(rarity, lowMint) {
    var v = 1.0 + (COLLECTIBLE_RARITY_BONUS[rarity] || 0);
    if (lowMint) v += COLLECTIBLE_LOWMINT_BONUS;
    return v;
  }
  function comicIntrinsic(rarity, lowMint) {
    var v = (COMIC_BASE[rarity] || 0);
    if (lowMint) v *= COMIC_LOWMINT_MULT;
    return v;
  }

  /**
   * Daily asset points for a group of copies of the SAME collectible/comic.
   * copies: [{ rarity, lowMint }]  (mintNumber→lowMint resolved by caller)
   * format: 'collectible' | 'comic'
   * Returns total daily points for that stack (duplicate diminishing applied).
   */
  function stackDailyPoints(copies, format) {
    if (!copies || !copies.length) return 0;
    if (format === 'comic') {
      // Comics: the rarity value IS a per-copy bonus that STACKS — every copy counts FULL at its
      // rarity value (Common 0.25 … Secret Rare 6.0; ×1.5 on low-mint copies), with NO duplicate
      // diminishing. (Owner-confirmed: "6 for comics" stacks, mirroring the collectible SR bonus
      // which also stacks full per copy. The collectible 1.0 base diminishes; comics have no such
      // base, so nothing diminishes.)
      var tc = 0;
      for (var j = 0; j < copies.length; j++) tc += comicIntrinsic(copies[j].rarity, copies[j].lowMint);
      return tc;
    }
    // Collectibles: ONLY the 1.0 BASE diminishes on duplicates. The rarity bonus (+5 Secret Rare,
    // +0.25 Rare, +0.5 Ultra Rare) and the +0.5 low-mint bonus are a SEPARATE "Bonus Points" section
    // and are added IN FULL to every copy — VeVe official structure (verified 2026-06-29 across the
    // earning-mcp page + Medium v1.0/v0.2). So 5 identical SRs = base(1.0+0.75+0.35+0.10+0.10=2.30)
    // + 5×5.0 bonus = 27.30/day — NOT 6.0×2.30=13.80. (Earlier code wrongly diminished the whole value,
    // crushing the SR bonus on duplicates — the real cause of the comic+SR-heavy-wallet undercount.)
    var rarityBonus = COLLECTIBLE_RARITY_BONUS[copies[0].rarity] || 0;
    var total = 0;
    for (var k = 0; k < copies.length; k++) {
      total += 1.0 * dupFactor(COLLECTIBLE_DUP, k + 1)              // base: diminishes by copy rank
             + rarityBonus                                         // rarity bonus: full every copy
             + (copies[k].lowMint ? COLLECTIBLE_LOWMINT_BONUS : 0); // low-mint: full on each low-mint copy
    }
    return total;
  }

  /**
   * Aggregate daily ASSET points across a wallet's holdings + completed sets.
   * holdings: [{ collectibleId, rarity, format, lowMint }]  (one row per owned edition)
   * sets: [{ id, name, memberCollectibleIds:[...] }]
   * Returns { itemPoints, setPoints, total, perStack:{}, setBreakdown:[] }
   */
  function computeDaily(holdings, sets) {
    var byItem = {};
    holdings.forEach(function (h) {
      (byItem[h.collectibleId] = byItem[h.collectibleId] || []).push(h);
    });

    var itemPoints = 0, perStack = {};
    Object.keys(byItem).forEach(function (id) {
      var copies = byItem[id];
      var pts = stackDailyPoints(copies, copies[0].format);
      perStack[id] = pts;
      itemPoints += pts;
    });

    // ownership count per collectible (for set "complete copies")
    var ownedCount = {};
    Object.keys(byItem).forEach(function (id) { ownedCount[id] = byItem[id].length; });

    var setPoints = 0, setBreakdown = [];
    (sets || []).forEach(function (s) {
      var members = s.memberCollectibleIds || [];
      if (!members.length) return;
      // complete copies of the set = min owned across members
      var completeCopies = members.reduce(function (m, id) {
        return Math.min(m, ownedCount[id] || 0);
      }, Infinity);
      completeCopies = isFinite(completeCopies) ? completeCopies : 0;
      if (completeCopies <= 0) return;
      var base = setBaseBySize(members.length);
      var pts = 0;
      for (var c = 1; c <= completeCopies; c++) pts += base * dupFactor(SET_DUP, c);
      setPoints += pts;
      setBreakdown.push({ id: s.id, name: s.name, completeCopies: completeCopies, daily: pts });
    });

    return {
      itemPoints: round(itemPoints),
      setPoints: round(setPoints),
      total: round(itemPoints + setPoints),
      perStack: perStack,
      setBreakdown: setBreakdown
    };
  }

  /**
   * Marginal daily points from acquiring ONE more edition of `candidate`.
   * candidate: { collectibleId, rarity, format, lowMint, setId? }
   * Returns { deltaItem, deltaSet, completesSet, delta }
   */
  function marginalDaily(holdings, candidate, sets) {
    var before = computeDaily(holdings, sets);
    var after = computeDaily(holdings.concat([{
      collectibleId: candidate.collectibleId,
      rarity: candidate.rarity,
      format: candidate.format,
      lowMint: !!candidate.lowMint
    }]), sets);
    // did this acquisition newly complete a set (one-off +100 is separate, but flag it)?
    var completes = null;
    (sets || []).forEach(function (s) {
      if (!s.memberCollectibleIds || s.memberCollectibleIds.indexOf(candidate.collectibleId) < 0) return;
      var b = (before.setBreakdown.find(function (x) { return x.id === s.id; }) || {}).completeCopies || 0;
      var a = (after.setBreakdown.find(function (x) { return x.id === s.id; }) || {}).completeCopies || 0;
      if (a > b) completes = s.name;
    });
    return {
      deltaItem: round(after.itemPoints - before.itemPoints),
      deltaSet: round(after.setPoints - before.setPoints),
      completesSet: completes,
      delta: round(after.total - before.total)
    };
  }

  function round(n) { return Math.round(n * 1000) / 1000; }

  global.MCP = {
    RARITIES: RARITIES,
    ONE_OFF: ONE_OFF,
    DAILY_ACTIVITY_CAP: DAILY_ACTIVITY_CAP,
    collectibleIntrinsic: collectibleIntrinsic,
    comicIntrinsic: comicIntrinsic,
    stackDailyPoints: stackDailyPoints,
    computeDaily: computeDaily,
    marginalDaily: marginalDaily,
    setBaseBySize: setBaseBySize
  };
})(typeof window !== 'undefined' ? window : this);
