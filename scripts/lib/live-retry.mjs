// live-retry.mjs — bounded retries with backoff for the checks that read the live site.
//
// Right after a Pages deploy the edge can answer 404 or a stale copy for a few
// seconds, so a single failed request is not yet a broken deploy. The same two
// variables as check-sitemap-live.mjs drive the loop:
//   FLLM_LIVE_ATTEMPTS     total attempts, default 1 (no retry), capped at 10
//   FLLM_LIVE_RETRY_DELAY  seconds before the first retry, default 10; it doubles
//                          on every further retry, up to 60 s per wait
// Pure apart from the injected check and sleep, so the loop is tested without a network.

export const MAX_ATTEMPTS = 10;
export const MAX_DELAY_MS = 60_000;

/** Attempts and the first delay from the environment; invalid values fall back to the defaults. */
export function retryConfig(env = {}) {
  const rawAttempts = parseInt(env.FLLM_LIVE_ATTEMPTS ?? '1', 10);
  const attempts = Number.isFinite(rawAttempts) && rawAttempts >= 1 ? Math.min(rawAttempts, MAX_ATTEMPTS) : 1;
  const rawDelay = parseInt(env.FLLM_LIVE_RETRY_DELAY ?? '10', 10);
  const baseDelayMs = (Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 10) * 1000;
  return { attempts, baseDelayMs };
}

/** The wait before retry n (1-based): base, 2×base, 4×base… never above MAX_DELAY_MS. */
export function backoffDelay(retry, baseDelayMs) {
  return Math.min(baseDelayMs * 2 ** (retry - 1), MAX_DELAY_MS);
}

/**
 * Calls `checkAll(items)` (it resolves to one result per item, in order, each with
 * a boolean `ok`), then calls it again with only the items that failed, until all
 * pass or the attempts are spent. Returns the last result of every item, in the
 * original order.
 */
export async function retryFailing(items, checkAll, { attempts = 1, baseDelayMs = 0, sleep, log = () => {} } = {}) {
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const last = new Array(items.length);
  let pending = items.map((_, i) => i);
  for (let attempt = 1; attempt <= attempts && pending.length; attempt++) {
    if (attempt > 1) {
      const ms = backoffDelay(attempt - 1, baseDelayMs);
      log(`  attempt ${attempt - 1}/${attempts}: ${pending.length} failing — retrying in ${ms / 1000}s`);
      await wait(ms);
    }
    const round = await checkAll(pending.map((i) => items[i]));
    pending.forEach((index, j) => { last[index] = round[j]; });
    pending = pending.filter((index) => !last[index]?.ok);
  }
  return last;
}
