/**
 * Product body_html: protect JSON-LD from DeepL, repair common HTML/FAQ issues.
 */
const JSONLD_SCRIPT_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const PLACEHOLDER_PREFIX = '<!--__JSONLD_BLOCK_';
const PLACEHOLDER_SUFFIX = '__-->';

/**
 * @param {string} html
 * @returns {{ html: string, jsonLdBlocks: string[] }}
 */
function extractJsonLdFromHtml(html) {
  const jsonLdBlocks = [];
  const stripped = String(html || '').replace(JSONLD_SCRIPT_RE, (_full, json) => {
    const idx = jsonLdBlocks.length;
    jsonLdBlocks.push(String(json).trim());
    return `${PLACEHOLDER_PREFIX}${idx}${PLACEHOLDER_SUFFIX}`;
  });
  return { html: stripped, jsonLdBlocks };
}

/**
 * @param {string} html
 * @param {string[]} jsonLdBlocks
 */
function injectJsonLdIntoHtml(html, jsonLdBlocks) {
  let out = String(html || '');
  for (let i = 0; i < jsonLdBlocks.length; i++) {
    const tag = `<script type="application/ld+json">\n${jsonLdBlocks[i]}\n</script>`;
    out = out.replace(`${PLACEHOLDER_PREFIX}${i}${PLACEHOLDER_SUFFIX}`, tag);
  }
  return out;
}

/**
 * @param {string} html
 */
function repairHtmlArtifacts(html) {
  let out = String(html || '');
  out = out.replace(/^\s*-->\s*/g, '');
  out = out.replace(/^\s*<!--\s*>\s*/g, '');
  out = out.replace(/<!--\s*>/g, '');
  out = out.replace(/(?:^|[\s>])-->\s*(?=<p)/gi, (m) => m.replace('-->', ''));
  out = out.replace(/(<p[^>]*>)\s*-->\s*/gi, '$1');
  out = out.replace(/(<p[^>]*>)\s*<!--\s*>\s*/gi, '$1');
  out = out.replace(/^(\s*)-->\s*(<p)/i, '$1$2');
  out = out.replace(/<\/p>>+/gi, '</p>');
  out = out.replace(/^\s*<\/p>\s*/i, '');
  out = out.replace(/(<\/li>)\s*\./gi, '$1');
  out = out.replace(/(<h[23][^>]*>[\s\S]*?<\/h[23]>)\s*\.\s*/gi, '$1');
  out = out.replace(/(<\/p>)\s*\.\s*(<p)/gi, '$1$2');
  out = out.replace(/(<\/p>)\s*\.\s*(<h[23])/gi, '$1$2');
  out = out.replace(/\s\.\s*(<\/p>)/gi, '$1');
  out = out.replace(/([a-zA-Zà-üÀ-Ü])\.\s*\./g, '$1.');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

const { getAbbrMonthMaps } = require('./monthLabels');

/** English month abbrev → localized (delivery ranges in product HTML / theme). */
const MONTH_ABBR_BY_LOCALE = getAbbrMonthMaps();

/**
 * Localize "8 jun - 11 jun" style ranges embedded in HTML.
 * @param {string} html
 * @param {string} locale
 */
function localizeDeliveryDateRanges(html, locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  const map = MONTH_ABBR_BY_LOCALE[loc] || MONTH_ABBR_BY_LOCALE.en;
  return String(html || '').replace(
    /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi,
    (_m, day, mon) => {
      const key = mon.toLowerCase();
      const label = map[key] || mon;
      if (loc === 'de') return `${day}. ${label}`;
      return `${day} ${label}`;
    }
  );
}

function normalizeFaqText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[?.!…]+$/g, '');
}

function extractFaqBlock(html) {
  const re =
    /(<h2[^>]*>[^<]*(?:FAQ|frequen|gestellte|Questions|Preguntas|domande|Veelgestelde)[^<]*<\/h2>\s*)(<p[^>]*>)([\s\S]*?)(<\/p>)/i;
  const m = String(html || '').match(re);
  if (!m) return null;
  return { full: m[0], h2: m[1], pOpen: m[2], inner: m[3], pClose: m[4] };
}

function faqBlockIsCorrupt(inner) {
  if (/<br><br>[^<]{8,}?\?\s*<strong>/i.test(inner)) return true;
  if (/<\/strong><br>[^<]+<br><br>[^<]{15,}<br><br>/i.test(inner)) return true;
  if (/\?\s*\./.test(inner)) return true;
  const strongs = (inner.match(/<strong>/gi) || []).length;
  const questions = (inner.match(/\?/g) || []).length;
  return questions > strongs + 1;
}

