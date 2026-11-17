/*
 * Wingsuit Performance scoring engine (FAI ISC Competition Rules Wingsuit Flying 2026).
 * TypeScript port of legacy/src/engine.js with identical results: the parity tests
 * (tests/legacy-parity.test.ts) compare both engines output by output.
 * No dependencies: runs the same in the browser (preview) and on the server (official score).
 * User-facing strings (flags, penalty reasons) are in Spanish, as in the previous platform.
 */
export * from './types';
export { TASKS, DEFAULT_CFG, roundHalfUp, vincenty, projector, es } from './util';
export { parseTrack, parseTime } from './parse';
export { findExit, pointAtTime, groundSpeeds, idxAtTime, crossDown, findDeploy } from './geometry';
export { scoreJump, minSeparation } from './score';
export { trimTrack, packTrack, unpackTrack } from './track';
export { standings, finalResult, effectivePenalties } from './standings';
