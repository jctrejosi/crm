-- ======================================================
-- CRM — EXTENSIONES NECESARIAS (BD operativa `crm`)
-- ======================================================
-- Mismo set que la BD del ecommerce: PostGIS (geografía), citext (emails
-- case-insensitive), uuid-ossp, unaccent + pg_trgm (buscador del catálogo) y
-- el wrapper IMMUTABLE para poder indexar búsquedas sin tildes.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() es STABLE y PostgreSQL no permite STABLE en índices: wrapper IMMUTABLE.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT public.unaccent($1) $$;
