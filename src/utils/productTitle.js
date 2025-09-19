/** Vehicle makes common in Forge / Scorpion catalog titles. */
const VEHICLE_MAKES =
  'Volkswagen|Toyota|Skoda|Audi|BMW|Ford|Honda|Hyundai|Kia|Mazda|Nissan|Peugeot|Renault|Seat|Vauxhall|Opel|Mini|Mercedes|Fiat|Cupra|Gruppe|Suzuki';

/** Models that appear without make prefix in English source titles. */
const VEHICLE_MODELS = 'Polo|Fabia|Golf|Yaris|Corolla|Octavia|Leon|Ibiza|Arona|Civic|Focus|Fiesta|Mini|Cooper|A1|A3|up!';

const ENGLISH_TITLE_FRAGMENTS =
  /\b(Carbon Induction Intake|Carbon Fiber Intake|Motorsport Carbon Induction Intake|Intake Kit|Motorsport|Oil Cooler Kit|Blow-Off Valve|Downpipe|Catback|Intercooler Kit)\b/i;

/** Product-type lead words after glossary (any locale). */
const PRODUCT_LEAD =
  'Kit|Intake|Admission|Aspirazione|Admisión|Ansaug|Carbon|Motorsport|Dolot|Zestaw|Système|Sistema|Oil|Ladeluft|Intercooler|Downpipe|Radiateur|radiateur|soupape|Wlot|Ölkühler|Ladeluftkühler|Refrigerador|Radiatore';

/** @type {Record<string, string>} */
const LOCALE_PREP = {
  fr: 'pour',
  de: 'für',
  it: 'per',
  es: 'para',
  pl: 'dla',
  en: 'for',
};

/**
 * Forge {product} {vehicle} → locale word order with preposition.
 * EN keeps Forge-first: Forge {product} for {vehicle}.
 * @param {string} title
 * @param {string} locale
 */
function applyProductTitleLocalePost(title, locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  const prep = LOCALE_PREP[loc];
  if (!prep || !title?.trim()) return title;

  const vehicleFirst = new RegExp(`^Forge\\s+(.+?)\\s+(${VEHICLE_MAKES})\\b(.+)$`, 'i');
  const m = title.match(vehicleFirst);
  if (m) {
    const productPart = m[1].trim();
    const make = m[2];
    const rest = (m[3] || '').trim();
    const vehicle = `${make}${rest ? ` ${rest}` : ''}`;
    if (loc === 'en') {
      return `Forge ${productPart} ${prep} ${vehicle}`;
    }
    return `${productPart} Forge ${prep} ${vehicle}`;
  }

  const vehicleLast = new RegExp(
    `^Forge\\s+(${VEHICLE_MAKES}\\b\\s+(?:\\S+\\s+)*\\S+)\\s+((?:${PRODUCT_LEAD})\\b.+)$`,
    'i'
  );
  const r = title.match(vehicleLast);
  if (r) {
    const vehicle = r[1].trim();
    const productPart = r[2].trim();
    if (loc === 'en') {
      return `Forge ${productPart} ${prep} ${vehicle}`;
    }
    return `${productPart} Forge ${prep} ${vehicle}`;
  }

  const modelOnly = new RegExp(`^Forge\\s+(.+?)\\s+(${VEHICLE_MODELS})\\b(.+)$`, 'i');
  const mo = title.match(modelOnly);
  if (mo) {
    const productPart = mo[1].trim();
    const vehicle = `${mo[2]}${(mo[3] || '').trim() ? ` ${mo[3].trim()}` : ''}`;
    if (loc === 'en') {
      return `Forge ${productPart} ${prep} ${vehicle}`;
    }
    return `${productPart} Forge ${prep} ${vehicle}`;
  }

  return title;
}

/**
 * Move trailing "Kit" before product phrase: "válvula Kit Forge" → "Kit válvula Forge".
 * @param {string} title
 * @param {string} locale
 */
