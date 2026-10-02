--
-- PostgreSQL database dump
--

\restrict dxKgb6X7g9FROHH7UIvHYGav0OkQ7Mbbqpoy6QsvkKSWgs5xcqfDL5GWNCY4g4V

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: analytics; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA analytics;


--
-- Name: pos; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pos;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cliente_segmento; Type: TABLE; Schema: analytics; Owner: -
--

CREATE TABLE analytics.cliente_segmento (
    cliente_cod character varying(13) NOT NULL,
    segmento integer,
    distancia_centroide double precision,
    creado_en timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
)
PARTITION BY RANGE (fecha);


--
-- Name: vw_rfm_clientes; Type: VIEW; Schema: analytics; Owner: -
--

CREATE VIEW analytics.vw_rfm_clientes AS
 WITH base AS (
         SELECT venta_lineas.cliente_cod,
            max(venta_lineas.fecha) AS ultima_compra,
            min(venta_lineas.fecha) AS primera_compra,
            count(DISTINCT venta_lineas.factura_num) AS frecuencia,
            sum(venta_lineas.vlr_neto) AS monetario,
            (sum(venta_lineas.vlr_neto) / (NULLIF(count(DISTINCT venta_lineas.factura_num), 0))::double precision) AS ticket_promedio,
            count(DISTINCT venta_lineas.tipo_producto) AS categorias_distintas
           FROM pos.venta_lineas
          WHERE ((venta_lineas.fecha IS NOT NULL) AND (venta_lineas.fecha <> '2026-05-14'::date))
          GROUP BY venta_lineas.cliente_cod
        )
 SELECT cliente_cod,
    ('2026-05-31'::date - ultima_compra) AS recencia_dias,
    frecuencia,
    monetario,
    ticket_promedio,
    categorias_distintas,
    (ultima_compra - primera_compra) AS antiguedad_dias
   FROM base;


