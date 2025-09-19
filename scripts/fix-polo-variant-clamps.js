require('dotenv').config();
const { assertRequired } = require('../src/config');
const { translateProductOptionsForProduct } = require('../src/services/translateProductOptions.service');
const { clearVariantOptionsCache } = require('../src/utils/variantOptions');
assertRequired();
clearVariantOptionsCache();

const gid = 'gid://shopify/Product/10360889835867';
(async () => {
  console.log(await translateProductOptionsForProduct(gid));
})();