/**
 * Rebuild corrupted FAQ blocks from <strong> Q/A pairs (ES-style pipeline).
 * @param {string} html
 */
function rebuildFaqFromStrongTags(html) {
  const block = extractFaqBlock(html);
  if (!block || !faqBlockIsCorrupt(block.inner)) return html;

  const segments = block.inner.split(/<strong>/i).slice(1);
  /** @type {Array<{ q: string, a: string }>} */
  const pairs = [];
  for (const seg of segments) {
    const qEnd = seg.indexOf('</strong>');
    if (qEnd < 0) continue;
    const q = seg.slice(0, qEnd).trim();
    let tail = seg.slice(qEnd + 9).replace(/^<br>/i, '');
    tail = tail.split(/<br><br>/i)[0];
    tail = tail.replace(/<br>$/i, '').trim();
    tail = tail.replace(/\s+[^<]{8,}?\?\s*$/i, '').trim();
    const a = tail.replace(/<br>/gi, ' ').trim();
    if (!q || !a) continue;
    const nq = normalizeFaqText(q);
    if (pairs.some((p) => normalizeFaqText(p.q) === nq)) continue;
    pairs.push({ q, a });
  }

  if (pairs.length < 2) return html;

  const rebuilt = pairs
    .map((p, i) => `${i ? '<br><br>' : ''}<strong>${p.q}</strong><br>${p.a}`)
    .join('');

  return html.replace(block.full, block.h2 + block.pOpen + rebuilt + block.pClose);
}

/** @type {Record<string, string>} */
const SET_INSTALL_LINE = {
  it: 'Istruzioni di montaggio incluse',
  es: 'Instrucciones de instalación incluidas',
  en: 'Installation instructions',
  de: 'Einbauanleitung',
  fr: "Instructions d'installation",
};

/**
 * Restore missing install-instructions bullet in set-contents lists.
 * @param {string} html
 * @param {string} locale
 */
function repairMissingSetContentsLine(html, locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  const line = SET_INSTALL_LINE[loc];
  if (!line) return html;

  const setRe =
    /(<h2[^>]*>[^<]*(?:Contenido|Contenuto|Contents|Inhalt|Contenu|Inhoud)[^<]*<\/h2>\s*<ul>)([\s\S]*?)(<\/ul>)/i;
  const m = String(html || '').match(setRe);
  if (!m) return html;

  const inner = m[2];
  if (
    /<li[^>]*>[^<]*(?:instrucciones de instalación|istruzioni di montaggio|installation instructions|einbauanleitung|instructions d'installation|installatie-instructies)/i.test(
      inner
    )
  ) {
    return html;
  }

  return html.replace(m[0], `${m[1]}${inner}<li>${line}</li>${m[3]}`);
}

/**
 * DeepL sometimes merges the next FAQ question into the previous answer paragraph.
 * @param {string} html
 */
