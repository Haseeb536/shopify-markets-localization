/**
 * When enabled, block theme Liquid file edits. Translations API + locale JSON are still allowed
 * via syncThemeTextWithoutLiquid / translate:theme-text-only.
 */
function isTextOnlyMode() {
  const v = process.env.LOCALIZATION_TEXT_ONLY;
  return v === '1' || String(v).toLowerCase() === 'true';
}

/**
 * @param {string} operation
 * @returns {{ skipped: true, reason: string, operation: string } | null}
 */
function skipIfTextOnly(operation) {
  if (!isTextOnlyMode()) return null;
  return { skipped: true, reason: 'text_only_mode', operation };
}

function assertNotTextOnly(operation) {
  const blocked = skipIfTextOnly(operation);
  if (blocked) {
    const err = new Error(`Blocked in text-only mode (Liquid): ${operation}`);
    err.code = 'TEXT_ONLY_BLOCKED';
    err.detail = blocked;
    throw err;
  }
}

module.exports = { isTextOnlyMode, skipIfTextOnly, assertNotTextOnly };
