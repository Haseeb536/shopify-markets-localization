/**
 * Simple token-bucket style rate limiter for async operations.
 */
class RateLimiter {
  /**
   * @param {number} maxPerSecond
   */
  constructor(maxPerSecond) {
    this.intervalMs = maxPerSecond > 0 ? 1000 / maxPerSecond : 0;
    this._chain = Promise.resolve();
  }

  async schedule(fn) {
    if (this.intervalMs <= 0) {
      return fn();
    }
    const run = this._chain.then(async () => {
      const start = Date.now();
      try {
        return await fn();
      } finally {
        const elapsed = Date.now() - start;
        const wait = Math.max(0, this.intervalMs - elapsed);
        if (wait > 0) {
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    });
    this._chain = run.catch(() => {});
    return run;
  }
}

module.exports = { RateLimiter };
