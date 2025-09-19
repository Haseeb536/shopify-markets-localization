/**
 * Run async work over items with a fixed concurrency limit (worker pool).
 * @template T,R
 * @param {number} concurrency
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapPool(concurrency, items, fn) {
  if (!items.length) return [];
  const n = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

module.exports = { mapPool };
