/**
 * QA Report v2 diagnostics: product + jt keys per locale, FR fallback, IT/ES tuners.
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  Gid,
  getMainTheme,
  fetchTranslationsMap,
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');

const productId = process.argv[2] || '10360905269595';

const DUTCH_MARKERS =
  /\b(vermogenstoename|inlaatbocht|Ga direct|Mijn winkel|verwachte levering|toevoegen aan winkelwagen|tevreden klanten)\b/i;
const BAD_TUNER = /\b(sintonizzator|sintonizador)/i;

(async () => {
  assertRequired();
  const productGid = Gid.product(productId);
  const themeGid = (await getMainTheme()).id;
  const published = await getShopPublishedLocaleCodes();

  console.log('Product:', productId);
  console.log('SOURCE_LOCALE (.env):', config.locales.source);
  console.log('Published:', published.join(', '));
  console.log('DeepL glossary_id in API:', process.env.DEEPL_GLOSSARY_ID ? 'set (env)' : 'NOT SENT — post-glossary only');
  console.log('');

  const nlData = await graphql(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value locale }
      }
    }`,
    { id: productGid }
  );
  const nlBody = (nlData.translatableResource?.translatableContent || []).find(
    (c) => c.key === 'body_html' && c.locale === 'nl'
  )?.value;

  for (const locale of config.locales.targets) {
    const pub = published.some((p) => p.toLowerCase().startsWith(locale));
    console.log(`## ${locale.toUpperCase()}${pub ? '' : ' (NOT PUBLISHED)'}`);
    if (!pub) {
      console.log('  → Enable in Shopify Settings → Languages\n');
      continue;
    }

    const data = await graphql(
      `query($id: ID!, $loc: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $loc) { key value }
        }
      }`,
      { id: productGid, loc: locale }
    );
    const rows = data.translatableResource?.translations || [];
    const title = rows.find((r) => r.key === 'title')?.value || '';
    const body = rows.find((r) => r.key === 'body_html')?.value || '';

    const titleOk = title && !DUTCH_MARKERS.test(title);
    const bodyOk = body && body.length > 400 && !DUTCH_MARKERS.test(body);
    const sameAsNl = body && nlBody && body.trim() === nlBody.trim();

    console.log('  title:', title.slice(0, 70) || '(missing)');
    console.log('  title OK:', titleOk ? 'yes' : 'CHECK');
    console.log('  body:', body.length, 'chars', bodyOk ? '' : 'CHECK');
    if (sameAsNl) console.log('  ⚠ body IDENTICAL to NL — storefront will show Dutch');
    else if (DUTCH_MARKERS.test(body)) console.log('  ⚠ Dutch markers in body');
    if (BAD_TUNER.test(body)) console.log('  ⚠ bad tuner homonym in body');

    const jt = await fetchTranslationsMap(themeGid, locale);
    const trust = jt.get('jt.product.trust_tuners') || '(missing)';
    console.log('  jt.product.trust_tuners:', trust);
    if (BAD_TUNER.test(trust)) console.log('  ⚠ sintonizzatori/sintonizadores in trust badge');

    console.log('');
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
