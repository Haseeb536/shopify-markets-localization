require('dotenv').config();

const { assertRequired } = require('../src/config');
const { graphql, fetchTranslatableResource, Gid } = require('../src/services/shopify.service');

const productId = process.argv[2];

(async () => {
  try {
    assertRequired();
    const data = await graphql(`{ shopLocales { locale primary published } }`, {});
    // eslint-disable-next-line no-console
    console.log('Shop locales:', JSON.stringify(data.shopLocales, null, 2));

    if (productId) {
      const gid = Gid.product(productId);
      const tr = await fetchTranslatableResource(gid);
      const byLocale = {};
      for (const c of tr.translatableContent || []) {
        const loc = c.locale || '(empty)';
        if (!byLocale[loc]) byLocale[loc] = [];
        byLocale[loc].push(c.key);
      }
      // eslint-disable-next-line no-console
      console.log(`\nProduct ${productId} translatable fields by locale:`);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(byLocale, null, 2));
    } else {
      // eslint-disable-next-line no-console
      console.log('\nTip: node scripts/check-shop-locales.js PRODUCT_NUMERIC_ID');
    }
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e.message);
    process.exit(1);
  }
})();
