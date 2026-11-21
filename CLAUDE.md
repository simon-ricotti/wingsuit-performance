# Wingsuit Performance – migración a Next.js en Vercel

Plataforma de puntaje FAI de Wingsuit Performance (tiempo, distancia, velocidad) para Argentina, DZ AVA (Alvear, Rosario, elevación 26 m). Hoy funciona como una página HTML única publicada en claude.ai (`legacy/plataforma-actual.html`). Este repo es la mudanza a una app propia.

Idioma de la interfaz: español rioplatense, coma decimal, unidades m o ft configurables por jornada.

Idioma del código: **inglés** (identificadores, comentarios, nombres de archivo, rutas/URLs, tablas, roles, buckets, tests). En castellano solo los textos que ve el usuario. `legacy/` queda como está (es la referencia). Los documentos de `docs/` están escritos en castellano, con nombres de archivo en inglés.

## Estado actual y cómo seguir (actualizado: 21 nov 2026)
- **Las 7 etapas están hechas** y en `main`, publicadas en Vercel (la URL de producción está en el proyecto de Vercel). Lo que sigue es la **prueba general** del organizador con jueces y pilotos reales, y corregir lo que aparezca.
- **Hecho el 18 nov 2026 (después de las etapas):**
  - Cara nueva: paleta bordó de Saltá en Rosario (`--brand`; el naranja `--accent` queda solo para datos: ventana en los gráficos y mejor de la ronda), barra superior fija, botones, menús en tarjetas, League Spartan + Lato con `next/font`. Ícono provisorio (silueta de wingsuit); **el nombre de la app sigue sin definir** (propuestas: Carril, Planeo, Ventana, Pampa/Paraná Performance).
  - Mapa satelital (`app/ui/sat-map.tsx`, Leaflet 1.9.4 + Esri World Imagery): puntos de referencia y pasada en los ajustes de la jornada, track con carril y franjas en el detalle del salto y en el replay.
  - `/tracks`: saltos sueltos sin jornada, todo en el navegador (mapa, métricas, replay); no guarda.
  - `/ranking`: público, récords y mejor marca por tarea de las jornadas publicadas (componente compartido con `/admin/ranking`).
  - **21 nov 2026:** inicio con la última competencia y los récords; menú Reglamento con pestañas (Cómo se puntúa / Para jueces); `/jump-run` ("Calcular la pasada"): pasada perpendicular al viento con pronóstico de Open-Meteo, segundos entre salidas y aterrizaje sobre el satélite, todo en el navegador; los ajustes de la jornada la traen con «Usar la pasada del planificador» (vía `localStorage`). Reloj de puerta offline en `public/door/` (HTML suelto con service worker propio, alcance `/door/`; no usa el bundle de Next).
  - `update-jump-run.sql` (columna `events.jump_run`) aplicado el 19 nov 2026.
  - **Datos de demo cargados y publicados (19 nov 2026):** "Demo: Copa AVA 2026, fecha 1" (`edemoava2026`, 2 rondas, 36 saltos) y "Demo: entrenamiento AVA" (`edemoentreno`, 6 saltos), con los pilotos `pdemo01` a `pdemo06`. Son tracks sintéticos sobre AVA, puntuados con el motor. Están en `.demo/` (excluido de git): las copias para `/admin/import`, el generador (`npx tsx .demo/generate.mts .demo`, se corre desde la raíz) y `delete-demo.sql`, que los borra sin dejar rastro (también del archivo y del historial). Ese script se probó con PGlite. Desde la app no se puede borrar una jornada con saltos.
  - Pendiente de probar con datos reales: el carril sobre el satélite con tracks de AVA y puntos cargados (con los fixtures de Skyderby solo se probó en `/tracks`), y la barra en el ancho del celular.
- **Antes de una competencia oficial:**
  - reactivar el proyecto de Supabase (el plan gratis lo pausa tras 7 días sin uso);
  - descargar la copia completa de cada jornada al terminar (el plan gratis no tiene copias de seguridad diarias);
  - si se cobra inscripción, pasar a Vercel Pro.
