# Respaldos de la base operativa (solo datos)

`node dev.js --backup-db` deja aquí un volcado `pg_dump -Fc` de la base
operativa `crm` (campañas, catálogo, pedidos, clientes, usuarios), **sin** la
réplica `analytics` (:5436, que tiene sus propios respaldos en `db/backups/`) ni
imágenes.

- `crm_<AAAA-MM-DD_HHmm>.dump` — volcado binario
- `crm_<AAAA-MM-DD_HHmm>.dump.sha256` — suma para verificar integridad

También se admite un respaldo **troceado** (para versionarlo en git, igual que
el ecommerce):

- `crm_<fecha>.dump.part-000`, `.part-001`, … — volcado partido en trozos de 2 MiB
- `crm_<fecha>.dump.sha256` — hash del volcado **completo** (no de cada parte)

`-RestoreDb` / `--restore-db` reensambla las partes y valida el `sha256` de forma
transparente; no hay que unirlas a mano.

## Restaurar

```powershell
node dev.js --restore-db                    # el respaldo más reciente de backups/
node dev.js --restore-db=backups\xxx.dump   # un respaldo concreto
```

O desde el lanzador:

```powershell
.\Activar-Desarrollo.bat -RestoreDb   # restaura y arranca los servicios
.\Activar-Desarrollo.bat -BackupDb    # crea un respaldo y sale
```

`--restore-db` aplica el volcado con `pg_restore --clean --if-exists` sobre la
base `crm` existente (no la borra ni la recrea): la deja **exactamente** como el
respaldo, sin tablas o columnas posteriores. El paso de `drop + create` se quitó
porque en Windows el contenedor podía morir en medio (código 137) y dejar el CRM
sin base; ahora se espera a `pg_isready`, se crea la base solo si falta y se
reintenta si el proceso se interrumpe.

## Notas

- La réplica `analytics` (:5436) **no** se respalda aquí: se restaura con
  `node dev.js --restore` desde `db/backups/`.
- Los `.dump` son binarios grandes. Si no quieres que viajen por git, agrega
  `*.dump` al `.gitignore` de esta carpeta y copia el archivo por otra vía; si sí
  quieres que lleguen con un `git pull`, commitea solo el que vayas a distribuir
  y borra los anteriores para no inflar el historial.
