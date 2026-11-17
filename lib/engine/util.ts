import type { ScoreConfig, Task } from './types';

export const TASKS: readonly Task[] = ['time', 'distance', 'speed'];

export const DEFAULT_CFG: Readonly<ScoreConfig> = {
  elev: 0, //          DZ elevation, m MSL
  top: 2500, //        window top, m AGL (2.2)
  bottom: 1500, //     window bottom, m AGL (2.2)
  exitMin: 3200, //    5.4.6
  exitMax: 3353, //    5.4.5
  laneWidth: 600, //   2.2 Designated Lane
  valDelay: 9, //      s after reaching valVs (2.2 Validation Window)
  valVs: 10, //        m/s (2.2)
  valBelow: 20, //     validation ends 20 m below the window (2.2)
  sepLimit: 10, //     SEP < 10 m (3.1.1 / 5.7.4)
  minHz: 5, //         3.1.1
  separation: 150, //  5.6.3
};

/** Number with decimal comma (es-AR). */
export function es(n: number | string | null | undefined): string {
  return String(n).replace('.', ',');
}

/** Round half up (5.10.1, 5.10.4). */
export function roundHalfUp(x: number, d?: number): number {
  const m = Math.pow(10, d || 0);
  return Math.floor(x * m + 0.5 + 1e-9) / m;
}

export const RAD = Math.PI / 180;

/** WGS84 geodesic distance (inverse Vincenty), in metres (2.2 Distance). */
export function vincenty(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = 6378137, b = 6356752.314245, f = 1 / 298.257223563;
  const L = (lon2 - lon1) * RAD;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * RAD));
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * RAD));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, lamP: number, it = 100;
  let sS: number, cS: number, sig: number, sA: number, c2A: number, c2SM: number, C: number;
  do {
    const sL = Math.sin(lam), cL = Math.cos(lam);
    sS = Math.sqrt((cU2 * sL) * (cU2 * sL) + (cU1 * sU2 - sU1 * cU2 * cL) * (cU1 * sU2 - sU1 * cU2 * cL));
    if (sS === 0) return 0;
    cS = sU1 * sU2 + cU1 * cU2 * cL;
    sig = Math.atan2(sS, cS);
    sA = cU1 * cU2 * sL / sS;
    c2A = 1 - sA * sA;
    c2SM = c2A ? cS - 2 * sU1 * sU2 / c2A : 0;
    C = f / 16 * c2A * (4 + f * (4 - 3 * c2A));
    lamP = lam;
    lam = L + (1 - C) * f * sA * (sig + C * sS * (c2SM + C * cS * (-1 + 2 * c2SM * c2SM)));
  } while (Math.abs(lam - lamP) > 1e-12 && --it > 0);
  const u2 = c2A * (a * a - b * b) / (b * b);
  const A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sS * (c2SM + B / 4 * (cS * (-1 + 2 * c2SM * c2SM) -
    B / 6 * c2SM * (-3 + 4 * sS * sS) * (-3 + 4 * c2SM * c2SM)));
  return b * A * (sig - dS);
}

export type Projector = (lat: number, lon: number) => [number, number];

/** Local projection (east, north) in metres around an origin. */
export function projector(lat0: number, lon0: number): Projector {
  const a = 6378137, e2 = 0.00669437999014;
  const s = Math.sin(lat0 * RAD), w = 1 - e2 * s * s;
  const N = a / Math.sqrt(w), M = a * (1 - e2) / (w * Math.sqrt(w));
  const kx = N * Math.cos(lat0 * RAD) * RAD, ky = M * RAD;
  return (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
}
