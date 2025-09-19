/**
 * Optional storefront DOM fallback for edge cases (widgets, popups, JS-rendered text).
 * NOT the primary translation path — native Shopify Translations API remains authoritative.
 *
 * Usage (theme snippet, load after your app bundle):
 *   <script src="https://your-backend.example.com/public/dom-fallback.js" defer></script>
 *   <script>
 *     window.__I18N_DOM_FALLBACK__ = {
 *       locale: 'de',
 *       rules: [
 *         { selector: '[data-i18n="promo"]', map: { nl: 'Gratis verzending', de: 'Kostenloser Versand' } }
 *       ]
 *     };
 *   </script>
 */
(function () {
  const cfg = window.__I18N_DOM_FALLBACK__ || {};
  const locale = String(cfg.locale || document.documentElement.lang || 'en').split('-')[0].toLowerCase();
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];

  function applyRule(rule) {
    try {
      const nodes = document.querySelectorAll(rule.selector);
      nodes.forEach((node) => {
        const map = rule.map || {};
        const val = map[locale] || map[locale.toUpperCase()];
        if (val != null && node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) {
          node.firstChild.textContent = val;
        } else if (val != null) {
          node.textContent = val;
        }
      });
    } catch {
      /* ignore invalid selectors */
    }
  }

  function run() {
    rules.forEach(applyRule);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  if (cfg.observe === true && typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(() => run());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