function fixKitWordOrderInTitle(title, locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  if (!['fr', 'it', 'es'].includes(loc)) return title;
  let out = String(title || '');
  out = out.replace(/^(.+?)\s+Kit\s+(Forge\s+)/i, 'Kit $1 $2');
  out = out.replace(/^Forge\s+(.+?)\s+kit\s+/i, 'Forge Kit $1 ');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Replace Dutch " en " (= and) between models with locale conjunction in titles.
 * Skips FR product phrases like "Admission en fibre de carbone" (en + lowercase).
 * @param {string} title
 * @param {string} locale
 */
function fixDutchEnInTitle(title, locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  const map = { de: ' und ', en: ' and ', fr: ' et ', it: ' e ', es: ' y ' };
  const rep = map[loc];
  if (!rep) return title;
  return String(title || '').replace(/\s+en\s+(?=[A-Z0-9])/gi, rep);
}

/**
 * FR carbon-intake titles: "fibre de carbone Intake Forge pour …" → "Admission en fibre de carbone Forge pour …".
 * @param {string} title
 * @param {string} locale
 */
function fixFrenchTitlePolish(title, locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  if (loc !== 'fr') return title;
  let out = String(title || '').trim();
  out = out.replace(
    /^(?:fibre de carbone|Fibre de carbone)\s+Intake\s+Forge\s+pour\s+/i,
    'Admission en fibre de carbone Forge pour '
  );
  out = out.replace(
    /^Admission carbone\s+Forge\s+pour\s+/i,
    'Admission en fibre de carbone Forge pour '
  );
  out = out.replace(/^Intake\s+Forge\s+pour\s+/i, 'Forge Intake pour ');
  out = out.replace(/\bAdmission\s+et\s+fibre de carbone\b/gi, 'Admission en fibre de carbone');
  out = out.replace(/\badmission d'air par induction\s+et\s+carbone\b/gi, "Admission d'air par induction en carbone");
  return out;
}

/**
 * Brand + enthusiast term fixes on product titles (post-glossary).
 * @param {string} title
 * @param {string} locale
 * @param {string} [nlTitle]
 */
function fixTitleTerminologyPost(title, locale, nlTitle) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  let out = String(title || '').trim();
  const src = String(nlTitle || '');

  out = out.replace(/\bSchmiede\b/gi, 'Forge');
  out = out.replace(/\bschmieden\b/gi, 'Forge');
  out = out.replace(/\bforgia\b/gi, 'Forge');
  out = out.replace(/\bdella\s+forgia\b/gi, 'Forge');
  out = out.replace(/\bde\s+la\s+forja\b/gi, 'Forge');
  out = out.replace(/\bdella\s+Forge\b/gi, 'Forge');
  out = out.replace(/\bdel\s+Forge\b/gi, 'Forge');
  out = out.replace(/\bAusblasventil\b/gi, 'Blow-Off-Ventil');
  out = out.replace(/\bForge(?=[A-Za-zÀ-ÿÄÖÜäöü])/g, 'Forge ');
  out = out.replace(/\bForgekühler\b/gi, 'Kühler');
  out = out.replace(/\bForgeölkühler\b/gi, 'Kühler');
  out = out.replace(/\bForgeumluftventil\b/gi, 'Recirculation Valve');
  out = out.replace(/\bkühler\s+Forge\b/gi, 'Kühler Forge');
  out = out.replace(/\bTurboeinlass\b/gi, 'Turbo Inlet');
  out = out.replace(/\bTurbo-Einlass\b/gi, 'Turbo Inlet');
  out = out.replace(/\badmission turbo\b/gi, 'Turbo Inlet');
  out = out.replace(/\badmisión turbo\b/gi, 'Turbo Inlet');
  out = out.replace(/\baspirazione turbo\b/gi, 'Turbo Inlet');
  out = out.replace(/\bingresso turbo\b/gi, 'Turbo Inlet');

  out = out.replace(/\bTurbo\s+Einlass\b/gi, 'Turbo Inlet');
  out = out.replace(/\bTurbo-Einlass\b/gi, 'Turbo Inlet');
  out = out.replace(/\bUmgehungsventil\b/gi, 'Recirculation Valve');
  out = out.replace(/\bUmluftventil\b/gi, 'Recirculation Valve');
  out = out.replace(/\bRückführventil\b/gi, 'Recirculation Valve');

  if (/radiateur\b/i.test(src) && !/oliekoeler|oil cooler/i.test(src)) {
    if (loc === 'en') out = out.replace(/\boil cooler\b/gi, 'Radiator');
    if (loc === 'fr') {
      out = out.replace(/\bradiateur d'huile\b/gi, 'Radiateur');
      out = out.replace(/\brefroidisseur d'huile\b/gi, 'Radiateur');
    }
    if (loc === 'de') out = out.replace(/\bölkühler\b/gi, 'Kühler');
    if (loc === 'it') out = out.replace(/\bradiatore olio\b/gi, 'Radiatore');
    if (loc === 'es') out = out.replace(/\bradiador de aceite\b/gi, 'Radiador');
  }

  if (/recirculat/i.test(src) && /\b(blow.?off|ausblasventil)/i.test(out)) {
    out = out.replace(/\bBlow-Off-Ventil\b/gi, 'Recirculation Valve');
    out = out.replace(/\bAusblasventil\b/gi, 'Recirculation Valve');
    out = out.replace(/\bBlow-Off-Ventil\s+Kit\b/gi, 'Recirculation Valve Kit');
    out = out.replace(/\bAusblasventil[s-]*Kit\b/gi, 'Recirculation Valve Kit');
  }

  if (loc === 'fr' && /refroidissement\b/i.test(out) && /oil cooler|oliekoeler/i.test(src)) {
    out = out.replace(/\brefroidissement\b/gi, 'refroidisseur');
  }

  out = out.replace(/\bKit\s+Kit\b/gi, 'Kit');
  out = out.replace(/\bturbo\s+Blanket\b/gi, 'Turbo Blanket');
  out = out.replace(/\bCambio\s+Corto\b/gi, 'Short Shift');
  out = out.replace(/\bcambio\s+corto\b/gi, 'Short Shift');
  out = out.replace(/\bchangement de vitesse court\b/gi, 'Short Shift');
  out = out.replace(/\bchangement de vitesses court\b/gi, 'Short Shift');
  out = out.replace(/\blevier de vitesses court\b/gi, 'Short Shift');
  out = out.replace(/\blevier de vitesse court\b/gi, 'Short Shift');
  out = out.replace(/\bkit de changement de vitesse court\b/gi, 'Kit de Short Shift');
  out = out.replace(/\bkit de levier de vitesses court\b/gi, 'Kit de Short Shift');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * SEO / browser title polish (same translatable `title` key when product.seo.title is empty).
 * @param {string} title
 * @param {string} locale
 * @param {string} [nlTitle]
 */
function fixSeoTitlePost(title, locale, nlTitle) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  let out = String(title || '').trim();
  const src = String(nlTitle || '');

  out = out.replace(/\bAnsaugrohr\s+schmieden\b/gi, 'Forge Ansaugkanal');
  out = out.replace(/\bIntake\s+Kanal\s+schmieden\b/gi, 'Forge Intake Kanal');

  if (/\bForge\b/i.test(src) && !/\bForge\b/i.test(out)) {
    if (loc === 'it' && /^Condotto di aspirazione\b/i.test(out)) {
      out = out.replace(/^Condotto di aspirazione\b/i, 'Forge Intake Canale');
    } else if (loc === 'de' && /^Ansaugrohr\b/i.test(out)) {
      out = out.replace(/^Ansaugrohr\b/i, 'Forge Ansaugkanal');
    } else if (loc === 'de' && /^einlass\b/i.test(out)) {
      out = out.replace(/^einlass\b/i, 'Lufteinlass');
    }
  }

  if (loc === 'fr') {
    out = out.replace(/\bAdmission\s+ET\s+fibre de carbone\b/gi, 'Admission en fibre de carbone');
    out = out.replace(/\badmission d'air par induction\s+ET\s+carbone\b/gi, "Admission d'air par induction en carbone");
    out = out.replace(/^fibre de carbone\s+Admission d'air par induction\s+Forge\b/i, 'Admission en fibre de carbone Forge');
  }

  if (loc === 'es') {
    out = out.replace(/^de fibra de carbono de admisión\s+Forge\b/i, 'Admisión de fibra de carbono Forge');
    out = out.replace(/^fibra de carbono\s+Admisión por inducción\s+Forge\b/i, 'Admisión de fibra de carbono Forge');
    out = out.replace(/^de admisión\s+Forge\b/i, 'Admisión Forge');
  }

  if (loc === 'de') {
    out = out.replace(/^einlass\s+Forge\b/i, 'Lufteinlass Forge');
    out = out.replace(/^Carbon Induction Ansaugung\s+Forge\b/i, 'Forge Carbon Induction Ansaugung');
    out = out.replace(/^Carbon Intake Forge für\b/i, 'Forge Carbon Intake für');
  }

  if (/\bInlaatkanaal\b/i.test(src)) {
    if (loc === 'de') {
      out = out.replace(/^(?:Intake Forge|Lufteinlass Forge) für\b/i, 'Forge Ansaugkanal für');
      out = out.replace(/^Forge Intake Kanal für\b/i, 'Forge Ansaugkanal für');
    }
    if (loc === 'it') {
      out = out.replace(/^Intake Canale di aspirazione Forge per\b/i, 'Forge Intake Canale per');
      out = out.replace(/^Forge Intake Kanal per\b/i, 'Forge Intake Canale per');
      out = out.replace(/^Condotto di aspirazione\b/i, 'Forge Intake Canale');
      out = out.replace(/\bKanal\b/gi, 'Canale');
    }
  }

  if (/\bCarbon Fiber Intake\b/i.test(src)) {
    if (loc === 'es') {
      out = out.replace(/^Toma de aire de fibra de carbono Forge para\b/i, 'Admisión de fibra de carbono Forge para');
      out = out.replace(/^Toma de aire de fibra de carbono\b/i, 'Admisión de fibra de carbono Forge');
    }
  }

  if (/\bForge Intake\b/i.test(src) && !/\b(carbon|fiber|fibre|induction|inlaatkanaal|channel|kanal)/i.test(src)) {
    if (loc === 'de') out = out.replace(/^Intake Forge für\b/i, 'Lufteinlass Forge für');
    if (loc === 'es') out = out.replace(/^Intake Forge para\b/i, 'Admisión Forge para');
  }

  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * @param {string} title
 * @param {string} locale
 * @param {string} nlTitle
 */
function seoTitleNeedsFix(title, locale, nlTitle) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  const t = String(title || '');
  const src = String(nlTitle || '');
  if (titleHasTerminologyBug(title, locale, nlTitle)) return true;
  if (/\bschmieden\b/i.test(t)) return true;
  if (/\bForge\b/i.test(src) && !/\bForge\b/i.test(t)) return true;
  if (/\bAdmission\s+et\s+fibre de carbone\b/i.test(t)) return true;
  if (/\badmission d'air par induction\s+et\s+carbone\b/i.test(t)) return true;
  if (/^de fibra de carbono/i.test(t) || /^de admisión\s+Forge/i.test(t)) return true;
  if (/^fibre de carbone\s+Admission/i.test(t) || /^fibra de carbono\s+Admisión/i.test(t)) return true;
  if (/^einlass\s+Forge/i.test(t)) return true;
  if (/^Intake Forge (für|para)\b/i.test(t) && /\b(Inlaatkanaal|Forge Intake)\b/i.test(src)) return true;
  if (/^Toma de aire de fibra de carbono/i.test(t)) return true;
  if (/^Carbon Intake Forge für/i.test(t)) return true;
  if (loc === 'it' && /\bKanal\b/i.test(t)) return true;
  return false;
}

/**
 * @param {string} title
 * @param {string} locale
 * @param {string} nlTitle
 */
function seoTitleNeedsFullReprocess(title, locale, nlTitle) {
  const t = String(title || '');
  const src = String(nlTitle || '');
  if (/\bschmieden\b/i.test(t)) return true;
  if (/\bForge\b/i.test(src) && !/\bForge\b/i.test(t)) return true;
  if (/^einlass\s+Forge/i.test(t)) return true;
  if (/^de fibra de carbono|^de admisión|^fibra de carbono\s+Admisión|^fibre de carbone\s+Admission/i.test(t)) return true;
  if (/^Toma de aire de fibra de carbono/i.test(t)) return true;
  if (/^Condotto di aspirazione\b/i.test(t)) return true;
  return false;
}

/**
 * True when locale title has known terminology bugs vs NL source.
 * @param {string} title
 * @param {string} locale
 * @param {string} nlTitle
 */
function titleHasTerminologyBug(title, locale, nlTitle) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  const t = String(title || '');
  const src = String(nlTitle || '');
  if (loc === 'de' && /\bSchmiede\b/i.test(t)) return true;
  if (loc === 'de' && /\bAusblasventil\b/i.test(t)) return true;
  if (loc === 'de' && /\b(Turbo\s+Einlass|Umgehungsventil)\b/i.test(t)) return true;
  if (/recirculat/i.test(src) && /\b(blow.?off|ausblasventil|umgehungsventil)/i.test(t)) return true;
  if (/\bturbo inlet\b/i.test(src) && /\b(turboeinlass|turbo-einlass|turbo einlass|admission turbo|admisión turbo|ingresso turbo|aspirazione turbo)/i.test(t)) return true;
  if (/\bshort shift\b/i.test(src) && /\b(changement de vitesse court|changement de vitesses court|levier de vitesses court|levier de vitesse court|cambio corto|levier court|palanca corta|kurzschalthebel)/i.test(t)) return true;
  if (/\s+en\s+(?=[A-Z0-9])/i.test(t) && ['it', 'fr', 'es'].includes(loc)) return true;
  if (loc === 'en' && /\bturbo\s+Blanket\b/i.test(t)) return true;
  if (loc === 'fr' && /^Intake\s+Forge\s+pour\s+/i.test(t)) return true;
  if (/\bschmieden\b/i.test(t)) return true;
  if (/\bForge\b/i.test(src) && !/\bForge\b/i.test(t)) return true;
  if (/\bAdmission\s+et\s+fibre de carbone\b/i.test(t)) return true;
  if (/\badmission d'air par induction\s+et\s+carbone\b/i.test(t)) return true;
  if (/^de fibra de carbono/i.test(t) || /^de admisión\s+Forge/i.test(t)) return true;
  if (/^fibre de carbone\s+Admission/i.test(t) || /^fibra de carbono\s+Admisión/i.test(t)) return true;
  if (loc === 'it' && /\bKanal\b/i.test(t)) return true;
  if (loc === 'de' && /^einlass\s+Forge/i.test(t)) return true;
  if (/\bForja\b/i.test(t)) return true;
  if (/\bforgia\b/i.test(t)) return true;
  if (/\bForge[a-zäöü]/i.test(t)) return true;
  if (/\bSchakelpook\b/i.test(t)) return true;
  if (/radiateur\b/i.test(src) && !/oliekoeler|oil cooler/i.test(src)) {
    if (loc === 'en' && /\boil cooler\b/i.test(t)) return true;
    if (loc === 'fr' && /\bradiateur d'huile\b/i.test(t)) return true;
    if (loc === 'de' && /\bölkühler\b/i.test(t)) return true;
    if (loc === 'it' && /\bradiatore olio\b/i.test(t)) return true;
    if (loc === 'es' && /\bradiador de aceite\b/i.test(t)) return true;
  }
  return false;
}

/**
 * True when a non-English locale title still looks like untranslated English.
 * @param {string} title
 * @param {string} locale
 * @param {string} sourceTitle
 */
function needsEnglishTitleRetranslation(title, locale, sourceTitle) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  if (loc === 'en') return false;
  const t = String(title || '').trim();
  if (!t) return true;
  if (t === String(sourceTitle || '').trim()) return true;
  return ENGLISH_TITLE_FRAGMENTS.test(t);
}

/**
 * True when a locale title still uses English Forge-first order and needs restructuring.
 * @param {string} title
 */
function needsForgeTitleRestructure(title) {
  const t = String(title || '').trim();
  if (!/^Forge\b/i.test(t)) return false;
  const vehicleFirst = new RegExp(`^Forge\\s+.+\\s+(${VEHICLE_MAKES})\\b`, 'i');
  const vehicleLast = new RegExp(
    `^Forge\\s+(${VEHICLE_MAKES})\\b.+\\s+((?:${PRODUCT_LEAD})\\b)`,
    'i'
  );
  const modelOnly = new RegExp(`^Forge\\s+.+\\s+(${VEHICLE_MODELS})\\b`, 'i');
  return vehicleFirst.test(t) || vehicleLast.test(t) || modelOnly.test(t);
}

/**
 * @param {string} title
 * @param {string} locale
 * @param {string} sourceTitle
 */
function needsTitleReprocessing(title, locale, sourceTitle) {
  const t = String(title || '').trim();
  if (!t) return true;
  if (t === String(sourceTitle || '').trim()) return true;
  if (needsEnglishTitleRetranslation(title, locale, sourceTitle)) return true;
  return needsForgeTitleRestructure(title);
}

module.exports = {
  applyProductTitleLocalePost,
  fixKitWordOrderInTitle,
  fixDutchEnInTitle,
  fixFrenchTitlePolish,
  fixTitleTerminologyPost,
  fixSeoTitlePost,
  seoTitleNeedsFix,
  seoTitleNeedsFullReprocess,
  titleHasTerminologyBug,
  needsEnglishTitleRetranslation,
  needsForgeTitleRestructure,
  needsTitleReprocessing,
  ENGLISH_TITLE_FRAGMENTS,
  LOCALE_PREP,
};
