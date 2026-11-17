// Downloads with a local cache (.cache/, git-ignored). Skyderby data is not copied into the repo:
// its license (O'Saasy) is not a standard open license, so it is downloaded when the tests run.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE_DIR = join(ROOT, '.cache');

const USER_AGENT = 'wingsuit-performance-tests';

async function fetchWithRetry(url: string, tries = 4): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*' } });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status} at ${url}`);
      if (res.status === 404) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error(
    `Could not download ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}. ` +
      'A connection is needed the first time; after that the copy in .cache/ is used.',
  );
}

/** Returns the content of `url`, stored at `.cache/<rel>`. Downloads only on a cache miss. */
export async function cachedText(rel: string, url: string): Promise<string> {
  const file = join(CACHE_DIR, rel);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const text = await fetchWithRetry(url);
  mkdirSync(dirname(file), { recursive: true });
  // Unique temp name: several test files may download the same thing at once.
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  return text;
}

export async function cachedJson<T>(rel: string, url: string): Promise<T> {
  return JSON.parse(await cachedText(rel, url)) as T;
}

/** Runs `fn` over `items` with at most `limit` tasks in parallel (to avoid hammering the API). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