function repairFaqMergedQuestions(html) {
  let out = String(html || '');
  const priorStrong = [...out.matchAll(/<strong>([^<]+)<\/strong>/gi)].map((x) =>
    normalizeFaqText(x[1])
  );
  // ES: answer ends, next question starts with ¿ in same block
  out = out.replace(/([.!?])\s+(¿[^<]{12,}?\?)/g, '$1</p><h2>$2</h2><p>');
  // FR: merged questions (Comment, Pourquoi, Est-ce, Quelle, Combien)
  out = out.replace(
    /(\?)\s*(?:<\/p>\s*)?(?:<p[^>]*>)?\s*((?:Comment|Pourquoi|Est-ce|Quelle|Combien|Peut-on|Qu'est-ce|Où|Pour\s|Est-il|Quand)[^<]{8,}?\?)/gi,
    '$1</p><h2>$2</h2><p>'
  );
  // FR/ES: question starts mid-paragraph without prior ?
  out = out.replace(
    /(<\/p>)\s*(?:<p[^>]*>)?\s*((?:Comment|Pourquoi|¿)[^<]{10,}?\?)/gi,
    '$1<h2>$2</h2><p>'
  );
  // DE / EN: new question after ? without heading
  out = out.replace(
    /(\?)\s*(?:<\/p>\s*)?(?:<p[^>]*>)?\s*((?:Was|Wie|Welche|Kann|Gibt|How|What|Why|Can|Do)[^<]{8,}?\?)/gi,
    '$1</p><h2>$2</h2><p>'
  );
  // IT: Domanda successiva
  out = out.replace(
    /(\?)\s*(?:<\/p>\s*)?(?:<p[^>]*>)?\s*((?:Quanto|Come|Perché|Qual|È possibile)[^<]{8,}?\?)/gi,
    '$1</p><h2>$2</h2><p>'
  );
  // ES/FR FAQ in <strong> blocks: next question glued to previous answer
  out = out.replace(/(<\/strong><br>[^<]+)(<strong>¿)/gi, '$1<br><br>$2');
  out = out.replace(/(<\/strong><br>[^<]+)(<strong>Comment)/gi, '$1<br><br>$2');
  // EN/DE/IT: plain-text duplicate question before next <strong>
  out = out.replace(/(<br><br>)([^<]{8,}?\?)\s*(<strong>)/gi, (all, br, plainQ, strong) => {
    const norm = normalizeFaqText(plainQ);
    if (priorStrong.some((p) => p === norm || p.includes(norm) || norm.includes(p))) {
      return `${br}${strong}`;
    }
    return all;
  });
  out = out.replace(/\?\s*\./g, '?');
  return out;
}

/**
 * Fix broken list markup from translation (unclosed <li>, raw text nodes).
 * @param {string} html
 */
function repairBrokenCompatibilitySection(html) {
  let out = String(html || '');
  out = out.replace(
    /<\/p><strong>Toyota<\/strong>\s*Yaris<\/p><strong>\.\s*<h2>/gi,
    '<p><strong>Toyota</strong> Yaris</p> <h2>'
  );
  out = out.replace(/<strong>\.\s*<h2>/gi, '<h2>');
  out = out.replace(/<p>\s*<strong>\.\s*<\/strong>\s*<\/p>/gi, '');
  out = out.replace(/<p>\s*\.\s*<\/p>/gi, '');
  return out;
}

function repairBrokenListMarkup(html) {
  let out = String(html || '');
  out = out.replace(/<li>([^<]+)\.\s*\n<li>/gi, '<li>$1</li>\n<li>');
  out = out.replace(/<li>([^<]+)\.\s*(?=<li>)/gi, '<li>$1</li>');
  out = out.replace(/<li>([^<\n]+)\s*\n<li>/gi, '<li>$1</li>\n<li>');
  out = out.replace(/<li>([^<\n]+)(?=<li>)/gi, '<li>$1</li>');
  out = out.replace(/<([A-ZÁÉÍÓÚÑa-z][^>]{2,40})\s+de\s+/g, '<li>$1 de ');
  out = out.replace(/<Filtro/gi, '<li>Filtro');
  out = out.replace(/<Kit de/gi, '<li>Kit de');
  out = out.replace(/<p>([^<]*)<h2>/gi, '<p>$1</p><h2>');
  return out;
}

/**
 * Remove duplicate FAQ / feature blocks (same heading text appears twice).
 * @param {string} html
 */
function dedupeDuplicateHeadingSections(html) {
  const src = String(html || '');
  const parts = src.split(/(?=<h[23][^>]*>)/i);
  if (parts.length < 3) return src;

  /** @type {string[]} */
  const kept = [];
  /** @type {Set<string>} */
  const seenHeadings = new Set();
  /** @type {Set<string>} */
  const seenBodies = new Set();

  for (const part of parts) {
    const headingMatch = part.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    const headingNorm = headingMatch
      ? normalizeListText(headingMatch[1])
      : '';
    const bodyNorm = normalizeListText(part.replace(/<h[23][^>]*>[\s\S]*?<\/h[23]>/i, ''));

    if (headingNorm && seenHeadings.has(headingNorm)) continue;
    if (bodyNorm.length > 80 && seenBodies.has(bodyNorm)) continue;

    if (headingNorm) seenHeadings.add(headingNorm);
    if (bodyNorm.length > 80) seenBodies.add(bodyNorm);
    kept.push(part);
  }
  return kept.join('');
}

/**
 * Strip repeated trust / contact blocks accidentally duplicated in product HTML.
 * @param {string} html
 */
/**
 * Keep only the first FAQ JSON-LD block (duplicate FAQPage causes merged/duplicate FAQ).
 * @param {string} html
 */
function dedupeJsonLdFaqScripts(html) {
  let count = 0;
  return String(html || '').replace(JSONLD_SCRIPT_RE, (full) => {
    count += 1;
    if (/FAQPage/i.test(full)) {
      return count === 1 ? full : '';
    }
    return full;
  });
}

/**
 * Remove duplicate storefront/trust/shipping blocks pasted into product HTML.
 * @param {string} html
 */
function dedupeRepeatedTrustBlocks(html) {
  let out = String(html || '');
  const blockPatterns = [
    /<(p|div|li|span)[^>]*>[\s\S]*?clients?\s+satisfaits?[\s\S]*?<\/\1>/gi,
    /<(p|div|li|span)[^>]*>[\s\S]*?whatsapp[\s\S]*?<\/\1>/gi,
    /<(p|div|li|span)[^>]*>[\s\S]*?tevreden\s+klanten[\s\S]*?<\/\1>/gi,
    /<(p|div|li|span)[^>]*>[\s\S]*?satisfied\s+customers[\s\S]*?<\/\1>/gi,
    /<(p|div|li|span)[^>]*>[\s\S]*?Verwachte\s+levering[\s\S]*?<\/\1>/gi,
    /<(p|div|li|span)[^>]*>[\s\S]*?Livraison\s+gratuite[\s\S]*?<\/\1>/gi,
  ];
  for (const re of blockPatterns) {
    let n = 0;
    out = out.replace(re, (block) => {
      n += 1;
      return n === 1 ? block : '';
    });
  }
  const inlineMarkers = [
    /clients?\s+satisfaits?/gi,
    /whatsapp\s+ons/gi,
    /Whatsapp\s+ons/gi,
    /10\.?000\+\s+tevreden/gi,
  ];
  for (const re of inlineMarkers) {
    let count = 0;
    out = out.replace(re, (m) => {
      count += 1;
      return count <= 1 ? m : '';
    });
  }
  return out
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<div>\s*<\/div>/gi, '')
    .replace(/\s{2,}/g, ' ');
}

/**
 * Dedupe near-identical paragraphs outside lists.
 * @param {string} html
 */
function dedupeSimilarParagraphs(html) {
  const paras = [...String(html || '').matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)].map((m) => m[0]);
  if (paras.length < 2) return html;
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const norms = [];
  let out = String(html || '');
  for (const p of paras) {
    const norm = normalizeListText(p);
    if (norm.length < 30) continue;
    if (norms.some((prev) => listItemSimilarity(prev, norm) >= 0.72)) {
      out = out.replace(p, '');
    } else {
      norms.push(norm);
      kept.push(p);
    }
  }
  return out;
}

