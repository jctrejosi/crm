# Guía para agentes — Mercaldas ecommerce

Monorepo con varias interfaces, un backend NestJS, un bot de compras y un
servicio de IA. Esta guía existe, sobre todo, para **evitar que el agente
queme su ventana de contexto** en tareas sobre grandes volúmenes de datos.

## Estructura (para no explorar a ciegas)

- `backend/` — NestJS + Drizzle. Esquema en `backend/drizzle/schema.ts`.
- `Interface web client/` — tienda (React + Vite).
- `Interface web admin/` — panel admin (React + Vite).
- `bot/` — chatbot de compras (FastAPI + DeepSeek function calling).
- `bot/` — chatbot de compras (FastAPI + DeepSeek function calling).
- **CRM (Analytics + Campañas)** — ya **no vive en este repo**: es un proyecto
  hermano e independiente en `/home/jk/Proyectos/dsi/crm` (web :8444, backend
  NestJS :3100, ia-service :8002, BDs propias: `crm` operativa :5437 y
  `analytics` réplica de ML :5436; lanzador `node dev.js`). Para trabajar en él,
  abre ese proyecto por separado. OJO: allí
  `interface web/src/views/Campaigns.tsx` ronda las 5,6k líneas (misma regla de
  no leerlo completo).
- `db/` — scripts de datos y migraciones (`.mjs`).
- Otras interfaces: `delivery`, `picking`, etc.

## Reglas de contexto (obligatorias)

1. **Nunca leer completos los archivos gigantes/autogenerados ni los backups.**
   Regla práctica: si un archivo supera **~100 KB o ~1.500 líneas**, NO lo leas
   entero: localiza con `grep` y usa `read_file` con `start_line`/`end_line`.
   En especial, **prohibido** volcarlos al contexto:
   - `backend/drizzle/schema.ts` (~4,2k líneas, 148 KB)
   - `Interface web admin/src/imports/example.tsx` (~3,2k líneas, 161 KB)

   - `Interface web client/src/app/Views/AccountView/index.tsx` (~4,5k líneas, 162 KB)
   - `Interface web admin/src/views/Banners.tsx` (~4,2k líneas, 193 KB)
   - `db/backups/**` (volcados de BD; hay JSON de **2,4 MB en una sola línea**)
   - `**/package-lock.json` (~14k líneas)
   Los backups y los `package-lock.json` están ya en `file_scan_exclusions` de Zed.
2. **Nunca traer lotes grandes de filas al chat** (productos, clientes, pedidos,
   inventario). Si necesitas operar sobre muchas filas, **escribe un script** en
   `/scripts-agent/*.ts` y ejecútalo con `terminal`. Del
   script solo debe volver un resumen (conteos, muestra corta, errores).
3. **Acota la salida de comandos** con `head_lines`/`tail_lines`. No vuelques
   listados enteros.
4. **`grep` SIEMPRE acotado. Nunca patrones globales.** Todo `grep` debe llevar
   `include_pattern` (ruta/carpeta concreta) y, si puede haber muchas
   coincidencias, paginar con `offset`. Un solo `grep` sin acotar (p. ej.
   `general_logo|generalLogo` recorriendo todo el monorepo) puede devolver varios
   MB y **romper la ventana de contexto de forma irrecuperable**: la compactación
   tampoco funciona, porque reenvía el hilo entero y vuelve a pasarse del límite.
   Si necesitas un recuento o barrido global, hazlo con un **script**, no con
   `grep`. Cuidado: **pocas coincidencias pueden devolver MB** si caen dentro de
   archivos grandes (pasó con 14 coincidencias → 5,3 MB). Ante la duda, pagina con
   `offset` o cuenta con un script.
5. **Una tarea por sesión.** Si la conversación ya es muy larga, propón empezar
   una nueva sesión enfocada en el siguiente subproblema.
6. **Delega la exploración pesada en subagentes.** Su contexto queda aislado y
   solo te devuelven el resumen que pides.
7. Antes de una operación masiva, **confirma la regla de mapeo** (qué producto va
   a qué cosa) para codificarla en SQL/script, en lugar de decidir fila por fila.

## Asociaciones de catálogo (operación típica)

- Producto → **Tipo de Producto**: tabla `product_type_assignments`
  (`product_id`, `product_type_id`, PK compuesta). Reemplaza asignaciones previas
  del producto (`assignProductType` en `backend/scripts/import-products-from-json.ts`).
  API admin: `POST /admin/catalog/product-types/:id/products`.
- Producto → **Categoría**: tabla `product_categories`
  (`assignProductCategory` en el mismo script). API:
  `POST /admin/catalog/categories/:id/products`.

Estas operaciones se hacen **por script/SQL**, nunca pasando el catálogo por el chat.