- **Infraestructura** (la crea y la administra el usuario; nunca pedirle claves ni pegarlas en el chat):
  - **Supabase:** proyecto en São Paulo, creado desde la integración de Vercel. Las claves están en `.env.local` (no se sube) y en Vercel. El código usa `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`.
  - **Mails de login:** SMTP de Gmail con contraseña de aplicación, y plantillas Magic Link y Confirm signup en castellano. Ya anda.
  - **El organizador** es el usuario con rol `admin`. Los demás entran como `pilot`, y el organizador les cambia el rol o los vincula a su ficha en `/admin/users`.
  - **Datos de prueba:** la jornada "Entrenamiento AVA (prueba de importador)", importada de la versión vieja y sin publicar.
- **Cambios en una base que ya existe:**
  - el esquema declarativo de `supabase/schemas/` es la fuente de verdad: se edita ahí;
  - se arma un script SQL de un solo uso con `create or replace`, `alter` o `drop policy` y se verifica con PGlite que el esquema anterior más el script dé el esquema nuevo;
  - se le pasa al usuario: queda en la raíz del proyecto y en el portapapeles (`pbcopy`), y lo aplica él en el SQL Editor de Supabase. Claude no tiene permiso para escribir en la base;
  - después se borra el script. Nunca se sube.
- **Probar en el navegador:** con Claude in Chrome. La extensión tiene que estar con la misma cuenta de claude.ai que Claude Code, y el usuario ya tiene que estar logueado en la app.
  - Para enviar formularios, usar clics por coordenadas o `form.requestSubmit()`: los clics por referencia de la extensión a veces no los envían.
  - Hacer las pruebas que escriben en jornadas creadas para eso y borrarlas al final. La jornada importada no se toca.
  - Si `npm run dev` queda con la caché rota (por un `next build` en paralelo), probar con `next build && next start -p 3001`; la sesión sirve igual porque la cookie es de `localhost`.
- **Commits:** el usuario autorizó commit y push a `main` sin pedir confirmación en cada paso. Confirmar igual antes de escribir datos reales en Supabase o borrar algo que no sea de prueba.
- **Mapa rápido del código:**
  - `lib/engine`: el motor, validado; no se toca sin las pruebas de paridad.
  - `lib/jumps`: carga y recálculo.
  - `lib/standings`: vistas de la clasificación, orden de salida y carga de resultados.
  - `lib/events/settings.ts`: ajustes de la jornada.
  - `lib/import/backup.ts`: importar y exportar la copia completa.
  - `lib/results/public.ts`: datos de las páginas públicas.
  - `app/admin/...`: pantallas de jueces y organizador.
  - `app/account`: el piloto.
  - `app/results`: el público.
  - `app/ranking`: ranking público (tablas compartidas con `/admin/ranking`); `app/tracks`: saltos sueltos en el navegador; `app/ui/sat-map.tsx`: mapa satelital; `app/jump-run`: calcular la pasada.
  - `app/scoring`: "Cómo se puntúa".
  - `app/help`: ayuda por rol para jueces, organizadores y pilotos. Actualizarla cuando cambie un flujo o el texto de un botón.
  - `app/judging`: reglamento FAI para jueces (fuente: `docs/fai-2026-rules-summary.md`), con recuadros “En el sistema”. Actualizarla si cambia el reglamento o cómo lo aplica el sistema.
  - `supabase/schemas/01..06`: la base.
- **Pendientes conocidos, no urgentes:**
  - la tabla de clasificación está repetida en tres pantallas (admin, acta y pública);
  - limpiar los archivos que quedan en `originals/incoming/` si una subida no se completa;
  - el ranking histórico lee todos los saltos en cada visita (pasar a una tabla resumen si crece mucho);
  - el reproductor 3D carga three.js r128 desde cdnjs.

## Cómo se trabaja
- **Siempre simple (ponytail, nivel full):** seguir `.claude/skills/ponytail/SKILL.md` en todo el desarrollo. Es el cambio más chico que resuelve todo, sin abstracciones, opciones ni dependencias que nadie pidió. Nunca se recorta la validación en el servidor, el manejo de errores que evita perder datos, la seguridad ni la accesibilidad.
- **Pantallas:**
  - Diseño: `.claude/skills/frontend-design`. Es una herramienta de jueces en la DZ: lo primero es que se lea bien en el celular y al sol, con una sola decisión visual fuerte y nada de decoración.
  - Código React/Next: `.claude/skills/vercel-react-best-practices`.
  - Al terminar cada pantalla, revisarla con `.claude/skills/web-design-guidelines`.
