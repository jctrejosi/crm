// Sync de esquema idempotente para producción.
//
// Corregir deriva de esquema cuando la BD ya tiene datos: drizzle-kit push se
// usa en local/CI, pero en Render no se ejecuta al arrancar, y migrate.js omite
// la migración si la BD ya está poblada. Este script agrega únicamente las
// columnas que faltan (ALTER ... IF NOT EXISTS) y es seguro ejecutarlo en cada
// arranque del contenedor.
//
// Uso:
//   DATABASE_URL=... DB_SSL=true node scripts/sync-schema.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ [sync-schema] DATABASE_URL no está definida');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 2,
  // Proveedores gestionados (Supabase/Neon/Render) exigen SSL.
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Columnas que deben existir según drizzle/schema.ts. Cada entrada es
// idempotente: no falla ni altera datos si la columna ya existe.
const COLUMNS = [
  // picking: unidades alistadas por item (backend/src/modules/picking/*)
  `ALTER TABLE order_items
     ADD COLUMN IF NOT EXISTS picked_qty integer NOT NULL DEFAULT 0`,
  // sucursales: visibilidad en la landing (independiente de is_active)
  `ALTER TABLE branches
     ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true`,
  // picking: revisión de pedidos en la cola (complementa a picked_qty)
  `ALTER TABLE orders
     ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`,
  // campañas: origen del público objetivo ('auto' | 'manual' | 'mixed')
  `ALTER TABLE campaigns
     ADD COLUMN IF NOT EXISTS audience_mode varchar(10) NOT NULL DEFAULT 'auto'`,
  // campañas: canal prioritario de envío (whatsapp | email | sms)
  `ALTER TABLE campaigns
     ADD COLUMN IF NOT EXISTS priority_channel campaign_channel_enum`,
  // campañas: snapshot RFM del destinatario (público con tabla completa)
  `ALTER TABLE campaign_recipients
     ADD COLUMN IF NOT EXISTS cedula varchar(50)`,
  `ALTER TABLE campaign_recipients
     ADD COLUMN IF NOT EXISTS segmento integer`,
  `ALTER TABLE campaign_recipients
     ADD COLUMN IF NOT EXISTS frecuencia double precision`,
  `ALTER TABLE campaign_recipients
     ADD COLUMN IF NOT EXISTS monetario double precision`,
  `ALTER TABLE campaign_recipients
     ADD COLUMN IF NOT EXISTS ticket_promedio double precision`,
  `ALTER TABLE campaign_recipients
     ADD COLUMN IF NOT EXISTS categorias_distintas double precision`,
  `ALTER TABLE campaign_recipients
     ADD COLUMN IF NOT EXISTS propensity double precision`,
];

function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inDollar = false;
  let dollarTag = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (inDollar) {
      current += ch;
      // Buscar el cierre del tag (p. ej. '$$' o '$tag$')
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag.slice(1);
        i += dollarTag.length;
        inDollar = false;
        continue;
      }
      i++;
    } else if (inString) {
      current += ch;
      if (ch === stringChar && sql[i - 1] !== '\\') inString = false;
      i++;
    } else if (ch === "'" || ch === '"') {
      current += ch;
      inString = true;
      stringChar = ch;
      i++;
    } else if (ch === '$') {
      // Detectar tag dollar-quoted: $$ o $nombre$
      const m = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        dollarTag = m[0];
        inDollar = true;
        current += m[0];
        i += m[0].length;
      } else {
        current += ch;
        i++;
      }
    } else if (ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      i++;
    } else {
      current += ch;
      i++;
    }
  }
  const last = current.trim();
  if (last) statements.push(last);
  return statements;
}

async function sync() {
  let client;
  try {
    client = await pool.connect();
    for (const stmt of COLUMNS) {
      try {
        await client.query(stmt);
        console.log(`✅ [sync-schema] ${stmt.split('\n')[0].trim()}...`);
      } catch (err) {
        if (err.code === '42P07') {
          // ya existe la columna
          console.log(`⏭️ [sync-schema] ya aplicado: ${stmt.split('\n')[0].trim()}`);
          continue;
        }
        throw err;
      }
    }

    // Tablas del admin de picking (estanterías por sucursal). El archivo es
    // idempotente (IF NOT EXISTS) — se corre en cada arranque.
    const sqlPath = path.join(__dirname, 'picking-shelves.sql');
    if (fs.existsSync(sqlPath)) {
      const sqlText = fs.readFileSync(sqlPath, 'utf8');
      for (const stmt of splitSQL(sqlText)) {
        try {
          await client.query(stmt);
        } catch (err) {
          if (['42P07', '42P16', '42710', '42P17'].includes(err.code)) {
            console.log(`⏭️ [sync-schema] ya existe: ${stmt.substring(0, 60)}...`);
            continue;
          }
          throw err;
        }
      }
      console.log('✅ [sync-schema] tablas de estanterías listas');
    }

    console.log('✅ [sync-schema] esquema al día');
  } catch (error) {
    // No fatal: si la BD está caída el backend reintenta al arrancar y el
    // health check lo reporta. Pero avisamos alto y claro.
    console.error('⚠️ [sync-schema] error (el backend seguirá arrancando):', error.message);
  } finally {
    try {
      if (client) client.release();
    } catch {}
    await pool.end();
  }
}

sync();
