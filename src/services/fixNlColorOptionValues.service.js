const { graphql, listAllProductGids } = require('./shopify.service');
const { logger } = require('../utils/logger');

const PRODUCT_OPTIONS = `
  query($id: ID!) {
    product(id: $id) {
      id
      options {
        id
        name
        optionValues { id name }
      }
    }
  }
`;

const OPTION_UPDATE = `
  mutation($productId: ID!, $option: OptionUpdateInput!, $optionValuesToUpdate: [OptionValueUpdateInput!]) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToUpdate: $optionValuesToUpdate
    ) {
      userErrors { field message }
    }
  }
`;

/** English/Dutch color value → NL catalog source. */
const TO_NL = {
  Red: 'Rood',
  Black: 'Zwart',
  Blue: 'Blauw',
  White: 'Wit',
  Green: 'Groen',
  Grey: 'Grijs',
  Gray: 'Grijs',
  Yellow: 'Geel',
  Orange: 'Oranje',
  Purple: 'Paars',
};

const COLOR_OPTION = /^(color|kleur|farbe|couleur|colore)$/i;

/**
 * Rename English color option values on NL source products (Red → Rood, etc.).
 * @param {string[]} [productGids]
 */
async function fixNlColorOptionValues(productGids) {
  const gids = productGids?.length ? productGids : await listAllProductGids();
  let updated = 0;
  let scanned = 0;

  for (const productGid of gids) {
    scanned += 1;
    let product;
    try {
      const data = await graphql(PRODUCT_OPTIONS, { id: productGid });
      product = data?.product;
      if (!product?.options?.length) continue;
    } catch (e) {
      logger.debug('fix_nl_color_skip', { productGid, error: e.message });
      continue;
    }

    for (const opt of product.options) {
      if (!COLOR_OPTION.test(String(opt.name || ''))) continue;
      const toUpdate = [];
      for (const ov of opt.optionValues || []) {
        const nlName = TO_NL[ov.name];
        if (nlName && nlName !== ov.name) {
          toUpdate.push({ id: ov.id, name: nlName });
        }
      }
      if (!toUpdate.length) continue;

      try {
        const res = await graphql(OPTION_UPDATE, {
          productId: product.id,
          option: { id: opt.id },
          optionValuesToUpdate: toUpdate,
        });
        const errs = res?.productOptionUpdate?.userErrors || [];
        if (errs.length) {
          logger.warn('fix_nl_color_errors', { productGid, errs });
          continue;
        }
        updated += toUpdate.length;
        logger.info('fix_nl_color_renamed', {
          productGid,
          option: opt.name,
          values: toUpdate.map((v) => v.name),
        });
      } catch (e) {
        logger.warn('fix_nl_color_failed', { productGid, error: e.message });
      }
    }
  }

  return { scanned, updated };
}

module.exports = { fixNlColorOptionValues };
