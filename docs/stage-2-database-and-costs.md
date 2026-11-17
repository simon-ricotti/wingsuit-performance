# Etapa 2: base de datos, permisos y costos

Nov 16, 2026

## Qué hay

- **Esquema** (`supabase/schemas/`, declarativo: describe cómo es la base, no pasos de migración): `pilots`, `profiles` (usuario ↔ rol ↔ piloto), `events`, `jumps`, `tracks`, `files`, `reviews`, `archive`, `audit_log`, y los buckets privados `originals` e `imports` en Storage.
- **Roles**: `admin` (organizador), `judge` (juez), `pilot` (piloto) y el público sin login.
- **Login con mail mágico** (`/login`), panel (`/admin`) con **jornadas** (`/admin/events`: crear, editar ajustes y juzgamiento, borrar si no tiene saltos), **pilotos** (`/admin/pilots`), **usuarios y roles** (`/admin/users`) e **importador de la copia completa** (`/admin/import`). Cada cambio se guarda junto con su entrada en el historial, en la misma llamada a la base (`supabase/schemas/03_admin.sql`).
- **Pruebas** (`tests/database.test.ts`): cargan el esquema real en un Postgres local (PGlite) y verifican permisos, archivo e importación. La jornada importada da **la misma clasificación** que la versión vieja (criterio de aceptación de CLAUDE.md).

## Cómo quedan los permisos

| Quién | Lee | Escribe |
| --- | --- | --- |
| Público (sin login) | Nada por la API. Las páginas `/results` (servidor) muestran jornadas publicadas, solo con las columnas de resultados | Nada |
| Piloto | Su ficha y su perfil por la API; `/account` (servidor) le muestra sus saltos | A través del servidor: sus propios saltos, en jornadas abiertas a pilotos, sin reemplazar uno ya cargado |
| Juez | Todo, incluidos historial y archivo | A través del servidor: pilotos y carga de saltos |
| Admin | Todo, incluidos los perfiles de todos | A través del servidor: jornadas, pilotos, saltos, recálculo, roles e importación |

Nadie escribe desde el navegador, ni siquiera un admin: RLS no tiene políticas de escritura. Todas las escrituras las hace el servidor con la clave secreta, después de controlar el rol y recalcular el puntaje. Así un usuario con sesión no puede mandar un resultado inventado llamando directo a la API de Supabase.

**Nada se borra sin archivar:** al borrar un salto, un piloto o una jornada, un trigger copia la fila a `archive` (para un salto, también su track, su archivo y sus firmas). `archive` y `audit_log` no se pueden modificar ni borrar, ni siquiera con la clave secreta. El archivo de un salto **reemplazado** (subir otro archivo encima) se resuelve en la etapa 3 junto con la carga.

## Decisiones de diseño para gastar poco

1. **Páginas públicas estáticas.** La portada y las páginas públicas se sirven desde el CDN de Vercel sin ejecutar funciones ni consultar la base. `proxy.ts` (la renovación de sesión) corre solo en `/admin` y `/account`. Cuando lleguen las páginas de resultados (etapa 7) se regeneran solo cuando cambia un salto (revalidación por etiqueta), no en cada visita.
2. **Sin Realtime.** La versión vieja escuchaba cambios en vivo; acá las pantallas se actualizan al revalidar. Realtime está apagado.
3. **Tracks aparte.** La clasificación se arma con la tabla `jumps` (unos 2 KB por salto). Los tracks (16–35 KB cada uno, Postgres los comprime) solo se leen para el replay o para recalcular.
4. **Originales en Storage, comprimidos**, no en la base (la versión vieja los guardaba en base64 dentro del documento: un tercio más grande). La ruta lleva la huella SHA-256, así que subir dos veces el mismo archivo no ocupa el doble.
5. **Todo o nada al importar:** una sola llamada a la base (`import_backup`) en una transacción.
6. **Verificación de sesión local** (`getClaims`): con las claves de firma asimétricas de Supabase no hace falta consultar al servidor de Auth en cada página.
7. **Consultas con RLS baratas:** las funciones de rol se evalúan una vez por consulta, no por fila.

**Ajustes de puntaje con saltos cargados:** si cambian la elevación, la ventana, la salida, el carril, la separación o los puntos de referencia de una jornada con saltos, el servidor recalcula todos los saltos desde sus tracks y la base guarda ajustes y resultados juntos (si no, rechaza el cambio). Así los resultados guardados siempre corresponden a los ajustes.

