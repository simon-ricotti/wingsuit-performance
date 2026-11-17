// The previous engine (legacy/src/engine.js, UMD) as is, to compare output by output.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './cache';

const require = createRequire(import.meta.url);

// Untyped on purpose: it is the reference, not production code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const legacy: any = require(join(ROOT, 'legacy/src/engine.js'));
