require('dotenv').config();
const { assertRequired } = require('../src/config');
const { listAllProductGids, graphql } = require('../src/services/shopify.service');
assertRequired();

(async () => {
  const gids = await listAllProductGids();
  const rows = [];
  for (const gid of gids) {
    const d = await graphql(`query($id: ID!) { product(id: $id) { title handle } }`, { id: gid });
    const title = d.product?.title || '';
    const handle = d.product?.handle || '';
    const titleGen = title.match(/Gen\s*(\d+)/i);
    const handleGen = handle.match(/gen-(\d+)/i);
    if (!titleGen && !handleGen) continue;
    if (!titleGen || !handleGen) {
      rows.push({ id: gid.split('/').pop(), title, handle, note: 'gen in only one field' });
      continue;
    }
    const t = Number(titleGen[1]);
    const h = Number(handleGen[1]);
    if (t !== h) {
      rows.push({ id: gid.split('/').pop(), title, handle, titleGen: t, handleGen: h, offset: h - t });
    }
  }
  console.log('Yaris/catalog Gen title vs handle mismatches:', rows.length);
  for (const r of rows) console.log(r);
})();
