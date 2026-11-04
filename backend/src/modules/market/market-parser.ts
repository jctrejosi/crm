import type { MarketStoreConfig } from './market.config';
import type { VtexItem, VtexRawProduct } from './vtex.client';

/** Producto normalizado, listo para upsert en `competitor_products`. */
export interface ParsedCompetitorProduct {
  externalId: string;
  plu: string | null;
  ean: string | null;
  name: string;
  brand: string | null;
  url: string | null;
  imageUrl: string | null;
  measurementUnit: string | null;
  /** Se guarda como string porque la columna es `numeric`. */
  unitValue: string | null;
  price: string;
  listPrice: string | null;
  isAvailable: boolean;
  availableQuantity: number | null;
  /** IDs externos de categoría (sin duplicados). */
  categoryExternalIds: string[];
}

interface Offer {
  price: number;
  listPrice: number | null;
  isAvailable: boolean;
  availableQuantity: number | null;
  item: VtexItem;
}

/** Convierte un valor primitivo a string; los objetos se descartan. */
const toNullableString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const str = value.trim();
    return str.length ? str : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === 'boolean') return String(value);
  return null;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Devuelve el primer valor no vacío de una especificación VTEX. */
function specValue(product: VtexRawProduct, keys: string[]): string | null {
  for (const key of keys) {
    const value = product[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        const parsed = toNullableString(entry);
        if (parsed) return parsed;
      }
    } else {
      const parsed = toNullableString(value);
      if (parsed) return parsed;
    }
  }
  return null;
}

/**
 * Elige la mejor oferta: prioriza disponibilidad y, entre iguales, el precio
 * positivo más bajo. Evita el error clásico de usar solo `items[0]`, que deja
 * entre 8 % y 26 % de precios en 0 en Éxito/Carulla.
 */
function pickOffer(product: VtexRawProduct): Offer | null {
  let best: Offer | null = null;

  for (const item of product.items ?? []) {
    for (const seller of item.sellers ?? []) {
      const offer = seller.commertialOffer;
      if (!offer) continue;
      const price = parseNumber(offer.Price);
      if (price === null || price <= 0) continue;

      const candidate: Offer = {
        price,
        listPrice: parseNumber(offer.ListPrice),
        isAvailable: offer.IsAvailable === true,
        availableQuantity: parseNumber(offer.AvailableQuantity),
        item,
      };

      if (!best) {
        best = candidate;
        continue;
      }
      if (!best.isAvailable && candidate.isAvailable) {
        best = candidate;
        continue;
      }
      if (
        best.isAvailable === candidate.isAvailable &&
        candidate.price < best.price
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function firstEan(
  product: VtexRawProduct,
  item: VtexItem | undefined,
): string | null {
  const fromItem = toNullableString(item?.ean);
  if (fromItem) return fromItem;

  for (const it of product.items ?? []) {
    const ean = toNullableString(it.ean);
    if (ean) return ean;
  }

  const topLevel = product.ean;
  if (Array.isArray(topLevel)) {
    for (const ean of topLevel) {
      const value = toNullableString(ean);
      if (value) return value;
    }
  }
  return toNullableString(topLevel);
}

function firstImage(
  product: VtexRawProduct,
  item: VtexItem | undefined,
): string | null {
  const image = (item?.images ?? []).find((img) => img.imageUrl);
  if (image?.imageUrl) return image.imageUrl;

  for (const it of product.items ?? []) {
    const img = (it.images ?? []).find((i) => i.imageUrl);
    if (img?.imageUrl) return img.imageUrl;
  }
  return null;
}

function referenceId(item: VtexItem | undefined): string | null {
  for (const ref of item?.referenceId ?? []) {
    if (String(ref.Key ?? '').toLowerCase() === 'refid') {
      const value = toNullableString(ref.Value);
      if (value) return value;
    }
  }
  return null;
}

/** Extrae todos los IDs de categoría de las rutas `/1/20/`. */
function categoryExternalIds(product: VtexRawProduct): string[] {
  const ids = new Set<string>();
  for (const path of product.categoriesIds ?? []) {
    for (const segment of path.split('/')) {
      const id = segment.trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Normaliza un producto de la búsqueda VTEX. Devuelve `null` si no tiene
 * nombre o ninguna oferta con precio positivo (productos sin precio no sirven
 * para el radar).
 */
export function parseVtexProduct(
  product: VtexRawProduct,
  store: MarketStoreConfig,
): ParsedCompetitorProduct | null {
  const externalId = toNullableString(product.productId);
  const name = toNullableString(product.productName);
  if (!externalId || !name) return null;

  const offer = pickOffer(product);
  if (!offer) return null;

  const item = offer.item;
  const ean = firstEan(product, item);

  const linkText = toNullableString(product.linkText);
  const url = linkText ? store.productUrl(linkText) : null;

  const unitValueRaw =
    specValue(product, ['Factor Neto PUM', 'Valor de Medida', 'PUM']) ??
    toNullableString(item.unitMultiplier);
  const unitValueNumber = parseNumber(unitValueRaw);

  const measurementUnit =
    specValue(product, [
      'Unidad de Medida',
      'Unidad De Medida',
      'measurement_unit',
      'Ump del Empaque 1 (Out)',
    ]) ?? toNullableString(item.measurementUnit);

  const plu =
    toNullableString(product.productReference) ??
    toNullableString(product.productReferenceCode) ??
    referenceId(item) ??
    ean ??
    externalId;

  return {
    externalId,
    plu,
    ean,
    name,
    brand: toNullableString(product.brand),
    url,
    imageUrl: firstImage(product, item),
    measurementUnit,
    unitValue: unitValueNumber !== null ? unitValueNumber.toFixed(3) : null,
    price: offer.price.toFixed(2),
    listPrice: offer.listPrice !== null ? offer.listPrice.toFixed(2) : null,
    isAvailable: offer.isAvailable,
    availableQuantity: offer.availableQuantity,
    categoryExternalIds: categoryExternalIds(product),
  };
}
