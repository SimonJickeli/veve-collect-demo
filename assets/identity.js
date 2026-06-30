/*
 * identity.js — how a user identifies their collection.
 *
 * Verified model (see wiki/sources/identity-username-wallet.md):
 *   - Wallet address (0x…) → FULL on-chain holdings via collectscan. The real input.
 *   - Username → NO wallet (private mapping). Only a deep-link to the user's public
 *     VeVe profile, which (if opted in) shows aggregate stats + curated showcases,
 *     not the wallet and not full holdings.
 *   - Users find their own wallet address in the VeVe Web Wallet (login-gated).
 */
(function (global) {
  'use strict';
  var ADDR = /^0x[0-9a-fA-F]{40}$/;

  function isAddress(s) { return ADDR.test((s || '').trim()); }
  function profileUrl(username) {
    return 'https://www.veve.me/en/u/' + encodeURIComponent((username || '').trim().replace(/^@/, ''));
  }
  // classify free-text input
  function resolve(input) {
    var v = (input || '').trim();
    if (!v) return { type: 'empty', value: '' };
    if (isAddress(v)) return { type: 'address', value: v };
    return { type: 'username', value: v.replace(/^@/, '') };
  }

  global.IDENTITY = {
    isAddress: isAddress,
    resolve: resolve,
    profileUrl: profileUrl,
    webWalletUrl: 'https://omi.veve.me',     // where a user copies their own address
    explorer: 'https://collectscan.com'      // address/tx/block/token search only — no username
  };
})(typeof window !== 'undefined' ? window : this);
