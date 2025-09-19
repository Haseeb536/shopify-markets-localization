require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

const NEEDLES = [
  /Subaru Impreza WRX/i,
  /Swift Sport ZC33S/i,
  /Turbo Inlet.*Yaris|Yaris GR.*Turbo Inlet/i,
  /Recirculation.*Yaris|Yaris GR.*Recirculation/i,
  /Oil Cooler.*Yaris|Yaris GR.*Oil Cooler/i,
];

(async () => {
  const gids = await listAllProductGids();
  for (const gid of gids) {
    const d = await graphql(
      `query($id: ID!) {
        product(id: $id) { title }
        translatableResource(resourceId: $id) {
          nl: translatableContent { key value locale }
          de: translations(locale: "de") { key value }
          fr: translations(locale: "fr") { key value }
          en: translations(locale: "en") { key value }
        }
      }`,
      { id: gid }
    );
    const title = d.product?.title || '';
    if (!NEEDLES.some((n) => n.test(title))) continue;
    const deTitle = d.translatableResource.de.find((t) => t.key === 'title')?.value || '';
    const frTitle = d.translatableResource.fr.find((t) => t.key === 'title')?.value || '';
    const deBody = d.translatableResource.de.find((t) => t.key === 'body_html')?.value || '';
    const enBody = d.translatableResource.en.find((t) => t.key === 'body_html')?.value || '';
    const nlBody = d.translatableResource.nl.find((c) => c.key === 'body_html')?.value || '';
    console.log('\n---', gid.split('/').pop(), title);
    console.log('DE title:', deTitle);
    if (/Turbo Inlet/i.test(title)) console.log('FR title:', frTitle);
    console.log('NL body start:', nlBody.slice(0, 80).replace(/\s+/g, ' '));
    console.log('EN body start:', enBody.slice(0, 80).replace(/\s+/g, ' '));
    console.log('DE body start:', deBody.slice(0, 80).replace(/\s+/g, ' '));
    console.log('EN has -->:', /^\s*-->/.test(enBody) || /<p>\s*-->/.test(enBody));
    console.log('NL has -->:', /^\s*-->/.test(nlBody) || /<p>\s*-->/.test(nlBody));
  }
})();
