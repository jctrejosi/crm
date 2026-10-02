import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './drizzle/schema.ts',
  out: './drizzle/migrate',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    // Proveedores gestionados (Supabase, Neon, Render) exigen SSL.
    // DB_SSL=true activa TLS sin verificación de cadena (certificados propios).
    ...(process.env.DB_SSL === 'true'
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  },
  tablesFilter: ['!spatial_ref_sys', '!geography_columns', '!geometry_columns'],
  verbose: true,
  strict: true,
});
