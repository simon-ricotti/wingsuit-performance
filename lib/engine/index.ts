/*
 * Motor de puntaje Wingsuit Performance (FAI ISC Competition Rules Wingsuit Flying 2026).
 * Migración a TypeScript de legacy/src/engine.js sin cambios de resultados: los tests de
 * paridad (tests/paridad-legacy.test.ts) comparan ambos motores salida por salida.
 * Sin dependencias: corre igual en el navegador (vista previa) y en el servidor (puntaje oficial).
 */
export * from './types';
export { TASKS, DEFAULT_CFG, roundHalfUp, vincenty, projector, es } from './util';
export { parseTrack, parseTime } from './parse';
export { findExit, pointAtTime, groundSpeeds, idxAtTime, crossDown, findDeploy } from './geometry';
export { scoreJump, minSeparation } from './score';
export { trimTrack, packTrack, unpackTrack } from './track';
export { standings, finalResult, effectivePenalties } from './standings';
