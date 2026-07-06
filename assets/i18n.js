/*
 * i18n.js — lightweight EN/DE language toggle for the static app.
 * Self-injects a 🌐 toggle into the nav (so pages only need to include this script),
 * persists the choice, and translates the static UI chrome (nav, buttons, labels,
 * static <option>s, placeholders) via a dictionary. Dynamic data (collectible names,
 * results) stays in its source form — those are proper nouns / live data.
 * EN is the source in the HTML; DE is applied on load when selected.
 */
(function () {
  'use strict';
  var DICT = {
    de: {
      // nav
      "Home": "Start", "Set Tracker": "Set-Tracker", "MCP Optimizer": "MCP-Optimierer",
      "Mint Checker": "Mint-Prüfer", "Ask": "Fragen", "Explorer": "Explorer",
      // buttons
      "Track": "Verfolgen", "Sample": "Beispiel", "Use sample": "Beispiel nutzen",
      "Use sample wallet": "Beispiel-Wallet nutzen", "Optimize": "Optimieren",
      "Analyze": "Analysieren", "Scan wallet": "Wallet scannen", "Send": "Senden",
      // field labels
      "Wallet address": "Wallet-Adresse", "Collect Chain wallet address": "Collect-Chain-Wallet-Adresse",
      "Universe": "Universum", "Layout": "Layout", "View": "Ansicht", "Show": "Anzeigen",
      "Mint #": "Mint-Nr.", "Edition size": "Editionsgröße",
      "Pick a collectible (optional)": "Sammelobjekt wählen (optional)",
      // static select options
      "By set": "Nach Set", "By season": "Nach Season", "Cards": "Karten", "List": "Liste",
      "Missing (incomplete)": "Fehlend (unvollständig)", "Complete": "Vollständig", "All": "Alle",
      // misc chrome
      "Where do I find my wallet address?": "Wo finde ich meine Wallet-Adresse?",
      "Try:": "Versuche:"
    }
  };

  function currentLang() { try { return localStorage.getItem('veve_lang') || 'en'; } catch (e) { return 'en'; } }

  function injectToggle(cur) {
    var nav = document.querySelector('.topbar .main');
    if (!nav || document.getElementById('langtog')) return;
    var b = document.createElement('button');
    b.id = 'langtog';
    b.type = 'button';
    b.textContent = cur === 'de' ? '🌐 DE' : '🌐 EN';
    b.title = 'Language / Sprache';
    b.style.cssText = 'margin-left:12px;background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:999px;padding:4px 11px;font-size:12px;font-weight:700;cursor:pointer';
    b.addEventListener('click', function () {
      try { localStorage.setItem('veve_lang', cur === 'de' ? 'en' : 'de'); } catch (e) {}
      location.reload();
    });
    nav.appendChild(b);
  }

  function translate(lang) {
    var d = DICT[lang]; if (!d) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (tn) {
      var k = (tn.nodeValue || '').trim();
      if (k && d.hasOwnProperty(k)) tn.nodeValue = tn.nodeValue.replace(k, d[k]);   // whole-match only → safe
    });
    document.querySelectorAll('[placeholder]').forEach(function (el) {
      var k = el.getAttribute('placeholder');
      if (k && d.hasOwnProperty(k)) el.setAttribute('placeholder', d[k]);
    });
  }

  function init() {
    var lang = currentLang();
    injectToggle(lang);
    if (lang === 'de') { document.documentElement.lang = 'de'; translate('de'); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
