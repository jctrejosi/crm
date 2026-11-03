# Datos del Radar de Precios (Mercado)

`mercado.json` alimenta la vista `src/views/Mercado.tsx` (sidebar → Marketing →
Mercado). Está **embebido** en el bundle: se importa como módulo, no se pide a
ninguna API.

## Origen

Se genera en el proyecto **Vassago** a partir de los catálogos crawleados de
Éxito, Olímpica, Carulla y D1:

```sh
# 1. cruce Mercaldas ↔ competencia (EAN + equivalentes) → radar.json
#    (sin flags = solo alimentos, el alcance actual del dashboard)
cd /home/jk/Proyectos/seeds/Vassago
python3 scripts-agent/build_radar.py

# 2. agregados para el dashboard → este archivo
python3 scripts-agent/build_mercado_data.py
```

Alcance actual: **alimentos** (5.297 productos de Mercaldas). Con
`build_radar.py --all-roots` se cubre el catálogo completo (11.377), pero la
cobertura baja al 37 % porque todavía no hay catálogo de competencia no
alimentario.

`build_mercado_data.py` escribe directamente en
`crm/interface web/src/data/mercado/mercado.json`.

## Cobertura

Corrida actual: **3.595 de 5.297** productos comparados (67,9 %): 3.079 por EAN
idéntico y 516 solo por equivalencia. Productos con par por almacén: Éxito
3.000 · Carulla 2.814 · Olímpica 2.641 · **D1 298**.

D1 es el retailer con menos relaciones porque su catálogo público es pequeño
(2.020 SKU, y ~500 son de temporada). El detalle del embudo y la investigación
del cruce está en `Vassago/web_scraper/scanner/radar/README.md`.

## Contenido

- `meta`: fecha de los precios, cobertura (`compared` de `mercaldas_products`),
  parámetros del cruce y `coverage_by_root`.
  - `source_dates`: fecha de **captura** de cada catálogo (`mercaldas`, `Éxito`,
    `Carulla`, `Olímpica`, `D1`). La vista la muestra como rango en la cabecera
    («Precios 28 oct – 2 nov») y por almacén en cada tarjeta.
  - `mercaldas_captured_at`: fecha del catálogo base de Mercaldas.
- `modes.exact`: agregados usando **solo EAN idéntico**.
- `modes.all`: agregados con **EAN + equivalentes** (mismo tipo y contenido,
  otra marca).
- `modes.*.stores[]` incluye `data_date` (fecha de los precios de esa tienda).
- `products[]`: el detalle crudo. Cada producto trae `exact` y `equivalent` por
  almacén (`exito`, `olimpica`, `carulla`, `d1`) con precio y nombre del
  producto cruzado. El cliente calcula el mejor precio y la brecha según el
  toggle «Mismo producto / + Equivalentes».

Cada modo trae `kpis`, `stores`, `categories`, `gap_distribution` y `review`
(top 120 por sobreprecio, precalculado).

## Reglas de negocio de las métricas

- `gap = (precio Mercaldas − mejor precio competencia) / mejor precio × 100`.
  Positivo = Mercaldas más caro.
- Por almacén: `cheaper` = la tienda es más barata que Mercaldas,
  `pricier` = la tienda es más cara (Mercaldas gana).
- `price_index` = mediana de `precio tienda / precio Mercaldas`. < 1 la tienda
  es más barata.
- `risk_threshold` (15 % por defecto): producto «en riesgo» cuando Mercaldas
  está al menos ese % por encima del más barato.
- `overprice_cop` = suma de la diferencia positiva frente al más barato;
  sirve para priorizar acciones por impacto en pesos, no solo en %.
