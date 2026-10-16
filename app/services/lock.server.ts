/**
 * In-process lock: work under the same key runs one at a time, in arrival order.
 * Pickday runs as a single web service, so this is enough to stop two webhooks for
 * the same store from racing each other (duplicate creates, recounts overwriting each other).
 */
const tails = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