/**
 * @param {string} html
 */
function shouldChunkBodyHtmlByHeadings(html) {
  const h = String(html || '');
  return (
    /FAQPage/i.test(h) ||
    /veelgestelde\s+vragen|häufig\s+gestellte|preguntas\s+frecuentes|domande\s+frequenti|questions\s+fréquentes/i.test(
      h
    ) ||
    (/<h[23][^>]*>/i.test(h) && (h.match(/<h[23][^>]*>/gi) || []).length >= 2)
  );
}

/**
 * Split long FAQ / feature HTML so DeepL does not merge Q&A blocks.
 * @param {string} html
 * @returns {string[]}
 */
function splitHtmlByHeadings(html) {
  const src = String(html || '');
  if (!shouldChunkBodyHtmlByHeadings(src)) return [src];
  const segments = src.split(/(?=<h[23][^>]*>)/i).filter((s) => s.trim());
  if (segments.length <= 1) return [src];

  /** @type {string[]} */
  const chunks = [];
  let buf = segments[0];
  for (let i = 1; i < segments.length; i++) {
    if (buf.length >= 2800) {
      chunks.push(buf);
      buf = segments[i];
    } else {
      buf += segments[i];
    }
  }
  if (buf.trim()) chunks.push(buf);
  return chunks.length ? chunks : [src];
}

/**
 * @param {string} s
 */
function normalizeListText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @param {string} a
 * @param {string} b
 */
