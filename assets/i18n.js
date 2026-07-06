/*
 * i18n.js — lightweight language switch (EN / DE / FR / ES) for the static app.
 * Self-injects a 🌐 language <select> into the nav (so pages only include this script),
 * persists the choice, and translates the static UI chrome (nav, buttons, labels, static
 * <option>s, placeholders) via per-language dictionaries. Dynamic data (collectible names,
 * results) stays in its source form — proper nouns / live data. EN is the source HTML.
 */
(function () {
  'use strict';
  var DICT = {
    de: {
      "Home": "Start", "Set Tracker": "Set-Tracker", "MCP Optimizer": "MCP-Optimierer",
      "Mint Checker": "Mint-Prüfer", "Ask": "Fragen", "Explorer": "Explorer",
      "Track": "Verfolgen", "Sample": "Beispiel", "Use sample": "Beispiel nutzen",
      "Use sample wallet": "Beispiel-Wallet nutzen", "Optimize": "Optimieren",
      "Analyze": "Analysieren", "Scan wallet": "Wallet scannen", "Send": "Senden",
      "Wallet address": "Wallet-Adresse", "Collect Chain wallet address": "Collect-Chain-Wallet-Adresse",
      "Universe": "Universum", "Layout": "Layout", "View": "Ansicht", "Show": "Anzeigen",
      "Mint #": "Mint-Nr.", "Edition size": "Editionsgröße",
      "Pick a collectible (optional)": "Sammelobjekt wählen (optional)",
      "By set": "Nach Set", "By season": "Nach Season", "Cards": "Karten", "List": "Liste",
      "Missing (incomplete)": "Fehlend (unvollständig)", "Complete": "Vollständig", "All": "Alle",
      "Where do I find my wallet address?": "Wo finde ich meine Wallet-Adresse?", "Try:": "Versuche:"
    },
    fr: {
      "Home": "Accueil", "Set Tracker": "Suivi des sets", "MCP Optimizer": "Optimiseur MCP",
      "Mint Checker": "Vérificateur de mint", "Ask": "Demander", "Explorer": "Explorateur",
      "Track": "Suivre", "Sample": "Exemple", "Use sample": "Utiliser l'exemple",
      "Use sample wallet": "Wallet d'exemple", "Optimize": "Optimiser",
      "Analyze": "Analyser", "Scan wallet": "Scanner le wallet", "Send": "Envoyer",
      "Wallet address": "Adresse du wallet", "Collect Chain wallet address": "Adresse wallet Collect Chain",
      "Universe": "Univers", "Layout": "Disposition", "View": "Vue", "Show": "Afficher",
      "Mint #": "N° de mint", "Edition size": "Taille de l'édition",
      "Pick a collectible (optional)": "Choisir un objet (optionnel)",
      "By set": "Par set", "By season": "Par saison", "Cards": "Cartes", "List": "Liste",
      "Missing (incomplete)": "Manquants (incomplets)", "Complete": "Complets", "All": "Tous",
      "Where do I find my wallet address?": "Où trouver mon adresse de wallet ?", "Try:": "Essayez :"
    },
    es: {
      "Home": "Inicio", "Set Tracker": "Rastreador de sets", "MCP Optimizer": "Optimizador MCP",
      "Mint Checker": "Verificador de mint", "Ask": "Preguntar", "Explorer": "Explorador",
      "Track": "Rastrear", "Sample": "Ejemplo", "Use sample": "Usar ejemplo",
      "Use sample wallet": "Wallet de ejemplo", "Optimize": "Optimizar",
      "Analyze": "Analizar", "Scan wallet": "Escanear wallet", "Send": "Enviar",
      "Wallet address": "Dirección del wallet", "Collect Chain wallet address": "Dirección wallet Collect Chain",
      "Universe": "Universo", "Layout": "Diseño", "View": "Vista", "Show": "Mostrar",
      "Mint #": "N.º de mint", "Edition size": "Tamaño de edición",
      "Pick a collectible (optional)": "Elegir un coleccionable (opcional)",
      "By set": "Por set", "By season": "Por temporada", "Cards": "Tarjetas", "List": "Lista",
      "Missing (incomplete)": "Faltantes (incompletos)", "Complete": "Completos", "All": "Todos",
      "Where do I find my wallet address?": "¿Dónde encuentro mi dirección de wallet?", "Try:": "Prueba:"
    }
  };
  var LANGS = [['en', '🌐 EN'], ['de', 'DE'], ['fr', 'FR'], ['es', 'ES']];

  function currentLang() { try { return localStorage.getItem('veve_lang') || 'en'; } catch (e) { return 'en'; } }

  function injectToggle(cur) {
    var nav = document.querySelector('.topbar .main');
    if (!nav || document.getElementById('langsel')) return;
    var sel = document.createElement('select');
    sel.id = 'langsel';
    sel.title = 'Language · Sprache · Langue · Idioma';
    sel.style.cssText = 'margin-left:12px;background:var(--panel,#1a1d2e);border:1px solid var(--border);color:var(--muted);border-radius:999px;padding:4px 8px;font-size:12px;font-weight:700;cursor:pointer';
    LANGS.forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
      if (o[0] === cur) op.selected = true; sel.appendChild(op);
    });
    sel.addEventListener('change', function () {
      try { localStorage.setItem('veve_lang', sel.value); } catch (e) {}
      location.reload();
    });
    nav.appendChild(sel);
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
    if (DICT[lang]) { document.documentElement.lang = lang; translate(lang); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
