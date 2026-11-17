// Tracks de prueba del repositorio de Skyderby (github.com/skyderby/skyderby, test/fixtures/files/tracks).
import { cachedText } from './cache';

const BASE = 'https://raw.githubusercontent.com/skyderby/skyderby/main/test/fixtures/files/tracks/';

export const FIXTURES = [
  '13-31-51_Ravenna.CSV',
  '2014-Csaba-Round-1.CSV',
  'cyber_eye.csv',
  'distance_2454.csv',
  'distance_2645.csv',
  'distance_3107.csv',
  'flysight.csv',
  'flysight2_2762_noisy_climb.csv',
  'flysight_warmup.csv',
  'fs2-track.csv',
  'one_track.gpx',
] as const;

export type FixtureName = typeof FIXTURES[number];

export function loadFixture(name: FixtureName): Promise<string> {
  return cachedText('skyderby-fixtures/' + name, BASE + name);
}

export async function loadAllFixtures(): Promise<Record<FixtureName, string>> {
  const out = {} as Record<FixtureName, string>;
  for (const f of FIXTURES) out[f] = await loadFixture(f);
  return out;
}