function listItemSimilarity(a, b) {
  const ta = new Set(normalizeListText(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeListText(b).split(/\s+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  return inter / Math.max(ta.size, tb.size);
}

/**
 * Remove near-duplicate bullet points (e.g. two carbon-fiber lines in ES).
 * @param {string} html
 */
/**
 * FAQ blocks sometimes get erroneous <h2>question</h2><p><br>answer — flatten to <p>Q<br>A.
 * @param {string} html
 */
function repairFaqH2ToParagraph(html) {
  let out = String(html || '');
  out = out.replace(/<h2>([^<]*\?)<\/h2>\s*<p>\s*(?:<br\s*\/?>)?\s*/gi, '<p>$1<br>');
  out = out.replace(/<p>\s*<br\s*\/?>\s*/gi, '<p>');
  return out;
}

/**
 * Remove duplicate FAQ headings (same question text twice).
 * @param {string} html
 */
function dedupeFaqHeadings(html) {
  let out = String(html || '');
  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  /** @type {Set<string>} */
  const seen = new Set();
  out = out.replace(re, (full, _lvl, inner) => {
    const norm = normalizeListText(inner);
    if (!norm || norm.length < 12) return full;
    if (!/\?$/.test(norm) && !/^(comment|pourquoi|how|what|¿)/i.test(norm)) return full;
    if (seen.has(norm)) return '';
    seen.add(norm);
    return full;
  });
  return out;
}

/**
 * Collapse duplicate list lines that differ only by trailing punctuation.
 * @param {string} html
 */
function dedupeListLinesIgnorePunctuation(html) {
  return String(html || '').replace(/<ul([^>]*)>([\s\S]*?)<\/ul>/gi, (full, attrs, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>[\s\S]*?<\/li>/gi)].map((m) => m[0]);
    if (items.length < 2) return full;
    /** @type {string[]} */
    const kept = [];
    /** @type {Set<string>} */
    const seen = new Set();
    for (const item of items) {
      const norm = normalizeListText(item).replace(/[.!?]+$/g, '');
      if (norm.length < 12) {
        kept.push(item);
        continue;
      }
      if (seen.has(norm)) continue;
      if ([...seen].some((s) => listItemSimilarity(s, norm) >= 0.82)) continue;
      seen.add(norm);
      kept.push(item);
    }
    return `<ul${attrs}>${kept.join('')}</ul>`;
  });
}

function dedupeSimilarListItems(html) {
  return String(html || '').replace(/<ul([^>]*)>([\s\S]*?)<\/ul>/gi, (full, attrs, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>[\s\S]*?<\/li>/gi)].map((m) => m[0]);
    if (items.length < 2) return full;
    /** @type {string[]} */
    const kept = [];
    /** @type {string[]} */
    const keptNorm = [];
    for (const li of items) {
      const norm = normalizeListText(li);
      const dup = keptNorm.some((prev) => listItemSimilarity(prev, norm) >= 0.55);
      if (!dup) {
        kept.push(li);
        keptNorm.push(norm);
      }
    }
    if (kept.length === items.length) return full;
    return `<ul${attrs}>${kept.join('')}</ul>`;
  });
}

const SCHEMA_TYPE_MAP = {
  frage: 'Question',
  question: 'Question',
  pregunta: 'Question',
  domanda: 'Question',
  answer: 'Answer',
  antwort: 'Answer',
  respuesta: 'Answer',
  risposta: 'Answer',
  faqpage: 'FAQPage',
};

/**
 * Normalize schema.org keys/types after MT (or when rebuilding FAQ JSON-LD).
 * @param {unknown} node
 */
function dedupeFaqMainEntity(entities) {
  if (!Array.isArray(entities)) return entities;
  /** @type {unknown[]} */
  const kept = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const ent of entities) {
    if (!ent || typeof ent !== 'object') {
      kept.push(ent);
      continue;
    }
    const name = normalizeListText(
      String(/** @type {{ name?: string }} */ (ent).name || '')
    );
    if (name && seen.has(name)) continue;
    if (name) seen.add(name);
    kept.push(ent);
  }
  return kept;
}

function normalizeSchemaNode(node) {
  if (node == null) return node;
  if (Array.isArray(node)) return node.map(normalizeSchemaNode);
  if (typeof node !== 'object') return node;

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [rawKey, val] of Object.entries(node)) {
    let key = rawKey;
    if (key === '@contesto' || key === '@contexte') key = '@context';
    if (key.toLowerCase() === '@type' && typeof val === 'string') {
      const mapped = SCHEMA_TYPE_MAP[val.toLowerCase()];
      out[key] = mapped || val;
      continue;
    }
    out[key] = normalizeSchemaNode(val);
  }
  if (out.mainEntity) {
    out.mainEntity = dedupeFaqMainEntity(
      Array.isArray(out.mainEntity) ? out.mainEntity : [out.mainEntity]
    );
  }
  if (!out['@context']) {
    out['@context'] = 'https://schema.org';
  }
  return out;
}

