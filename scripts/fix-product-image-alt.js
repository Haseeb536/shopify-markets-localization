/**
 * Set descriptive product image ALT from product title (NL source + locale translations).
 * Usage: node scripts/fix-product-image-alt.js
 */
require('dotenv').config();
const { assertRequired, config } = require('../src/config');
const {
  graphql,
  listAllProductGids,
  registerTranslationsReliable,
  getShopPublishedLocaleCodes,
} = require('../src/services/shopify.service');

function norm(l) {
  return String(l || '').toLowerCase().split('-')[0];
}

(async () => {
  assertRequired();
  const src = norm(config.locales.source);
  const published = new Set((await getShopPublishedLocaleCodes()).map(norm));
  const targets = config.locales.targets.map(norm).filter((l) => published.has(l) && l !== src);
  const gids = await listAllProductGids();

  let mediaUpdated = 0;
  let translationsRegistered = 0;

  for (const gid of gids) {
    const data = await graphql(
      `query($id: ID!) {
        product(id: $id) {
          title
          featuredMedia { id alt preview { image { altText } } }
          media(first: 5) {
            nodes {
              ... on MediaImage { id alt image { altText } }
            }
          }
        }
      }`,
      { id: gid }
    );
    const product = data.product;
    if (!product) continue;

    const nlAlt = String(product.title || '').trim();
    if (!nlAlt) continue;

    const mediaNodes = (product.media?.nodes || []).filter((n) => n?.id);
    const featured = product.featuredMedia?.id;
    const toFix = mediaNodes.length
      ? mediaNodes
      : featured
        ? [{ id: featured, alt: product.featuredMedia?.alt }]
        : [];

    for (const node of toFix) {
      const currentAlt = String(node.alt || node.image?.altText || '').trim();
      if (currentAlt === nlAlt) {
        // still register locale alts below
      } else if (!currentAlt) {
        const res = await graphql(
          `mutation($productId: ID!, $media: [UpdateMediaInput!]!) {
            productUpdateMedia(productId: $productId, media: $media) {
              media { id alt }
              mediaUserErrors { field message }
            }
          }`,
          { productId: gid, media: [{ id: node.id, alt: nlAlt }] }
        );
        const errs = res.productUpdateMedia?.mediaUserErrors || [];
        if (!errs.length) {
          mediaUpdated += 1;
        } else {
          console.warn('media alt NL failed', gid.split('/').pop(), errs[0]?.message);
        }
      }

      let tr;
      try {
        tr = await graphql(
          `query($id: ID!) {
            translatableResource(resourceId: $id) {
              resourceId
              translatableContent { key value digest locale }
              translations(locale: "de") { key value }
            }
          }`,
          { id: node.id }
        );
      } catch {
        continue;
      }
      const content = tr.translatableResource?.translatableContent || [];
      const altRow = content.find((c) => c.key === 'alt' && c.digest);
      if (!altRow) continue;

      for (const locale of targets) {
        const prodTr = await graphql(
          `query($id: ID!, $l: String!) {
            translatableResource(resourceId: $id) {
              translations(locale: $l) { key value }
            }
          }`,
          { id: gid, l: locale }
        );
        const localeTitle =
          prodTr.translatableResource?.translations?.find((t) => t.key === 'title')?.value || '';
        if (!localeTitle?.trim()) continue;

        const existing =
          (
            await graphql(
              `query($id: ID!, $l: String!) {
                translatableResource(resourceId: $id) {
                  translations(locale: $l) { key value }
                }
              }`,
              { id: node.id, l: locale }
            )
          ).translatableResource?.translations?.find((t) => t.key === 'alt')?.value || '';

        if (existing?.trim() === localeTitle.trim()) continue;

        await registerTranslationsReliable(node.id, [
          {
            locale,
            key: 'alt',
            value: localeTitle.trim(),
            translatableContentDigest: altRow.digest,
          },
        ]);
        translationsRegistered += 1;
      }
    }
  }

  console.log({ products: gids.length, mediaUpdated, translationsRegistered });
})().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
