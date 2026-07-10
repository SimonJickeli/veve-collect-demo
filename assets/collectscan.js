/*
 * collectscan.js — live client for the public Collect Chain explorer API
 * (Blockscout). CORS is open (access-control-allow-origin: *), so the browser
 * can call it directly — no proxy needed for the prototype.
 *
 * Given a wallet address, fetches every VeVe NFT it holds and parses the rich
 * on-chain metadata into holdings the MCP + mint engines understand:
 *   { collectibleId, name, mintNumber, editionSize, rarity, format,
 *     character, series, dropDate, image, tokenId }
 *
 * Production note: collectscan is an unaffiliated public service with no SLA —
 * a real deployment should proxy + cache server-side (see wiki/meta/architecture.md).
 */
(function (global) {
  'use strict';
  var BASE = 'https://collectscan.com/api/v2';
  var CONTRACT = '0xbcFEbA7A9dA14f5C9453bDA72E2098537867B3c7';
  var ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

  function isAddress(s) { return ADDR_RE.test((s || '').trim()); }

  // normName — the canonical match key. On-chain names (from VeVe's DB) carry
  // zero-width joiners (U+200D), curly apostrophes (’), en/em dashes, NBSPs and
  // enum-style rarities (ULTRA_RARE), while the catalog has them stripped or
  // inconsistent. Matching by raw name silently drops those items from MCP and
  // marks owned items "missing" in the Set Tracker. Fold BOTH sides through this:
  //   NFKD → strip diacritics → strip zero-width → collapse every non-alnum run
  //   to a single space → trim → lowercase. So "‍Mimban Trooper Helmet",
  //   "Boba Fett’s Belt" and "ULTRA_RARE" all match their catalog counterparts.
  function normName(s) {
    return (s == null ? '' : String(s))
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')             // combining diacritics (é→e)
      .replace(/[​-‏⁠﻿]/g, '') // zero-width joiners / BOM
      .replace(/[^0-9a-zA-Z]+/g, ' ')              // any run of punct/ws/NBSP → one space
      .trim()
      .toLowerCase();
  }

  // infer the wiki universe from on-chain metadata (for grail/universe-year flags)
  function guessUniverse(m) {
    var chars = Array.isArray(m.characters) ? m.characters.join(' ') : (typeof m.characters === 'string' ? m.characters : '');
    var s = ((m.publisher || '') + ' ' + (m.series || '') + ' ' + (m.name || '') + ' ' + chars).toLowerCase();
    if (/star wars|lucasfilm|mandalorian|jedi|sith|skywalker|grogu|stormtrooper|darth/.test(s)) return 'star-wars';
    if (/marvel|spider-man|avengers|x-men|wakanda|wolverine/.test(s)) return 'marvel';
    if (/\bdc\b|detective comics|batman|superman|wonder woman|gotham|harley quinn/.test(s)) return 'dc';
    if (/pixar/.test(s)) return 'pixar';
    if (/disney/.test(s)) return 'disney';
    if (/star trek/.test(s)) return 'star-trek';
    if (/ghostbusters/.test(s)) return 'ghostbusters';
    if (/jurassic/.test(s)) return 'jurassic-park';
    if (/back to the future|delorean/.test(s)) return 'back-to-the-future';
    if (/street fighter|capcom/.test(s)) return 'street-fighter';
    if (/assassin/.test(s)) return 'assassins-creed';
    if (/alien|xenomorph/.test(s)) return 'alien';
    if (/ultraman/.test(s)) return 'ultraman';
    if (/voltron/.test(s)) return 'voltron';
    return null;
  }

  function parseInstance(it) {
    var m = it.metadata || {};
    var mint = parseInt(m.edition, 10);
    var total = parseInt(m.totalEditions, 10);
    var comicNo = m.comicNumber;
    var isComic = comicNo != null && String(comicNo).trim() !== '' && String(comicNo) !== '0';
    var name = m.name || 'Unknown';
    var character = (Array.isArray(m.characters) && m.characters.length) ? m.characters[0] : name;
    return {
      // group duplicates of the same collectible by name (+comic number)
      collectibleId: name + (isComic ? ' #' + comicNo : ''),
      // normalized match key — fold both holding and catalog names through normName
      nameKey: normName(name) + (isComic ? ' ' + comicNo : ''),
      rarityKey: normName(m.rarity || ''),
      name: name,
      mintNumber: isFinite(mint) ? mint : null,
      editionSize: isFinite(total) ? total : null,
      rarity: m.rarity || null,
      format: isComic ? 'comic' : 'collectible',
      character: character,
      universe: guessUniverse(m),
      series: m.series || null,
      dropDate: m.dropDate || null,
      image: m.image || it.image_url || it.media_url || null,
      tokenId: it.id
    };
  }

  /**
   * fetchHoldings(address, opts) → Promise<holding[]>
   *   opts.onProgress(count, page), opts.maxPages (default 400 → ~20k editions; paginates fully)
   *   The returned array carries `.truncated = true` if the cap was hit before the wallet ended.
   */
  async function fetchHoldings(address, opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    var maxPages = opts.maxPages || 400;
    var addr = address.trim();
    if (!isAddress(addr)) throw new Error('Not a valid 0x wallet address');
    var base = BASE + '/addresses/' + addr + '/nft?type=ERC-721';
    var holdings = [], page = 0, next = null;
    do {
      var url = base;
      if (next) {
        var qs = Object.keys(next).map(function (k) {
          return encodeURIComponent(k) + '=' + encodeURIComponent(next[k]);
        }).join('&');
        url += '&' + qs;
      }
      var res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('collectscan ' + res.status + ' ' + res.statusText);
      var data = await res.json();
      (data.items || []).forEach(function (it) {
        var tok = it.token || {};
        var tokAddr = tok.address_hash || tok.address; // Blockscout renamed the field address → address_hash
        if (tokAddr && tokAddr.toLowerCase() !== CONTRACT.toLowerCase()) return; // VeVe only
        holdings.push(parseInstance(it));
      });
      next = data.next_page_params || null;
      page++;
      onProgress(holdings.length, page);
    } while (next && page < maxPages);
    holdings.truncated = !!next; // hit the page cap before the wallet ended
    return holdings;
  }

  /** Build a pseudo-catalog {id: {editionSize, character, name, img}} from live holdings,
   *  so MINTS.scanHoldings (which reads catalogById) works on real data. */
  function catalogFromHoldings(holdings) {
    var byId = {};
    holdings.forEach(function (h) {
      byId[h.collectibleId] = { editionSize: h.editionSize, character: h.character, universe: h.universe, name: h.name, img: emojiFor(h) };
    });
    return byId;
  }
  function emojiFor(h) { return h.format === 'comic' ? '📖' : '🎴'; }

  // Floor sanitizers — a floor above 💎FLOOR_TROLL is an outlier/troll UNLESS CORROBORATED (the OTHER
  // marketplace's floor is also above it → the item is genuinely that valuable, so keep it). Pass the
  // other market's raw floor as `corrob`. VeVe asks additionally reject repdigit vanity prices
  // (💎888,888 / 💎99,999). Illiquid items carry troll asks (💎10,000,042, 💎3,000,000) — reject them
  // so no troll number is shown as a market value or summed into a portfolio.
  var FLOOR_TROLL = 20000;
  function saneVeveFloor(v, corrob) {          // VeVe = lowest ASK (the main troll source)
    v = +v || 0;
    if (v <= 0) return 0;
    if (v >= FLOOR_TROLL && !(+corrob >= FLOOR_TROLL)) return 0;   // uncorroborated high ask → troll
    if (/^(\d)\1{3,}/.test(String(Math.round(v)))) return 0;       // repdigit vanity price
    return v;
  }
  function saneStackrFloor(v, corrob) {        // StackR = real TRADE; still drop an uncorroborated ≥20k outlier
    v = +v || 0;
    if (v <= 0) return 0;
    if (v >= FLOOR_TROLL && !(+corrob >= FLOOR_TROLL)) return 0;
    return v;
  }
  global.saneVeveFloor = saneVeveFloor;
  global.saneStackrFloor = saneStackrFloor;
  global.FLOOR_TROLL = FLOOR_TROLL;

  global.normName = normName; // shared match-key normalizer (used by mcp.html + sets.html)
  global.COLLECTSCAN = {
    isAddress: isAddress,
    normName: normName,
    fetchHoldings: fetchHoldings,
    catalogFromHoldings: catalogFromHoldings,
    CONTRACT: CONTRACT,
    BASE: BASE,
    explorerUrl: function (addr) { return 'https://collectscan.com/address/' + addr; }
  };
})(typeof window !== 'undefined' ? window : this);
