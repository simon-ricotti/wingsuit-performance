// El motor viejo (legacy/src/engine.js, UMD) tal cual, para comparar salida por salida.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './cache';

const require = createRequire(import.meta.url);

// Sin tipos a propósito: es la referencia, no código de producción.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const legacy: any = require(join(ROOT, 'legacy/src/engine.js'));
