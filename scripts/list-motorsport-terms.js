require('dotenv').config();
const { loadGlossary, loadLocaleQaReplacements, MOTORSPORT_PATH } = require('../src/utils/glossary');
const { config } = require('../src/config');

const map = loadGlossary(config.paths.glossary);
console.log('Motorsport glossary file:', MOTORSPORT_PATH);
console.log('Total glossary entries:', Object.keys(map).length);
console.log('\nSample terms:', Object.keys(map).slice(0, 12).join(', '));

for (const loc of ['de', 'fr', 'en', 'it', 'es', 'pl']) {
  const qa = loadLocaleQaReplacements(loc);
  console.log(`QA fixes [${loc}]:`, qa.length);
}
