# Wingsuit Performance – migración a Next.js en Vercel

Plataforma de puntaje FAI de Wingsuit Performance (tiempo, distancia, velocidad) para Argentina, DZ AVA (Alvear, Rosario, elevación 26 m). Hoy funciona como una página HTML única publicada en claude.ai (`legacy/plataforma-actual.html`). Este repo es la mudanza a una app propia.

Idioma de la interfaz: español rioplatense, coma decimal, unidades m o ft configurables por jornada.

## Regla de oro
No inventar reglas. Todo lo que puntúa sale del reglamento **FAI ISC Competition Rules Wingsuit Flying 2026** (https://www.dfv.aero/downloads/2026_ISC_CR_WS.pdf). Cada regla en el código lleva el número de artículo en un comentario (`// 5.10.6`). Resumen en español con los artículos: `docs/reglamento-fai-2026-resumen.md`. Validación hecha: `docs/validacion-copa-del-mundo-2025.md`. Donde el reglamento no define algo, la decisión está listada en `docs/decisiones.md` y se muestra en la página "Cómo se puntúa".

## Qué hay en `legacy/src`
- `engine.js` (UMD, sin dependencias, ~540 líneas): **el corazón; se migra tal cual a TypeScript sin cambiar resultados.**
  - `parseTrack(text, name)`: FlySight 1, FlySight 2, Deep and Steep (CSV con headAcc, 4 Hz), GPX, KML, CSV genérico.
  - `scoreJump(pts, cfg, ref)`: ventana 2500→1500 m AGL (primer cruce, interpolado), Vincenty, validación (9 s después de 10 m/s hasta 20 m bajo la ventana), carril de 600 m con penalidades 10/20/50 %, avisos de Hz, SEP, huecos y altura de salida.
  - `standings(jumps, pilotIds, { tiebreak })`: % del mejor de la ronda, promedio por tarea, suma, redondeo de medios hacia arriba, desempate (ronda 0), puestos compartidos.
  - `effectivePenalties`: combina decisiones del juez (carril, separación, salida, manual, anulado).
  - `packTrack/unpackTrack/trimTrack`: track compacto para guardar.
- `app.js` (~1240 líneas, JS sin framework que arma HTML como texto): pantallas, carga, revisión del juez, perfiles de juzgamiento, validación de tareas, historial, huella SHA-256 y original, acta, CSV, copia JSON, clasificaciones (general, por tarea, femenina, equipos), desempate y orden de salida.
- `review.js` (canvas: mapa del carril y gráficos de velocidad vertical y SEP), `replay.js` (replay 2D), `replay3d.js` (three.js r128): independientes del framework, se pueden montar en un componente React con un `ref` al contenedor.
- `styles.css`, `index.template.html` (incluye el texto de "Cómo se puntúa"), `build.js` (arma el HTML único), `test.js`.
- Único acoplamiento con claude.ai: el objeto `Store` de `app.js` (`window.claude.use('db')`, colecciones tipo Firestore) y `window.claude.use('downloads')`. Todo lo demás es portable.

## Modelo de datos actual (rutas de documentos)
- `pilots/{id}`: name, suit, gender ('F' o ''), team.
- `events/{id}`: name, date, dz, mode ('libre'|'comp'), rounds, units, elev, top, bottom, exitMin, exitMax, lane, laneWidth, sepCheck, refs[{name,lat,lon}], judging{profile, reviews, door, gpsRule, exitRule}, validated{'task|round':{by,at}}, tiebreak{task,at,by,pilots}, taskOrder, order{round:{ids,how,at,by}}, passSize, roster, teamSize, teamPick.
- `events/{id}/jumps/{pilotId-task-round}`: resultados, flags, carril, separación, decisiones (laneDecision, laneShift, sepApply, exitPen, flagDecision, void, penManual, notes), reviews[{name,uid,at}], fileName, fileHash, fileSize, uploadedBy, originalSaved.
- `events/{id}/tracks/{jid}`: track compacto. `events/{id}/originals/{jid}`: archivo original en gzip base64.
- `events/{id}/archive/{jid-ts}`: saltos reemplazados o borrados. `events/{id}/log/{ts}`: historial.
- La "copia completa" que exporta cada jornada (JSON, `format: wingsuit-performance-backup`) trae todo eso y sirve para importar.

## Arquitectura propuesta
- Next.js (App Router, TypeScript) en Vercel.
- Supabase: Auth (mail mágico), Postgres con RLS, Storage para los archivos originales (no base64 en la base).
- Roles: `admin` (organizador), `juez`, `piloto`, público (solo lectura de jornadas publicadas).
- El motor corre igual en cliente (vista previa al cargar) y en servidor (puntaje oficial al guardar). El servidor recalcula y no confía en lo que manda el navegador.
- Tablas: pilots, profiles (usuario ↔ rol ↔ piloto), events, jumps, tracks (jsonb), files (ruta en Storage + sha256), reviews, decisions o columnas en jumps, audit_log, archive.

## Plan por etapas (cada etapa termina con tests verdes y deploy)
1. **Motor en TypeScript** (`lib/engine`) con Vitest. Tests:
   - los tracks de prueba de Skyderby (repo github.com/skyderby/skyderby, `test/fixtures/files/tracks`; no copiar los archivos al repo si la licencia no lo permite, descargarlos en el test);
   - la validación contra la Copa del Mundo FAI 2025 (competencia 619 de Skyderby: `GET https://skyderby.ru/api/v1/performance_competitions/619/results` y `/api/v1/tracks/{trackId}/points?freq_1_hz=false&trimmed[seconds_before_start]=40`). Resultado esperado: 333 de 333 saltos idénticos; penalidad de carril igual en 17 de 18. Guardar los datos descargados en un caché local ignorado por git.
   - **Hecho (nov 2026).** Motor en `lib/engine` (TypeScript estricto), tests en `tests/` con Vitest (`npm test`; `npm run test:rapido` saltea la Copa). La ruta `/619/results` ya no existe: los IDs salen de `/619/scoreboard` y cada salto de `/619/results/{id}` (resultado sin redondear, punto de referencia, penalidad). Los fixtures están en la rama `main`. Todo se baja a `.cache/` la primera vez (~60 MB). `tests/paridad-legacy.test.ts` compara el motor nuevo con `legacy/src/engine.js` salida por salida: cualquier cambio en el motor que cambie un resultado tiene que aparecer ahí y en `docs/decisiones.md`.
2. **Base y autenticación**: esquema en Supabase, RLS por rol, carga de pilotos y jornadas, importador de la "copia completa" JSON.
3. **Carga de saltos**: subida del original a Storage, SHA-256 en servidor, puntaje en servidor, archivo de reemplazos, historial.
4. **Pantallas** en React, en este orden: clasificación (con vistas), detalle del salto y revisión del juez (montar `review.js`), replay (montar `replay.js` y `replay3d.js`), acta, exportaciones, orden de salida, ranking histórico, pilotos, "Cómo se puntúa".
5. **Firmas con identidad real**: la firma de revisión usa el usuario logueado con rol juez, no un nombre escrito. Dos firmas = dos usuarios distintos.
6. **Pilotos**: cada piloto sube sus propios saltos y ve su historial; los jueces revisan.
7. **Página pública** de resultados por jornada.

## Criterios de aceptación de la mudanza
- Mismos números que la versión vieja para la jornada de ejemplo y para las 333 de la Copa del Mundo.
- Una jornada exportada de la versión vieja se importa y da la misma clasificación.
- Nada se borra sin archivar y todo cambio queda en el historial.