/**
 * Collect human-readable FAQ strings for translation.
 * @param {unknown} node
 * @param {string[]} acc
 */
function collectFaqStrings(node, acc) {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectFaqStrings(n, acc));
    return;
  }
  if (typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if ((k === 'name' || k === 'text') && typeof v === 'string' && v.trim()) {
      acc.push(v);
    } else {
      collectFaqStrings(v, acc);
    }
  }
}

/**
 * Apply translated FAQ strings back in document order.
 * @param {unknown} node
 * @param {string[]} translated
 * @param {{ i: number }} cursor
 */
function applyFaqStrings(node, translated, cursor) {
  if (node == null) return node;
  if (Array.isArray(node)) {
    return node.map((n) => applyFaqStrings(n, translated, cursor));
  }
  if (typeof node !== 'object') return node;

  const out = { ...node };
  for (const k of ['name', 'text']) {
    if (typeof out[k] === 'string' && out[k].trim()) {
      out[k] = translated[cursor.i] ?? out[k];
      cursor.i += 1;
    }
  }
  for (const [k, v] of Object.entries(out)) {
    if (k === 'name' || k === 'text') continue;
    out[k] = applyFaqStrings(v, translated, cursor);
  }
  return out;
}

/**
 * @param {string} jsonStr
 * @param {(texts: string[]) => Promise<string[]>} translateTexts
 */
async function translateJsonLdFaqBlock(jsonStr, translateTexts) {
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return jsonStr;
  }
  const strings = [];
  collectFaqStrings(parsed, strings);
  if (!strings.length) {
    return JSON.stringify(normalizeSchemaNode(parsed), null, 2);
  }
  const translated = await translateTexts(strings);
  const cursor = { i: 0 };
  const updated = applyFaqStrings(parsed, translated, cursor);
  return JSON.stringify(normalizeSchemaNode(updated), null, 2);
}

/**
 * Full post-process for translated product HTML (after glossary/QA).
 * @param {string} html
 * @param {string} targetLocale
 * @param {{ jsonLdBlocks?: string[], translateTexts?: (texts: string[]) => Promise<string[]> }} [opts]
 */
/**
 * Structural HTML repair only (no DeepL). Use to fix live translations in place.
 * @param {string} html
 * @param {string} targetLocale
 */
function applyProductBodyStructuralRepair(html, targetLocale) {
  let out = repairHtmlArtifacts(html);
  out = repairBrokenCompatibilitySection(out);
  out = repairBrokenListMarkup(out);
  out = dedupeJsonLdFaqScripts(out);
  out = rebuildFaqFromStrongTags(out);
  out = repairFaqMergedQuestions(out);
  out = repairFaqH2ToParagraph(out);
  out = dedupeFaqHeadings(out);
  out = dedupeDuplicateHeadingSections(out);
  out = dedupeRepeatedTrustBlocks(out);
  out = dedupeListLinesIgnorePunctuation(out);
  out = dedupeSimilarListItems(out);
  out = dedupeSimilarParagraphs(out);
  out = localizeDeliveryDateRanges(out, targetLocale);
  out = repairMissingSetContentsLine(out, targetLocale);
  const loc = String(targetLocale).toLowerCase().split('-')[0];
  if (loc === 'fr' || loc === 'es' || loc === 'en' || loc === 'de' || loc === 'it') {
    out = repairFaqMergedQuestions(out);
    out = dedupeFaqHeadings(out);
    out = dedupeDuplicateHeadingSections(out);
    out = dedupeRepeatedTrustBlocks(out);
    out = dedupeListLinesIgnorePunctuation(out);
    out = repairHtmlArtifacts(out);
  }
  out = applyHtmlStructureQa(out, targetLocale);
  const { applyGrammarQaPost } = require('./grammarQa');
  const { applyLocaleQaPost } = require('./glossary');
  out = applyLocaleQaPost(out, loc.toUpperCase());
  out = applyGrammarQaPost(out, loc);
  out = repairFaqH2ToParagraph(out);
  return out;
}

