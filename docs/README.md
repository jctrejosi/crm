# Documentación del CRM

Índice de la documentación del proyecto CRM (analytics + campañas) de Mercaldas.

| Documento | Qué cubre |
|---|---|
| [Estado actual](./estado-actual.md) | Fotografía del proyecto: arquitectura, servicios, puertos, componentes, configuración y deuda técnica. **Empieza por aquí.** |
| [Bases de datos](./bases-de-datos.md) | Las dos bases Postgres del CRM (`crm` :5437 y `analytics` :5436), su contenido, backup y restauración. |
| [Migración de analytics](./migracion-analytics.md) | Origen del legado Advantage (ADS), cómo se pobló la réplica y plan para reconstruirla. |
| [Backups de analytics](./backups-analytics.md) | Inventario de los dumps troceados, reensamblado, verificación y generación de backups. |
| [Runbook de exposición](./RUNBOOK-EXPOSICION.md) | Despliegue en el VPS (Windows Server): DNS en GoDaddy, firewall, `prod.js`, verificación y edge compartido con el ecommerce. |
| [Seguridad](./SECURITY.md) | Modelo de seguridad del contenedor: superficie expuesta, TLS, CSP, rate limit, secretos, riesgos residuales y checklist. |

Documentación local a cada componente:

- `backend/README.md` — *(pendiente: hoy es el boilerplate de NestJS)*.
- `ia-service/README.md` — servicio de IA (FastAPI + DeepSeek).
- `ml/README.md` — servicios de modelos (clustering, xgboost, uplift) y cómo los
  usa el backend.
- `AGENTS.md` — guía para agentes (reglas de contexto del repo).
- `README.md` (raíz) — entrada rápida del repo.

## Convenciones

- Esta carpeta (`docs/`) es la **fuente canónica** de la documentación de
  proyecto. Los `.md` que describen el repositorio como conjunto viven aquí.
- Los archivos **funcionales** se quedan junto a su código (p. ej. el
  `docker-compose.yml`, los `.sql` y los scripts en `db/`).
- Al mover o renombrar un documento, actualiza los enlaces: revisa
  `README.md`, `AGENTS.md` y `dev.js` (mensajes de consola que citan rutas).
