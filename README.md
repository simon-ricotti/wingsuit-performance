# Wingsuit Performance

Puntaje FAI 2026 de Wingsuit Performance, revisión de jueces y replay.

- `legacy/plataforma-actual.html`: la versión que funciona hoy; se abre en cualquier navegador (sin base compartida, no guarda).
- `legacy/charla/index.html`: la charla del entrenamiento con el planificador de pasadas.
- `lib/engine`: el motor de puntaje en TypeScript (etapa 1). `npm install && npm test` corre los tests, incluida la validación contra la Copa del Mundo FAI 2025; la primera vez baja los datos de Skyderby a `.cache/` (hace falta conexión).
- `legacy/src`: el código fuente. `node build.js <carpeta-de-tracks>` arma el HTML; `node test.js <carpeta-de-tracks>` prueba el motor.
- `CLAUDE.md`: el plan de mudanza a Next.js en Vercel (lo lee Claude Code).
- `docs/decisions.md`: lo que el reglamento no define y cómo se resolvió.
- `docs/fai-2026-rules-summary.md` y `docs/world-cup-2025-validation.md`: copias en texto de los documentos de claude.ai (los originales siguen allá).
