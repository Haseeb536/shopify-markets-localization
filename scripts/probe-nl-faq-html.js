require('dotenv').config();
const { assertRequired } = require('../src/config');
const { fetchTranslatableResource } = require('../src/services/shopify.service');
assertRequired();

const id = `gid://shopify/Product/${process.argv[2] || '10360900256091'}`;

(async () => {
  const tr = await fetchTranslatableResource(id);
  const body = (tr.translatableContent || []).find((c) => c.key === 'body_html')?.value || '';
  const faqIdx = body.search(/veelgestelde vragen/i);
  console.log(body.slice(faqIdx, faqIdx + 900));
})();
