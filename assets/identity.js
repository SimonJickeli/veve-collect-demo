/*
 * identity.js — how a user identifies their collection.
 *
 * Verified model (see wiki/sources/identity-username-wallet.md):
 *   - Wallet address (0x…) → FULL on-chain holdings via collectscan. The real input.
 *   - Username → NO wallet (private mapping). collectscan has no username index either
 *     (verified: /api/v2/search?q=<username> → 0 results). Only a deep-link to the user's
 *     public VeVe profile, which (if opted in) shows aggregate stats + curated showcases.
 *   - A user finds their own 0x in the VeVe app under Wallet → Send / Receive OMI →
 *     Receive. That OMI receive address == `me.publicKey` in VeVe's GraphQL == the very
 *     same address that holds their collectibles on-chain (verified end-to-end). It is
 *     NOT on the main wallet balance screen, which is why it looks hidden.
 *   - There is NO reverse lookup from "an edition I own": collectscan token instances
 *     resolve an owner only from an opaque tokenId, and tokenId does not encode the
 *     edition number, so (collectible, edition#) → owner is not derivable.
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
    // log in → Wallet → Send / Receive OMI → Receive shows the 0x. (omi.veve.me is retired;
    // the bare /wallet/ path 403s on S3 — /en/wallet/ is the live entry that routes through login.)
    webWalletUrl: 'https://www.veve.me/en/wallet/',
    receivePath: '/account/wallet/send-receive-omi', // in-app route where the 0x (me.publicKey) is displayed
    explorer: 'https://collectscan.com'      // address/tx/block/token search only — no username index
  };
})(typeof window !== 'undefined' ? window : this);
