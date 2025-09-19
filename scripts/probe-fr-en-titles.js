require('dotenv').config();
const { assertRequired } = require('../src/config');
const { graphql } = require('../src/services/shopify.service');
assertRequired();

const IDS = ['10360888623451', '10360901468507', '10360905269595'];

(async () => {
  for (const num of IDS) {
    const id = `gid://shopify/Product/${num}`;
    const d = await graphql(
      `query($id: ID!) { tr: translatableResource(resourceId: $id) { fr: translations(locale: "fr") { key value } } }`,
      { id }
    );
    const title = d.tr.fr.find((t) => t.key === 'title')?.value;
    console.log(num, title);
  }
})();
