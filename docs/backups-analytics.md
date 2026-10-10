# Backups de la réplica de analytics

Dumps `pg_dump -Fc` de la BD **`analytics`** (contenedor `analytics_postgres`,
puerto 5436). Como el volcado pesa **~346 MB**, va **troceado** en partes de
45 MB para poder subirlo a GitHub (que bloquea archivos >100 MB y avisa >50 MB).

- **Se versionan**: las **partes** (`*.backup.part-NNN`) y el **sha256** del
  volcado completo (`*.backup.sha256`).
- **No se versionan**: el volcado completo (`*.backup`, ver `.gitignore`).

## Inventario — `analytics_2026-10-02`

| Archivo | Tamaño |
|---|---|
| `analytics_2026-10-02.backup.sha256` | 94 B (hash del volcado completo) |
| `analytics_2026-10-02.backup.part-000` … `-006` | 47.185.920 B c/u (45 MB) |
| `analytics_2026-10-02.backup.part-007` | 32.497.176 B |
| `analytics_2026-10-02.backup` *(local, no versionado)* | 362.798.616 B (~346 MB) |

- **sha256 del volcado completo**: `27e984c997c1328edcb1faf3dcd75a3044ff245926d6c95eba08580c4bfad194`
- **8 partes**; `split -b 45M`.
- Verificado el 2026-10-02 reensamblando las partes y restaurando en una base
  temporal (`analytics_verify`): `pg_restore` exit=0 y conteos idénticos al original.

> La carpeta puede conservar el backup anterior `analytics_2026-09-29.*`
> (mismos datos). Al reensamblar se elige el conjunto de partes más reciente.

Conteos tras restaurar (deben coincidir con el original):

| Tabla / vista | Filas |
|---|---|
| `pos.venta_lineas` (todas las particiones) | 9.998.703 |
| `pos.clientes` | 184.660 |
| `analytics.vw_rfm_clientes` | 81.997 |
| `analytics.cliente_segmento` | 81.955 |

## Reensamblar las partes

```sh
cd db/backups
cat analytics_2026-10-02.backup.part-* > /tmp/analytics.backup

# comprobar integridad (debe imprimir el mismo hash de arriba)
sha256sum /tmp/analytics.backup
```

> `restore.sh` hace esto solo: si no encuentra el `.backup` completo, reensambla
> las partes, valida el sha256 y restaura.

## Restaurar

```sh
# desde el repo (reensambla si solo hay partes):
bash db/restore.sh

# o con el volcado explícito:
bash db/restore.sh backups/analytics_2026-10-02.backup
```

## Generar un backup nuevo

```sh
cd db/backups
F=analytics_FECHA.backup   # p. ej. analytics_2026-10-02.backup

# 1. Volcado completo (formato custom, portable entre versiones)
docker exec analytics_postgres pg_dump -U postgres -d analytics -Fc -Z9 \
  --no-owner --no-privileges > "$F"

# 2. Hash del volcado COMPLETO (para verificar tras reensamblar)
sha256sum "$F" > "$F.sha256"

# 3. Trocear (≈45 MB por parte); el .backup completo queda ignorado por git
split -b 45M -d --numeric-suffixes=0 -a 3 "$F" "$F.part-"
```

> Verificar un backup sin tocar la BD real: restaurarlo en una base temporal
> (`createdb analytics_verify` → `pg_restore` → comparar conteos → `dropdb`).

> ⚠ Esta es la **única** copia de la réplica si el volumen Docker se pierde
> (`docker compose down -v`, `docker volume prune`, PC nuevo). Copia `backups/`
> **fuera de la máquina** y programa `pg_dump` periódico.