## Cuánto ocupa

Medido con los tracks de prueba (FlySight 1 y 2, 5 a 10 Hz):

| Por salto | Tamaño |
| --- | --- |
| Fila en `jumps` | ~2 KB |
| Track compacto (base) | 16–35 KB |
| Archivo original comprimido (Storage) | 85–460 KB, típico ~200 KB |

Ejemplo: una temporada de 20 jornadas de 30 saltos son 600 saltos: unos **25 MB de base** y **120 MB de Storage**. La copia completa que se sube para importar queda guardada en `imports` como respaldo (unos MB por jornada, se importa una sola vez).

## Planes y costos (estimación: confirmar precios vigentes antes de decidir)

Según lo que conozco de los planes (pueden haber cambiado):

| Servicio | Plan gratuito | Límite que importa acá |
| --- | --- | --- |
| Supabase Free | 0 USD | 500 MB de base, 1 GB de Storage, 5 GB de transferencia por mes. **El proyecto se pausa tras 7 días sin actividad** y hay que reactivarlo a mano. |
| Supabase Pro | ~25 USD/mes | Sin pausa, 8 GB de base, 100 GB de Storage, copias de seguridad diarias. |
| Vercel Hobby | 0 USD | Uso personal **no comercial**. Si la plataforma cobra inscripciones o es de una empresa, corresponde Vercel Pro (~20 USD/mes por persona). |
| Mail (SMTP propio, p. ej. Resend) | 0 USD hasta ~3000 mails/mes | El SMTP que trae Supabase solo sirve para pruebas: manda pocos mails por hora y solo a los miembros del proyecto. **Para que entren jueces y pilotos hace falta un SMTP propio.** |

Con el volumen de arriba, **todo entra en los planes gratuitos durante varios años**. El riesgo real del plan gratuito es la **pausa por inactividad**: entre jornadas puede pasar más de una semana sin uso. Opciones:

- **A. Gratis y reactivar a mano** el proyecto antes de cada jornada (se hace desde el panel de Supabase, tarda unos minutos).
- **B. Supabase Pro solo en temporada**: se pasa a Pro el mes de competencias y se vuelve a Free después (los datos quedan).
- **C. Supabase Pro todo el año**: ~300 USD/año, sin preocuparse, con copias de seguridad diarias.

Recomendación para empezar: **A** mientras se prueba la plataforma; **B** cuando haya jornadas oficiales.

## Puesta en marcha (cuando se decida crear el proyecto)

1. Crear el proyecto en Supabase en la región **São Paulo** (`sa-east-1`, la más cercana a Rosario).
2. Crear las tablas: en Supabase → SQL Editor, pegar y ejecutar `supabase/schemas/01_core.sql` y después `supabase/schemas/02_storage_and_import.sql` (base vacía, sistema desde cero). Cuando más adelante haya que cambiar una base que ya tiene datos, se edita el esquema y `npx supabase db schema declarative sync` genera el cambio.
3. En Supabase → Authentication → URL Configuration: *Site URL* = la URL de Vercel; agregar `https://<dominio>/auth/callback` (y `http://localhost:3000/auth/callback` para desarrollo) a las *Redirect URLs*.
4. Configurar el SMTP propio (Authentication → Emails → SMTP).
5. Variables de entorno (ver `.env.example`) en `.env.local` para desarrollo y en Vercel → Settings → Environment Variables. **La clave secreta nunca con prefijo `NEXT_PUBLIC_`.**
6. Entrar una vez por `/login` con el mail del organizador y darle el rol de admin desde el editor SQL de Supabase:
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'organizador@ejemplo.com');
   ```
7. En Vercel, elegir la región de funciones **São Paulo (`gru1`)** para que el servidor quede al lado de la base.

## Diferencias con lo que decía CLAUDE.md

- La configuración de puntaje de una jornada (elevación, ventana, salida) está en `events.cfg`, como la guarda la versión vieja (`ev.cfg`), no en columnas sueltas.
- `order` de la versión vieja se llama `exit_order` (es palabra reservada en SQL), y `mode` guarda `free`/`competition` en vez de `libre`/`comp` (el importador los convierte).
- Lo que la versión vieja guarda y la nueva no tiene como columna queda en `extra` (jsonb): importar y volver a exportar no pierde nada.
- La versión vieja exportaba la copia completa pero no tenía importador: este es nuevo.
