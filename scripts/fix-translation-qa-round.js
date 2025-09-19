/**
 * Translation QA round — Forge flagship + global fixes.
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  getMainTheme,
  fetchTranslatableResource,
  registerTranslationsReliable,
  listAllProductGids,
} = require('../src/services/shopify.service');
const { translateShopName } = require('../src/services/translateShopName.service');
const { applyThemeStorefrontNav } = require('../src/services/themeStorefrontNav.service');
const { fixAllProductTitlesWithGlossary } = require('../src/services/fixAllProductTitles.service');
const { repairPublishedProductBodies } = require('../src/services/repairPublishedProductBodies.service');
const { applyProductBodyStructuralRepair } = require('../src/utils/productHtml');
const { loadGlossary, applyGlossaryPost, applyLocaleQaPost } = require('../src/utils/glossary');
const { toDeepLTarget } = require('../src/services/deepl.service');

assertRequired();

const FLAGSHIP = 'gid://shopify/Product/10360905269595';
const THEME_ID = '196825383259';
const RETURN_KEY = 'section.product.json.main.content_NXhqmi.content:2b7clfu88q4ht';

const FR_RETURN_HTML = `<p>Vous avez le droit d'annuler votre commande jusqu'à 14 jours après réception, sans donner de raison. Vous disposez d'un délai supplémentaire de 14 jours pour retourner votre produit après l'annulation. Vous serez alors crédité du montant total de la commande, à l'exclusion des frais d'expédition. Les retours doivent être envoyés avec un suivi. Les frais de retour sont à votre charge.</p><p>Cette politique de retour ne s'applique pas aux clients professionnels. Pour plus d'informations, veuillez consulter nos conditions générales pour les clients professionnels. <a href="https://www.jt-products.eu/algemene-voorwaarden/" target="_blank">Voir nos conditions générales ici.</a><br/><br/></p>`;

const FLAGSHIP_BODY_PATCHES = {
  de: [
    [/Der <strong>Forge Carbon Ansaugsystem<\/strong>/g, 'Das <strong>Forge Carbon-Ansaugsystem</strong>'],
  ],
  fr: [
    [/13cv/g, '13 ch'],
    [/Cette prise d'air/g, "Cette admission d'air"],
    [/cette prise d'air/g, "cette admission d'air"],
    [/prises d'air/g, "admissions d'air"],
    [/Quel est l'avantage de la fibre de carbone \?<br>/g, "Quel est l'avantage de la fibre de carbone ?<br>"],
    [/\? \./g, '?'],
    [/\.\s*\./g, '.'],
    [
      /<\/p><strong>Toyota<\/strong>\s*Yaris<\/p><strong>\.\s*<h2>/gi,
      '<p><strong>Toyota</strong> Yaris</p> <h2>',
    ],
    [/<strong>\.\s*<h2>/gi, '<h2>'],
  ],
  en: [
    [/Forge carbon fibre Intake/g, 'Forge carbon fibre intake'],
    [/branded Intake and/g, 'branded intake and'],
    [/Is this Intake direct/g, 'Is this intake direct'],
    [/this Intake is/g, 'this intake is'],
    [/carbon fibre offers/g, 'Carbon fibre offers'],
    [/<li>installation instructions<\/li>/g, '<li>Installation instructions</li>'],
    [/Forge carbon fibre Intake system/g, 'Forge carbon fibre intake system'],
    [/<li>direct mounting<\/li>/g, '<li>Direct mounting</li>'],
  ],
  de: [[/Wieviel Leistungszuwachs/g, 'Wie viel Leistungszuwachs']],
  it: [
    [/<li>staffa per l'installazione<\/li>/g, '<li>Hardware di montaggio incluso</li>'],
    [/valvola di ricircolo Kit/gi, 'Kit valvola di ricircolo'],
  ],
  es: [
    [/13cv/g, '13 CV'],
    [/<h2>¿Cuál es la ventaja de la fibra de carbono\?<\/h2><p><br>/g, '<p>¿Cuál es la ventaja de la fibra de carbono?<br>'],
    [/<h2>¿Cuánto aumento de potencia puedo esperar\?<\/h2><p><br>/g, '<p>¿Cuánto aumento de potencia puedo esperar?<br>'],
    [/<p><br>/g, '<p>'],
  ],
};

async function patchHeaderShopName() {
  const base = `${config.shopify.adminBaseUrl}/themes/${THEME_ID}/assets.json`;
  const headers = { 'X-Shopify-Access-Token': config.shopify.accessToken };
  const res = await axios.get(base, { params: { 'asset[key]': 'sections/header.liquid' }, headers });
  let content = res.data.asset.value || '';
  const logoLabel =
    "{% if shop.name == 'My Store' or shop.name == 'Mijn winkel' %}JT-Products{% else %}{{ shop.name }}{% endif %}";
  const before = content;
  content = content.replace(
    /<span class="header__logo-text">[\s\S]*?<\/span>/,
    `<span class="header__logo-text">${logoLabel}</span>`
  );
  content = content.replace(
    /<span class="visually-hidden">[\s\S]*?<\/span>\s*(?=<img class="header__logo-image")/,
    `<span class="visually-hidden">${logoLabel}</span>\n              `
  );
  content = content.replace(
    'alt="{{ section.settings.logo.alt | default: shop.name | escape }}"',
    'alt="JT-Products"'
  );
  const changed = content !== before;
  if (changed) {
    await axios.put(
      base,
      { asset: { key: 'sections/header.liquid', value: content } },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
  return { patched: changed };
}

async function fixFrReturnParagraph() {
  const theme = await getMainTheme();
  const tr = await fetchTranslatableResource(theme.id);
  const row = (tr.translatableContent || []).find((c) => c.key === RETURN_KEY && c.digest);
  if (!row) return { error: 'no_digest' };
  await registerTranslationsReliable(
    theme.id,
    [{ locale: 'fr', key: RETURN_KEY, value: FR_RETURN_HTML, translatableContentDigest: row.digest }],
    { batchSize: 1 }
  );
  return { registered: true, len: FR_RETURN_HTML.length };
}

async function registerFlagshipBodies() {
  const glossary = loadGlossary(config.paths.glossary);
  const tr = await fetchTranslatableResource(FLAGSHIP);
  const row = (tr.translatableContent || []).find((c) => c.key === 'body_html' && c.digest);
  if (!row) throw new Error('no body digest');
  const results = {};

  for (const [locale, patches] of Object.entries(FLAGSHIP_BODY_PATCHES)) {
    const data = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: FLAGSHIP, l: locale }
    );
    let body = data.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    for (const [re, rep] of patches) body = body.replace(re, rep);
    body = applyProductBodyStructuralRepair(body, locale);
    body = applyLocaleQaPost(body, locale.toUpperCase());
    body = applyGlossaryPost(body, toDeepLTarget(locale), glossary);
    await registerTranslationsReliable(
      FLAGSHIP,
      [{ locale, key: 'body_html', value: body, translatableContentDigest: row.digest }],
      { batchSize: 1 }
    );
    results[locale] = { len: body.length };
  }
  return results;
}

async function fixDutchProductTitles() {
  const gids = await listAllProductGids();
  const dutchRe =
    /\b(Verstelbare|Siliconen|slangenset|actuator|Vervangingsfilter|Vervangings|Radiateur|inlaat|koeler|montageset|Oliekoeler|Induction Intake)\b/i;
  const kitRe = /\s+Kit\s+Forge/i;
  const hits = [];
  for (const gid of gids) {
    for (const loc of ['de', 'en', 'fr', 'it', 'es']) {
      const d = await graphql(
        `query($id: ID!, $l: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $l) { key value }
          }
        }`,
        { id: gid, l: loc }
      );
      const title = d.translatableResource.translations.find((t) => t.key === 'title')?.value || '';
      if (dutchRe.test(title) || kitRe.test(title) || /\s+en\s+/i.test(title)) hits.push(gid);
    }
  }
  const unique = [...new Set(hits)];
  const titleFix = await fixAllProductTitlesWithGlossary();
  return { leakHits: unique.length, titleFix };
}

(async () => {
  const shopName = await translateShopName();
  const nav = await applyThemeStorefrontNav();
  const header = await patchHeaderShopName();
  const frReturn = await fixFrReturnParagraph();
  const titles = await fixDutchProductTitles();
  const bodies = await registerFlagshipBodies();
  const repair = await repairPublishedProductBodies([FLAGSHIP]);

  console.log(
    JSON.stringify({ shopName, nav: { localeKeys: nav.localeKeys }, header, frReturn, titles, bodies, repair }, null, 2)
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