async function finalizeProductBodyHtml(html, targetLocale, opts = {}) {
  const { jsonLdBlocks = [], translateTexts } = opts;
  let out = applyProductBodyStructuralRepair(html, targetLocale);

  const blocks = [];
  for (let i = 0; i < jsonLdBlocks.length; i++) {
    let block = jsonLdBlocks[i];
    if (translateTexts) {
      try {
        block = await translateJsonLdFaqBlock(block, translateTexts);
      } catch {
        block = jsonLdBlocks[i];
      }
    } else {
      try {
        block = JSON.stringify(normalizeSchemaNode(JSON.parse(block)), null, 2);
      } catch {
        /* keep raw */
      }
    }
    blocks.push(block);
  }
  if (blocks.length) {
    out = injectJsonLdIntoHtml(out, blocks);
  }
  return out;
}

/**
 * Locale-specific HTML fixes (after glossary).
 * @param {string} html
 * @param {string} locale
 */
function applyHtmlStructureQa(html, locale) {
  const loc = String(locale || '').toLowerCase().split('-')[0];
  /** @type {Array<{ find: string, replace: string }>} */
  const rules = HTML_QA[loc] || [];
  let out = html;
  const sorted = [...rules].sort((a, b) => b.find.length - a.find.length);
  for (const { find, replace } of sorted) {
    out = out.split(find).join(replace);
  }
  return out;
}

/** @type {Record<string, Array<{ find: string, replace: string }>>} */
const HTML_QA = {
  fr: [
    { find: 'Gemaakt in het Verenigd Koninkrijk', replace: 'Fabriqué au Royaume-Uni' },
    { find: 'gemaakt in het Verenigd Koninkrijk', replace: 'fabriqué au Royaume-Uni' },
    { find: 'refroidisseur d\'intermédiaire', replace: 'Intercooler' },
    { find: 'refroidisseur intermédiaire', replace: 'Intercooler' },
    { find: 'kit de Intercooler', replace: 'kit Intercooler' },
    { find: 'Kit de Intercooler', replace: 'Kit Intercooler' },
    { find: 'soupape de surpression', replace: 'soupape de décharge' },
    { find: 'Soupape de surpression', replace: 'Soupape de décharge' },
    { find: 'Diamètre entrée/échappement', replace: 'Diamètre entrée/sortie' },
    { find: 'entrée/échappement', replace: 'entrée/sortie' },
    { find: "à l'admission et à la sortie", replace: "à l'entrée et à la sortie" },
    { find: "à l'admission et à l'échappement", replace: "à l'entrée et à la sortie" },
    { find: "diamètre de l'admission et de l'échappement", replace: "diamètre de l'entrée et de la sortie" },
    { find: "L'entrée et la sortie ont un diamètre de 1,5 mm", replace: "L'entrée et la sortie ont un diamètre de 60 mm" },
    { find: 'refroidisseur intermédiaire', replace: 'intercooler' },
    { find: 'refroidisseur d\'air', replace: 'intercooler' },
    { find: 'Matériel de montage', replace: 'Visserie de montage' },
    { find: 'Aluminiumfitting', replace: 'raccord aluminium' },
    { find: 'Installationsanleitung', replace: 'Notice de montage' },
  ],
  en: [
    { find: 'at the intake and exhaust', replace: 'at the inlet and outlet' },
    { find: 'intake and exhaust', replace: 'inlet and outlet' },
    { find: 'aluminium connection', replace: 'aluminium fitting' },
    { find: 'Aluminiumfitting', replace: 'aluminium fitting' },
    { find: 'Toepasbaarheid', replace: 'Applicability' },
    { find: '14 dagen eenvoudig retourneren', replace: '14-day easy returns' },
    { find: '14 Dag Eenvoudig Retourneren', replace: '14-day easy returns' },
    { find: '<strong>satisfied</strong> klanten', replace: '<strong>satisfied</strong> customers' },
    { find: '<strong>Betaal</strong> nu of later <strong>in 3 delen</strong>', replace: '<strong>Pay</strong> now or later <strong>in 3 instalments</strong>' },
    { find: 'Plus- en minpunten', replace: 'Pros and cons' },
    { find: 'Verzendtijd:', replace: 'Delivery time:' },
    { find: 'werkdag(en)', replace: 'business day(s)' },
  ],
  de: [
    { find: 'Carbon-Ansaugstutzen', replace: 'Carbon Intake' },
    { find: 'Kohlefaser-Carbon', replace: 'Kohlefaser' },
    { find: 'Kohlefaser Ansaugstutzen', replace: 'Carbon Ansaugsystem' },
    { find: 'Kohlenstofffaser-Ansaugstutzen', replace: 'Carbon Ansaugsystem' },
    { find: 'Aluminiumfitting', replace: 'Aluminiumanschluss' },
    { find: 'Installationsanleitung', replace: 'Einbauanleitung' },
  ],
  it: [
    { find: 'valvola di sfiato', replace: 'valvola di scarico' },
    { find: 'Valvola di sfiato', replace: 'Valvola di scarico' },
    { find: 'una tubo di aspirazione', replace: 'un tubo di aspirazione' },
    { find: 'Una tubo di aspirazione', replace: 'Un tubo di aspirazione' },
    { find: 'Staffa di montaggio incluso', replace: 'Ferramenta di montaggio inclusa' },
    { find: '@contesto', replace: '@context' },
    { find: '"@type": "question"', replace: '"@type": "Question"' },
    { find: '"@type": "answer"', replace: '"@type": "Answer"' },
  ],
  es: [
    { find: 'kit de Intercooler', replace: 'kit Intercooler' },
    { find: 'Kit de Intercooler', replace: 'Kit Intercooler' },
    { find: 'Válvula de soplado', replace: 'válvula de descarga' },
    { find: 'válvula de soplado', replace: 'válvula de descarga' },
    { find: 'Válvula de Purga', replace: 'válvula de descarga' },
    { find: 'válvula de purga', replace: 'válvula de descarga' },
    { find: 'una tubo de admisión', replace: 'un tubo de admisión' },
    { find: 'Una tubo de admisión', replace: 'Un tubo de admisión' },
    { find: 'una tubo', replace: 'un tubo' },
    { find: 'Consejos de afinación por expertos', replace: 'Asesoramiento de tuning por expertos' },
    { find: 'Fabricado en fibra de carbono brillante', replace: 'Acabado en fibra de carbono brillante' },
    { find: 'Hecho de fibra de carbono con acabado brillante', replace: 'Acabado en fibra de carbono brillante' },
    { find: 'en la admisión y el escape', replace: 'en la entrada y la salida' },
    { find: 'admisión y el escape', replace: 'entrada y salida' },
    { find: 'la admisión y el escape', replace: 'la entrada y la salida' },
    { find: '"@type": "Pregunta"', replace: '"@type": "Question"' },
    { find: '"@type": "respuesta"', replace: '"@type": "Answer"' },
    { find: '"@type": "question"', replace: '"@type": "Question"' },
  ],
};

