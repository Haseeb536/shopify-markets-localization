require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  for (const l of ['es', 'nl', 'en']) {
    const d = await graphql(
      `query($id: ID!, $l: String!) {
        translatableResource(resourceId: $id) {
          translations(locale: $l) { key value }
        }
      }`,
      { id: 'gid://shopify/Product/10360905269595', l }
    );
    const body = d.translatableResource.translations.find((t) => t.key === 'body_html')?.value || '';
    const markers = [
      'data-section-type',
      'product-form',
      'product_meta',
      'buy_buttons',
      'product-block-list',
      '### ',
      '<h3',
      'Añadir al carrito',
      'Add to cart',
    ];
    console.log('\n', l, 'len', body.length);
    for (const m of markers) {
      const n = (body.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
      if (n) console.log(' ', m, n);
    }
    const tail = body.slice(-2500);
    if (/product|carrito|cart|price/i.test(tail)) console.log(' tail snippet:', tail.slice(0, 800).replace(/\s+/g, ' '));
  }
})();
