require('dotenv').config();
const axios = require('axios');
const { assertRequired, config } = require('../src/config');
assertRequired();

const MAIN = '196825383259';
const BACKUP = '187114062171';

async function getAsset(themeId, key) {
  const res = await axios.get(`${config.shopify.adminBaseUrl}/themes/${themeId}/assets.json`, {
    params: { 'asset[key]': key },
    headers: { 'X-Shopify-Access-Token': config.shopify.accessToken },
  });
  return res.data?.asset?.value || '';
}

(async () => {
  for (const key of ['templates/product.json', 'sections/header.liquid']) {
    const [main, backup] = await Promise.all([getAsset(MAIN, key), getAsset(BACKUP, key)]);
    console.log('\n===', key, '===');
    if (key.endsWith('.json')) {
      const mj = JSON.parse(main);
      const bj = JSON.parse(backup);
      console.log('main description mode:', mj.sections?.main?.blocks?.description?.settings?.display_mode);
      console.log('backup description mode:', bj.sections?.main?.blocks?.description?.settings?.display_mode);
      console.log('main block_order:', mj.sections?.main?.block_order);
      console.log('backup block_order:', bj.sections?.main?.block_order);
      const mainBlocks = Object.keys(mj.sections?.main?.blocks || {});
      const backupBlocks = Object.keys(bj.sections?.main?.blocks || {});
      console.log('only in main:', mainBlocks.filter((b) => !backupBlocks.includes(b)));
      console.log('only in backup:', backupBlocks.filter((b) => !mainBlocks.includes(b)));
    } else {
      console.log('main jt_shop_name:', (main.match(/jt_shop_name/g) || []).length);
      console.log('backup jt_shop_name:', (backup.match(/jt_shop_name/g) || []).length);
      console.log('main shop.name:', (main.match(/shop\.name/g) || []).length);
      console.log('backup shop.name:', (backup.match(/shop\.name/g) || []).length);
      console.log('identical:', main === backup);
    }
  }
})();