function isProductBodyKey(key) {
  return String(key).toLowerCase() === 'body_html';
}

/**
 * Translate product body HTML in FAQ-sized chunks (prevents merged Q&A).
 * @param {string} text source HTML
 * @param {string} targetLocale
 * @param {string} resolvedLocale
 * @param {Record<string, Record<string, string>>} glossaryMap
 */
async function translateProductBodyHtml(text, targetLocale, resolvedLocale, glossaryMap) {
  const { translateBatch, toDeepLTarget } = require('../services/deepl.service');
  const { applyGlossaryPost } = require('./glossary');

  const { html, jsonLdBlocks } = extractJsonLdFromHtml(text);
  const chunks = splitHtmlByHeadings(html);
  const deeplTarget = toDeepLTarget(targetLocale);
  const translatedChunks = [];

  for (const piece of chunks) {
    const [t] = await translateBatch([piece], targetLocale, {
      html: true,
      sourceLocale: resolvedLocale,
    });
    translatedChunks.push(applyGlossaryPost(t ?? piece, deeplTarget, glossaryMap));
  }

  let merged = translatedChunks.join('');
  merged = await finalizeProductBodyHtml(merged, targetLocale, {
    jsonLdBlocks,
    translateTexts: (texts) =>
      translateBatch(texts, targetLocale, {
        sourceLocale: resolvedLocale,
        html: false,
      }),
  });
  return merged;
}

module.exports = {
  extractJsonLdFromHtml,
  injectJsonLdIntoHtml,
  repairHtmlArtifacts,
  repairFaqMergedQuestions,
  rebuildFaqFromStrongTags,
  repairMissingSetContentsLine,
  splitHtmlByHeadings,
  dedupeSimilarListItems,
  dedupeDuplicateHeadingSections,
  dedupeRepeatedTrustBlocks,
  localizeDeliveryDateRanges,
  applyProductBodyStructuralRepair,
  finalizeProductBodyHtml,
  translateProductBodyHtml,
  translateJsonLdFaqBlock,
  applyHtmlStructureQa,
  isProductBodyKey,
};
