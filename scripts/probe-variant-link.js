require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, fetchTranslatableResource } = require('../src/services/shopify.service');

const PRODUCT = process.argv[2] || '10360905269595';

(async () => {
  assertRequired();
  const id = `gid://shopify/Product/${PRODUCT}`;
  const p = await graphql(
    `query($id: ID!) { product(id: $id) { title options { name optionValues { id name } } } }`,
    { id }
  );
  console.log('Product:', p.product?.title);
  for (const opt of p.product?.options || []) {
    console.log('Option:', opt.name);
    for (const ov of opt.optionValues || []) {
      const tr = await fetchTranslatableResource(ov.id);
      console.log(' ', ov.name, ov.id);
      for (const c of tr.translatableContent || []) {
        console.log('   ', c.locale, c.key, '=', c.value);
      }
      for (const loc of ['de', 'fr']) {
        const d = await graphql(
          `query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translations(locale: $l) { key value } } }`,
          { id: ov.id, l: loc }
        );
        const v = d.translatableResource?.translations?.find((t) => t.key === 'name' || t.key === 'value');
        console.log('   TR', loc, v?.key, '=', v?.value);
      }
    }
  }
})();
