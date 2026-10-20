// Inicializa extensiones/funciones de la BD operativa del CRM (idempotente).
//
// Sustituye al bind mount de `db/init-operational.sql` en el compose, que no es
// portable cuando el motor Docker corre en Linux y el proyecto vive en Windows
// (la ruta `C:\...` se interpreta mal como especificación de volumen).
//
// Uso: DATABASE_URL=... node scripts/init-db.js
const fs = require('fs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const FILE = process.env.INIT_SQL_FILE || '/app/db/init-operational.sql';

if (!DATABASE_URL) {
  console.error('❌ [init-db] DATABASE_URL no está definida');
  process.exit(1);
}
if (!fs.existsSync(FILE)) {
  console.warn(`⚠️  [init-db] no existe ${FILE}; se omite`);
  process.exit(0);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 1,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool
  .query(fs.readFileSync(FILE, 'utf8'))
  .then(() => {
    console.log('✅ [init-db] extensiones de la BD operativa listas');
    return pool.end();
  })
  .catch((e) => {
    console.error('❌ [init-db]', e.message);
    pool.end().finally(() => process.exit(1));
  });