- Los skills se copiaron de sus repos (ponytail MIT, frontend-design de anthropics/skills, los de Vercel de vercel-labs/agent-skills). Del plugin de ponytail se tomó solo la regla, sin los hooks.

## Regla de oro
No inventar reglas. Todo lo que puntúa sale del reglamento **FAI ISC Competition Rules Wingsuit Flying 2026** (https://www.dfv.aero/downloads/2026_ISC_CR_WS.pdf). Cada regla en el código lleva el número de artículo en un comentario (`// 5.10.6`). Resumen en español con los artículos: `docs/fai-2026-rules-summary.md`. Validación hecha: `docs/world-cup-2025-validation.md`. Donde el reglamento no define algo, la decisión está listada en `docs/decisions.md` y se muestra en la página "Cómo se puntúa".

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
- Roles: `admin` (organizador), `judge` (juez), `pilot` (piloto), público (solo lectura de jornadas publicadas).
- El motor corre igual en cliente (vista previa al cargar) y en servidor (puntaje oficial al guardar). El servidor recalcula y no confía en lo que manda el navegador.
- Tablas: pilots, profiles (usuario ↔ rol ↔ piloto), events, jumps, tracks (jsonb), files (ruta en Storage + sha256), reviews, decisions o columnas en jumps, audit_log, archive.

## Plan por etapas (cada etapa termina con tests verdes y deploy)
1. **Motor en TypeScript** (`lib/engine`) con Vitest. Tests:
   - los tracks de prueba de Skyderby (repo github.com/skyderby/skyderby, `test/fixtures/files/tracks`; no copiar los archivos al repo si la licencia no lo permite, descargarlos en el test);
   - la validación contra la Copa del Mundo FAI 2025 (competencia 619 de Skyderby: `GET https://skyderby.ru/api/v1/performance_competitions/619/results` y `/api/v1/tracks/{trackId}/points?freq_1_hz=false&trimmed[seconds_before_start]=40`). Resultado esperado: 333 de 333 saltos idénticos; penalidad de carril igual en 17 de 18. Guardar los datos descargados en un caché local ignorado por git.
   - **Hecho (nov 2026).** Motor en `lib/engine` (TypeScript estricto), tests en `tests/` con Vitest (`npm test`; `npm run test:quick` saltea la Copa). La ruta `/619/results` ya no existe: los IDs salen de `/619/scoreboard` y cada salto de `/619/results/{id}` (resultado sin redondear, punto de referencia, penalidad). Los fixtures están en la rama `main`. Todo se baja a `.cache/` la primera vez (~60 MB). `tests/legacy-parity.test.ts` compara el motor nuevo con `legacy/src/engine.js` salida por salida: cualquier cambio en el motor que cambie un resultado tiene que aparecer ahí y en `docs/decisions.md`.
2. **Base y autenticación**: esquema en Supabase, RLS por rol, carga de pilotos y jornadas, importador de la "copia completa" JSON.
   - **Hecho (nov 2026), con el proyecto de Supabase creado.** Diseño, permisos, costos y puesta en marcha: `docs/stage-2-database-and-costs.md`. Esquema declarativo en `supabase/schemas/` (es la fuente de verdad, sistema desde cero; las migraciones las genera la CLI recién cuando haya que cambiar una base en producción); conversión versión vieja ↔ filas en `lib/data/rows.ts`; importador en `lib/import/backup.ts` y `/admin/import`. Reglas: el navegador solo lee (RLS sin políticas de escritura), toda escritura pasa por el servidor con la clave secreta después de `assertRole`; páginas públicas estáticas (sin Realtime, `proxy.ts` solo en `/admin` y `/account`). Pruebas con PGlite en `tests/database.test.ts`. Pantallas de jornadas, pilotos y usuarios/roles en `/admin` (escrituras en `03_admin.sql`: cada cambio y su historial en la misma transacción).
   - Tests: correrlos solo cuando se modifica el motor o la base, no en cada cambio.
3. **Carga de saltos**: subida del original a Storage, SHA-256 en servidor, puntaje en servidor, archivo de reemplazos, historial.
   - **Hecho en código (nov 2026).** `/admin/events/[id]/upload`: vista previa en el navegador con el mismo motor; el navegador comprime el archivo y lo sube a Storage (`originals/incoming/`) con URL firmada; el servidor lo baja, calcula SHA-256, puntúa (oficial), mueve el original a `originals/<evento>/<salto>/<sha256>.gz` y llama a `save_jump` (reemplazo con archivo del anterior, separación 5.6.3, reapertura de tarea validada e historial en una transacción). Recalcular (`apply_scores`) y cambiar ajustes de puntaje con saltos cargados recalcula todo en la misma transacción. Lógica en `lib/jumps/` (port de jumpDoc, checkSeparation y recalcEvent); paridad con la versión vieja en `tests/jumps.test.ts`.
4. **Pantallas** en React, en este orden: clasificación (con vistas), detalle del salto y revisión del juez (montar `review.js`), replay (montar `replay.js` y `replay3d.js`), acta, exportaciones, orden de salida, ranking histórico, pilotos, "Cómo se puntúa".
   - **Hecho (nov 2026):** clasificación (`/admin/events/[id]`, vistas general, femenina, equipos y por tarea, con la vista en la URL; validación de tareas) y detalle del salto con revisión del juez (`/admin/events/[id]/jumps/[pilot-task-round]`: `review.js` montado tal cual con el motor en `window.WSP`, decisiones, corrección del inicio del carril, firmas, descarga y verificación del original, borrado). Escrituras en `supabase/schemas/05_review.sql`. Lógica de vistas y estado del juzgamiento en `lib/standings/views.ts`.
   - Las firmas ya usan el usuario logueado (adelanta la etapa 5): una por juez, y el nombre sale del perfil.
   - **Acta y exportaciones hechas (nov 2026):** `/admin/events/[id]/report` (imprimible), `export/csv` (planilla como la vieja) y `export/backup` (copia completa en el formato de la versión vieja: se arma en el servidor, se guarda en Storage `imports/exports/` y se baja con URL firmada porque Vercel corta respuestas de más de 4,5 MB). `buildBackup` en `lib/import/backup.ts`; la ida y vuelta importar → exportar está probada en `tests/database.test.ts`.
   - **Replay hecho (nov 2026):** `/admin/events/[id]/replay?slot=task|round`, `replay.js` y `replay3d.js` montados tal cual (datos en `window.WSApp`, three.js r128 de cdnjs como en la versión vieja). Probado en Chrome.
   - **Hecho también (nov 2026):** desempate (sorteo de la tarea en el servidor) y nominación de equipos en la clasificación; orden de salida (`/admin/events/[id]/order`: participantes, sorteo del orden de tareas, orden por ronda inverso o sorteado, rotación de pasadas) con escrituras en `06_event_state.sql`; ranking histórico (`/admin/ranking`); saltos en la ficha del piloto; "Cómo se puntúa" público y estático en `/scoring`. Lógica en `lib/standings/order.ts` y `lib/standings/load.ts`.
5. **Firmas con identidad real**: la firma de revisión usa el usuario logueado con rol juez, no un nombre escrito. Dos firmas = dos usuarios distintos.
6. **Pilotos**: cada piloto sube sus propios saltos y ve su historial; los jueces revisan.
   - **Hecho en código (nov 2026):** opción por jornada `pilot_uploads` (ajustes); `/account` del piloto (sus saltos con puntos y estado, jornadas abiertas) y `/account/events/[id]/upload` (mismo formulario y acción que los jueces, con el piloto fijo; el servidor solo deja cargar saltos propios en jornadas abiertas). El piloto se vincula a su ficha en Usuarios y roles.
7. **Página pública** de resultados por jornada.
   - **Hecho en código (nov 2026):** botón Publicar en los ajustes (`set_event_state`); `/results` y `/results/[id]` estáticas desde el CDN, regeneradas como mucho cada 60 s, leídas en el servidor solo para jornadas publicadas y con las columnas de resultados (`lib/results/public.ts`). La API no muestra jornadas ni saltos a nadie que no sea juez u organizador: notas, quién cargó, firmas y rutas de Storage nunca son públicas.

## Criterios de aceptación de la mudanza
- Mismos números que la versión vieja para la jornada de ejemplo y para las 333 de la Copa del Mundo.
- Una jornada exportada de la versión vieja se importa y da la misma clasificación.
- Nada se borra sin archivar y todo cambio queda en el historial.