--
-- Name: bodegas; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.bodegas (
    codigo character varying(3) NOT NULL,
    nombre character varying(20),
    carpeta character varying(50),
    estado boolean,
    bodega_asoc character varying(2),
    saldos double precision,
    costos double precision,
    ventas double precision,
    promedio double precision,
    centro_costo character varying(7),
    tipo_doc character varying(2),
    rotacion double precision,
    dias_inventario double precision,
    inv_maximo double precision,
    stock_seguridad double precision,
    punto_reorden double precision,
    pct_iva double precision,
    precio_lista double precision,
    inactivo_cod character varying(1),
    abc character varying(1),
    vta_mes jsonb,
    ent_mes jsonb,
    sal_mes jsonb,
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: clientes; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.clientes (
    codcli character varying(13) NOT NULL,
    nombre character varying(40),
    nombre1 character varying(50),
    nombre2 character varying(50),
    apellido1 character varying(50),
    apellido2 character varying(50),
    cedula character varying(10),
    tipo_documento character varying(2),
    nit_empresa character varying(12),
    profesion character varying(30),
    empresa character varying(30),
    direccion character varying(60),
    barrio character varying(30),
    ciudad character varying(20),
    ciudad_cod character varying(5),
    telefono character varying(10),
    celular character varying(12),
    email text,
    fecha_nacimiento date,
    estado_civil character varying(20),
    hijos smallint,
    conyuge character varying(40),
    sexo character varying(1),
    sucursal character varying(3),
    zona character varying(2),
    clase character varying(1),
    tipo character varying(15),
    activo_cod character varying(1),
    bloqueado boolean,
    puntos double precision,
    cupo double precision,
    consumo double precision,
    valor_total double precision,
    es_empleado boolean,
    tiene_mascota boolean,
    mascota_tipo character varying(20),
    tiene_carro boolean,
    carro_tipo character varying(10),
    consentimiento_datos boolean,
    consentimiento_sms boolean,
    consentimiento_email boolean,
    consentimiento_whatsapp boolean,
    club_vino boolean,
    club_parrilla boolean,
    club_salud boolean,
    club_mascotas boolean,
    club_amas_de_casa boolean,
    descuento_cumple double precision,
    observaciones text,
    fecha_ingreso date,
    fecha_baja date,
    origen_web character varying(1),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: facturas; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.facturas (
    facia character varying(4),
    placa character varying(6),
    cliente_cod character varying(13),
    cliente_nombre character varying(45),
    cliente_direc character varying(60),
    cliente_ciudad character varying(12),
    cliente_tel character varying(15),
    nit character varying(15),
    tipo_persona character varying(1),
    numero character varying(12),
    pedido character varying(12),
    fecha date,
    fecha_venc date,
    cantidad double precision,
    cantidad2 double precision,
    vlr_bruto double precision,
    vlr_reteventa double precision,
    vlr_reteiva double precision,
    vlr_varios double precision,
    vlr_descuento double precision,
    vlr_flete double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    vlr_adicional1 double precision,
    pago1 character varying(2),
    vlr_adicional2 double precision,
    pago2 character varying(2),
    vlr_adicional3 double precision,
    pago3 character varying(2),
    vlr_descto_fin double precision,
    pedido_interno character varying(25),
    vendedor character varying(2),
    observaciones character varying(120),
    hora character varying(8),
    doc_pago character varying(15),
    nombre_comercial character varying(20),
    obs_entrega character varying(30),
    condicion_pago character varying(20),
    estado smallint,
    vlr_retecompra double precision,
    vlr_credito double precision,
    contrapartida character varying(15),
    evento character varying(10),
    tipo character varying(2),
    dscto_contrato character varying(30),
    motivo_dev character varying(2),
    responsable character varying(4),
    transportadora character varying(13),
    destino character varying(5),
    cantidad_pend double precision,
    vlr_transporte double precision,
    guia character varying(20),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: sync_control; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.sync_control (
    tabla text NOT NULL,
    ultimo_watermark text,
    actualizado_en timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_01; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_01 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_02; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_02 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_03; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_03 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_04; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_04 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_05; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_05 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_06; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_06 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_07; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_07 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_08; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_08 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_09; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_09 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_10; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_10 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_11; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_11 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_12; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_2026_12 (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_default; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.venta_lineas_default (
    sucursal character varying(2),
    cliente_cod character varying(13),
    factura_num character varying(12),
    articulo_cod character varying(19),
    plu double precision,
    ean character varying(13),
    articulo_nombre character varying(30),
    proveedor character varying(10),
    cantidad double precision,
    vlr_unitario double precision,
    vlr_bruto double precision,
    pct_descuento double precision,
    vlr_descuento double precision,
    pct_iva double precision,
    vlr_iva double precision,
    vlr_impoconsumo double precision,
    vlr_otro_imp double precision,
    vlr_neto double precision,
    hora character varying(8),
    fecha date NOT NULL,
    vendedor character varying(4),
    tipo character varying(1),
    caja character varying(2),
    devolucion character varying(2),
    tipo_producto character varying(3),
    fecha_carga timestamp with time zone DEFAULT now()
);


--
-- Name: venta_lineas_2026_01; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_01 FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');


--
-- Name: venta_lineas_2026_02; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_02 FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');


--
-- Name: venta_lineas_2026_03; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_03 FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');


--
-- Name: venta_lineas_2026_04; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_04 FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');


--
-- Name: venta_lineas_2026_05; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_05 FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');


--
-- Name: venta_lineas_2026_06; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_06 FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');


--
-- Name: venta_lineas_2026_07; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_07 FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');


--
-- Name: venta_lineas_2026_08; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_08 FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');


--
-- Name: venta_lineas_2026_09; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_09 FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');


--
-- Name: venta_lineas_2026_10; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_10 FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');


--
-- Name: venta_lineas_2026_11; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_11 FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');


--
-- Name: venta_lineas_2026_12; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_2026_12 FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');


--
-- Name: venta_lineas_default; Type: TABLE ATTACH; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.venta_lineas ATTACH PARTITION pos.venta_lineas_default DEFAULT;


--
-- Name: cliente_segmento cliente_segmento_pkey; Type: CONSTRAINT; Schema: analytics; Owner: -
--

ALTER TABLE ONLY analytics.cliente_segmento
    ADD CONSTRAINT cliente_segmento_pkey PRIMARY KEY (cliente_cod);


--
-- Name: bodegas bodegas_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.bodegas
    ADD CONSTRAINT bodegas_pkey PRIMARY KEY (codigo);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (codcli);


--
-- Name: sync_control sync_control_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.sync_control
    ADD CONSTRAINT sync_control_pkey PRIMARY KEY (tabla);


--
-- Name: venta_lineas_cliente_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_cliente_fecha_idx ON ONLY pos.venta_lineas USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_01_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_01_cliente_cod_fecha_idx ON pos.venta_lineas_2026_01 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_factura_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_factura_idx ON ONLY pos.venta_lineas USING btree (factura_num);


--
-- Name: venta_lineas_2026_01_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_01_factura_num_idx ON pos.venta_lineas_2026_01 USING btree (factura_num);


--
-- Name: venta_lineas_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_fecha_idx ON ONLY pos.venta_lineas USING btree (fecha);


--
-- Name: venta_lineas_2026_01_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_01_fecha_idx ON pos.venta_lineas_2026_01 USING btree (fecha);


--
-- Name: venta_lineas_2026_02_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_02_cliente_cod_fecha_idx ON pos.venta_lineas_2026_02 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_02_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_02_factura_num_idx ON pos.venta_lineas_2026_02 USING btree (factura_num);


--
-- Name: venta_lineas_2026_02_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_02_fecha_idx ON pos.venta_lineas_2026_02 USING btree (fecha);


--
-- Name: venta_lineas_2026_03_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_03_cliente_cod_fecha_idx ON pos.venta_lineas_2026_03 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_03_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_03_factura_num_idx ON pos.venta_lineas_2026_03 USING btree (factura_num);


--
-- Name: venta_lineas_2026_03_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_03_fecha_idx ON pos.venta_lineas_2026_03 USING btree (fecha);


--
-- Name: venta_lineas_2026_04_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_04_cliente_cod_fecha_idx ON pos.venta_lineas_2026_04 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_04_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_04_factura_num_idx ON pos.venta_lineas_2026_04 USING btree (factura_num);


--
-- Name: venta_lineas_2026_04_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_04_fecha_idx ON pos.venta_lineas_2026_04 USING btree (fecha);


--
-- Name: venta_lineas_2026_05_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_05_cliente_cod_fecha_idx ON pos.venta_lineas_2026_05 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_05_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_05_factura_num_idx ON pos.venta_lineas_2026_05 USING btree (factura_num);


--
-- Name: venta_lineas_2026_05_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_05_fecha_idx ON pos.venta_lineas_2026_05 USING btree (fecha);


--
-- Name: venta_lineas_2026_06_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_06_cliente_cod_fecha_idx ON pos.venta_lineas_2026_06 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_06_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_06_factura_num_idx ON pos.venta_lineas_2026_06 USING btree (factura_num);


--
-- Name: venta_lineas_2026_06_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_06_fecha_idx ON pos.venta_lineas_2026_06 USING btree (fecha);


--
-- Name: venta_lineas_2026_07_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_07_cliente_cod_fecha_idx ON pos.venta_lineas_2026_07 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_07_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_07_factura_num_idx ON pos.venta_lineas_2026_07 USING btree (factura_num);


--
-- Name: venta_lineas_2026_07_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_07_fecha_idx ON pos.venta_lineas_2026_07 USING btree (fecha);


--
-- Name: venta_lineas_2026_08_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_08_cliente_cod_fecha_idx ON pos.venta_lineas_2026_08 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_08_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_08_factura_num_idx ON pos.venta_lineas_2026_08 USING btree (factura_num);


--
-- Name: venta_lineas_2026_08_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_08_fecha_idx ON pos.venta_lineas_2026_08 USING btree (fecha);


--
-- Name: venta_lineas_2026_09_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_09_cliente_cod_fecha_idx ON pos.venta_lineas_2026_09 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_09_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_09_factura_num_idx ON pos.venta_lineas_2026_09 USING btree (factura_num);


--
-- Name: venta_lineas_2026_09_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_09_fecha_idx ON pos.venta_lineas_2026_09 USING btree (fecha);


--
-- Name: venta_lineas_2026_10_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_10_cliente_cod_fecha_idx ON pos.venta_lineas_2026_10 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_10_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_10_factura_num_idx ON pos.venta_lineas_2026_10 USING btree (factura_num);


--
-- Name: venta_lineas_2026_10_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_10_fecha_idx ON pos.venta_lineas_2026_10 USING btree (fecha);


--
-- Name: venta_lineas_2026_11_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_11_cliente_cod_fecha_idx ON pos.venta_lineas_2026_11 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_11_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_11_factura_num_idx ON pos.venta_lineas_2026_11 USING btree (factura_num);


--
-- Name: venta_lineas_2026_11_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_11_fecha_idx ON pos.venta_lineas_2026_11 USING btree (fecha);


--
-- Name: venta_lineas_2026_12_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_12_cliente_cod_fecha_idx ON pos.venta_lineas_2026_12 USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_2026_12_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_12_factura_num_idx ON pos.venta_lineas_2026_12 USING btree (factura_num);


--
-- Name: venta_lineas_2026_12_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_2026_12_fecha_idx ON pos.venta_lineas_2026_12 USING btree (fecha);


--
-- Name: venta_lineas_default_cliente_cod_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_default_cliente_cod_fecha_idx ON pos.venta_lineas_default USING btree (cliente_cod, fecha);


--
-- Name: venta_lineas_default_factura_num_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_default_factura_num_idx ON pos.venta_lineas_default USING btree (factura_num);


--
-- Name: venta_lineas_default_fecha_idx; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX venta_lineas_default_fecha_idx ON pos.venta_lineas_default USING btree (fecha);


--
-- Name: venta_lineas_2026_01_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_01_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_01_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_01_factura_num_idx;


--
-- Name: venta_lineas_2026_01_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_01_fecha_idx;


--
-- Name: venta_lineas_2026_02_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_02_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_02_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_02_factura_num_idx;


--
-- Name: venta_lineas_2026_02_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_02_fecha_idx;


--
-- Name: venta_lineas_2026_03_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_03_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_03_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_03_factura_num_idx;


--
-- Name: venta_lineas_2026_03_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_03_fecha_idx;


--
-- Name: venta_lineas_2026_04_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_04_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_04_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_04_factura_num_idx;


--
-- Name: venta_lineas_2026_04_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_04_fecha_idx;


--
-- Name: venta_lineas_2026_05_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_05_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_05_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_05_factura_num_idx;


--
-- Name: venta_lineas_2026_05_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_05_fecha_idx;


--
-- Name: venta_lineas_2026_06_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_06_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_06_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_06_factura_num_idx;


--
-- Name: venta_lineas_2026_06_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_06_fecha_idx;


--
-- Name: venta_lineas_2026_07_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_07_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_07_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_07_factura_num_idx;


--
-- Name: venta_lineas_2026_07_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_07_fecha_idx;


--
-- Name: venta_lineas_2026_08_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_08_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_08_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_08_factura_num_idx;


--
-- Name: venta_lineas_2026_08_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_08_fecha_idx;


--
-- Name: venta_lineas_2026_09_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_09_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_09_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_09_factura_num_idx;


--
-- Name: venta_lineas_2026_09_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_09_fecha_idx;


--
-- Name: venta_lineas_2026_10_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_10_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_10_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_10_factura_num_idx;


--
-- Name: venta_lineas_2026_10_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_10_fecha_idx;


--
-- Name: venta_lineas_2026_11_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_11_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_11_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_11_factura_num_idx;


--
-- Name: venta_lineas_2026_11_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_11_fecha_idx;


--
-- Name: venta_lineas_2026_12_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_12_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_2026_12_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_2026_12_factura_num_idx;


--
-- Name: venta_lineas_2026_12_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_2026_12_fecha_idx;


--
-- Name: venta_lineas_default_cliente_cod_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_cliente_fecha_idx ATTACH PARTITION pos.venta_lineas_default_cliente_cod_fecha_idx;


--
-- Name: venta_lineas_default_factura_num_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_factura_idx ATTACH PARTITION pos.venta_lineas_default_factura_num_idx;


--
-- Name: venta_lineas_default_fecha_idx; Type: INDEX ATTACH; Schema: pos; Owner: -
--

ALTER INDEX pos.venta_lineas_fecha_idx ATTACH PARTITION pos.venta_lineas_default_fecha_idx;


--
-- PostgreSQL database dump complete
--

\unrestrict dxKgb6X7g9FROHH7UIvHYGav0OkQ7Mbbqpoy6QsvkKSWgs5xcqfDL5GWNCY4g4V

