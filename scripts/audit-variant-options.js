/**
 * Scan all products for untranslated variant options / Dutch option values.
 */
require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql, listAllProductGids } = require('../src/services/shopify.service');
assertRequired();

const DUTCH_VALUE = /\b(Zwart|Blauw|Rood|Groen|Geel|Grijs|Oranje|Paars|Kleur|Met Klemmen|Zonder Klemmen|Maat|Materiaal)\b/;
const DUTCH_OPTION = /\b(Kleur|Maat|Materiaal|Met Klemmen|Zonder Klemmen)\b/;

(async () => {
  const gids = await listAllProductGids();
  const hits = [];
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title options { name values } }
        translatableResource(resourceId: $id) {
          de: translations(locale: "de") { key value }
          en: translations(locale: "en") { key value }
        }
      }`,
      { id: gid }
    );
    const id = gid.split('/').pop();
    const opts = d.product?.options || [];
    const deRows = d.translatableResource?.de || [];
    const enRows = d.translatableResource?.en || [];
    const optRows = [...deRows, ...enRows].filter((r) => r.key.includes('option'));

    for (const o of opts) {
      if (DUTCH_OPTION.test(o.name)) {
        hits.push({ id, type: 'option_name_nl', name: o.name, title: d.product.title });
      }
      for (const v of o.values || []) {
        if (DUTCH_VALUE.test(v)) {
          const deVal = deRows.find((r) => r.value === v);
          if (deVal) hits.push({ id, type: 'untranslated_value', value: v, key: deVal.key });
        }
      }
    }

    for (const r of optRows) {
      if (DUTCH_OPTION.test(r.value) || DUTCH_VALUE.test(r.value)) {
        hits.push({ id, type: 'translation_still_dutch', locale: r.key, value: r.value });
      }
    }
  }
  console.log('Variant issues:', hits.length);
  for (const h of hits.slice(0, 30)) console.log(h);
  if (hits.length > 30) console.log('...', hits.length - 30, 'more');
})();
