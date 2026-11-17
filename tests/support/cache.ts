// Descargas con caché local (.cache/, ignorado por git). Los datos de Skyderby no se copian al repo:
// su licencia (O'Saasy) no es una licencia abierta estándar, así que se bajan al correr los tests.
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
      lastErr = new Error(`HTTP ${res.status} en ${url}`);
      if (res.status === 404) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error(
    `No pude descargar ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}. ` +
      'Hace falta conexión la primera vez; después se usa la copia en .cache/.',
  );
}

/** Devuelve el contenido de `url`, guardado en `.cache/<rel>`. Solo descarga si no está en caché. */
export async function cachedText(rel: string, url: string): Promise<string> {
  const file = join(CACHE_DIR, rel);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const text = await fetchWithRetry(url);
  mkdirSync(dirname(file), { recursive: true });
  // Nombre temporal único: varios archivos de test pueden bajar lo mismo a la vez.
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  return text;
}

export async function cachedJson<T>(rel: string, url: string): Promise<T> {
  return JSON.parse(await cachedText(rel, url)) as T;
}

/** Corre `fn` sobre `items` con a lo sumo `limit` tareas en paralelo (para no saturar la API). */
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
