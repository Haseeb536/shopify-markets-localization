/**
 * Restore product.json accordion blocks removed by apply-remaining-fixes.js
 * - content_VdNWWq (Toepasbaarheid / applicability)
 * - content_NXhqmi (14 dagen retour — had the real return-policy body)
 */
require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
const { getMainTheme } = require('../src/services/shopify.service');

assertRequired();

const RETURN_NL = `<p>Je hebt recht je bestelling tot 14 dagen na ontvangst zonder opgave van rede te annuleren. Je hebt na annulering nogmaals 14 dagen om je product retour te sturen. Je krijgt dan het volledige orderbedrag exclusief verzendkosten gecrediteerd. Een retourzending moet met tracking verzonden worden. De kosten voor retouren zijn voor eigen rekening.</p><p>Dit retourbeleid is niet van toepassing op zakelijke afnemers. Voor meer informatie verwijzen wij naar onze algemene voorwaarden voor zakelijke afnemers. <a href="https://www.jt-products.eu/algemene-voorwaarden/" target="_blank">Zie hier onze algemene voorwaarden.</a><br/><br/></p>`;

const RESTORED_BLOCKS = {
  content_VdNWWq: {
    type: 'content',
    settings: {
      title: 'Toepasbaarheid',
      content: '<p> </p>',
      page: '',
      display_mode: 'collapse',
    },
  },
  content_NXhqmi: {
    type: 'content',
    settings: {
      title: '14 dagen eenvoudig retourneren',
      content: RETURN_NL,
      page: '',
      display_mode: 'collapse',
    },
  },
};

async function putProductJson(themeId, value) {
  await axios.put(
    `${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`,
    { asset: { key: 'templates/product.json', value } },
    {
      headers: {
        'X-Shopify-Access-Token': config.shopify.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );
}

(async () => {
  const theme = await getMainTheme();
  const themeId = theme.id.split('/').pop();
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': 'templates/product.json' },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  const j = JSON.parse(res.data.asset.value);
  const main = j.sections?.main;
  if (!main?.blocks || !main.block_order) throw new Error('invalid product.json');

  let changed = false;
  for (const [id, block] of Object.entries(RESTORED_BLOCKS)) {
    if (!main.blocks[id]) {
      main.blocks[id] = block;
      changed = true;
    }
  }

  const accordionTail = ['content_VdNWWq', 'content_qVRxey', 'content_NXhqmi', 'content_qaGgkC'];
  const order = main.block_order.filter((id) => !accordionTail.includes(id) || id === 'content_qaGgkC');
  const descIdx = order.indexOf('description');
  const before = descIdx >= 0 ? order.slice(0, descIdx + 1) : order;
  const after = descIdx >= 0 ? order.slice(descIdx + 1).filter((id) => id !== 'content_qaGgkC') : [];
  main.block_order = [
    ...before,
    ...accordionTail.filter((id) => main.blocks[id]),
    ...after,
  ];
  changed = true;

  if (!changed) {
    console.log(JSON.stringify({ restored: false, note: 'blocks_already_present' }));
    return;
  }

  await putProductJson(themeId, JSON.stringify(j, null, 2));
  console.log(JSON.stringify({ restored: true, block_order: main.block_order.filter((id) => /content_/.test(id)) }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
