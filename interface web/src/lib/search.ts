/**
 * Buscador tolerante a tildes y errores de tipeo, con el mismo criterio de
 * relevancia que el catálogo del ecommerce.
 *
 * Origen: `ecommerce/backend/src/modules/catalog/catalog.service.ts`, método
 * `getProducts()`, donde la búsqueda corre en Postgres. Aquí se reproduce en el
 * cliente porque el CRM no tiene API:
 *
 *   1. Normalización sin tildes/ñ y en minúsculas (equivale a `unaccent`).
 *   2. Coincidencia por palabra completa o por inicio de palabra (sustituto del
 *      full-text en español, que además hace stemming).
 *   3. Difuso: similitud de trigramas al estilo `pg_trgm` y, además, cercanía
 *      de edición (máximo un cambio, dos en palabras largas). Ambas condiciones
 *      a la vez: la similitud sola daba falsos positivos como `cola` ≈ `color`
 *      (0,375) o `pañal` ≈ `Pan` (0,43). Es lo que hace que «arros» encuentre
 *      «arroz» y «dianna» encuentre «diana».
 *   4. Códigos (PLU/EAN): la frase completa se busca como subcadena.
 *   5. Relevancia: las mismas ponderaciones del ecommerce (nombre que empieza,
 *      palabra completa, inicio de palabra, aparición en cualquier parte y
 *      código), sumadas sobre las 4 primeras palabras de la consulta.
 *
 * Semántica OR, igual que allá: basta con que coincida UNA palabra de la frase.
 * Las palabras vacías se ignoran porque no aportan señal.
 */

const MAX_TOKENS = 8;
const MAX_FUZZY_TOKENS = 5;
const FUZZY_MIN_LENGTH = 3;
const PREFIX_MIN_LENGTH = 5;
/**
 * Cuántas letras de más puede tener la palabra para darse por «empezada» por el
 * token. Cuanto más corto el token, más se tolera (se está tecleando), pero sin
 * llegar a cruzar palabras distintas: con 4 letras «cola» no debe traer «colada».
 */
function prefixMaxExtra(token: string): number {
  return token.length <= 3 ? 2 : 1;
}
const GRAM_CACHE_LIMIT = 50_000;

/** Palabras que el full-text en español descarta como stopwords. */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'lo', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'con', 'sin', 'por', 'para', 'en', 'al', 'a', 'que',
  'the', 'and', 'of',
]);

// Ponderaciones de relevancia del ecommerce (`relevanceParts` en el servicio).
const RANK_TOKENS = 4;
const WEIGHT_NAME_STARTS = 0.8;
const WEIGHT_WHOLE_WORD = 1.0;
const WEIGHT_WORD_STARTS = 0.4;
const WEIGHT_ANYWHERE = 0.15;
const WEIGHT_CODE = 1.5;
// El ecommerce no puntúa los aciertos difusos (allí el full-text ya los resuelve
// como lexemas), pero sin esto «arros» dejaba todo en 0 y ordenaba alfabéticamente,
// con «Alimento húmedo PEDIGREE» por delante de los arroces.
const WEIGHT_FUZZY_HEAD = 0.6;
const WEIGHT_FUZZY_ANY = 0.1;

export interface SearchDoc {
  /** Nombre normalizado, sin relleno. Se usa para «el nombre empieza por». */
  name: string;
  /** Nombre + marca normalizados, con un espacio a cada lado. */
  text: string;
  /** Palabras de `text`, para el cruce por palabra y el difuso. */
  words: string[];
  /** Códigos (PLU, EAN…) normalizados. */
  codes: string[];
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function buildDoc(
  name: string | null | undefined,
  brand: string | null | undefined,
  code: string | number | null | undefined,
): SearchDoc {
  const normalizedName = normalize(String(name ?? '')).trim();
  const text = `${normalizedName} ${normalize(String(brand ?? ''))}`.trim();
  const codeText = normalize(String(code ?? '')).trim();
  return {
    name: normalizedName,
    text: ` ${text} `,
    words: splitWords(text),
    codes: /^[0-9]{4,}$/.test(codeText) ? [codeText] : [],
  };
}

function splitWords(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const gramCache = new Map<string, Set<string>>();

/** Trigramas con el mismo relleno de `pg_trgm`: dos espacios al inicio, uno al final. */
function grams(word: string): Set<string> {
  const cached = gramCache.get(word);
  if (cached) return cached;
  if (gramCache.size > GRAM_CACHE_LIMIT) gramCache.clear();
  const padded = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
  gramCache.set(word, out);
  return out;
}

function trigramSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Distancia de Levenshtein acotada: corta en cuanto supera `max`. */
function withinEdits(left: string, right: string, max: number): boolean {
  if (Math.abs(left.length - right.length) > max) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return false;
    previous = current;
  }
  return previous[right.length] <= max;
}

function maxEdits(token: string): number {
  return token.length >= 8 ? 2 : 1;
}

/** Las palabras cortas exigen más parecido: con 4 letras todo se parece a todo. */
function minSimilarity(token: string): number {
  return token.length <= 4 ? 0.5 : 0.4;
}

function tokenize(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of normalize(query).split(/\s+/)) {
    if (!raw || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    if (seen.size >= MAX_TOKENS) break;
  }
  return [...seen];
}

/**
 * Relevancia de un producto para la consulta (mayor = más arriba).
 * Réplica de `relevanceParts`: las cuatro señales de nombre se acumulan por
 * palabra, más el bonus de código exacto. El `featured` del ecommerce no existe
 * en el catálogo de Mercaldas, así que se omite.
 */
function relevance(doc: SearchDoc, tokens: string[], codeNeedle: string): number {
  let total = 0;
  for (const token of tokens.slice(0, RANK_TOKENS)) {
    let signal = 0;
    if (doc.name.startsWith(token)) signal += WEIGHT_NAME_STARTS;
    if (doc.words.includes(token)) signal += WEIGHT_WHOLE_WORD;
    if (doc.words.some((word) => word.startsWith(token))) signal += WEIGHT_WORD_STARTS;
    if (doc.text.includes(token)) signal += WEIGHT_ANYWHERE;
    if (signal === 0) signal = fuzzySignal(doc, token);
    total += signal;
  }
  if (codeNeedle && doc.codes.some((code) => code.includes(codeNeedle))) total += WEIGHT_CODE;
  return total;
}

/** Puntaje de un acierto por tipeo: más alto si la palabra inicial del nombre se parece. */
function fuzzySignal(doc: SearchDoc, token: string): number {
  if (token.length < FUZZY_MIN_LENGTH || /^\d+$/.test(token)) return 0;
  const tokenGrams = grams(token);
  const max = maxEdits(token);
  const minSim = minSimilarity(token);
  const matches = (word: string) =>
    Math.abs(word.length - token.length) <= 2 &&
    trigramSimilarity(tokenGrams, grams(word)) >= minSim &&
    withinEdits(token, word, max);

  if (doc.words.length && matches(doc.words[0])) return WEIGHT_FUZZY_HEAD;
  if (doc.words.some(matches)) return WEIGHT_FUZZY_ANY;
  return 0;
}

/** Devuelve la relevancia o `null` si el producto no coincide con la consulta. */
export type Searcher = (doc: SearchDoc) => number | null;

export function buildSearcher(query: string): Searcher {
  const tokens = tokenize(query);
  if (!tokens.length) return () => 0;

  // Palabra completa: cubre el lexema que el full-text resuelve con stemming.
  const alternation = tokens.map(escapeRegExp).join('|');
  const exactWord = new RegExp(`(^|[^a-z0-9])(?:${alternation})([^a-z0-9]|$)`);
  // Con 1-2 letras se mantiene la búsqueda clásica por subcadena: sirve para ir
  // viendo resultados mientras se teclea.
  const substring = tokens.filter((token) => token.length <= 2);
  const prefixable = tokens.filter((token) => token.length > 2);
  const fuzzy = tokens
    // los códigos numéricos se buscan tal cual: difuminar «7702» con «702» no aporta
    .filter((token) => token.length >= FUZZY_MIN_LENGTH && !/^\d+$/.test(token))
    .slice(0, MAX_FUZZY_TOKENS)
    .map((token) => ({
      token,
      grams: grams(token),
      max: maxEdits(token),
      minSimilarity: minSimilarity(token),
      minLength: token.length - 2,
      maxLength: token.length + 2,
    }));
  const codeNeedle = normalize(query).replace(/\s+/g, '');

  const matchesPrefix = (doc: SearchDoc) =>
    doc.words.some((word) =>
      prefixable.some(
        (token) =>
          word.startsWith(token) &&
          (token.length >= PREFIX_MIN_LENGTH ||
            word.length - token.length <= prefixMaxExtra(token)),
      ),
    );

  const matchesFuzzy = (doc: SearchDoc) =>
    fuzzy.some((fuzzyToken) =>
      doc.words.some(
        (word) =>
          word.length >= fuzzyToken.minLength &&
          word.length <= fuzzyToken.maxLength &&
          trigramSimilarity(fuzzyToken.grams, grams(word)) >= fuzzyToken.minSimilarity &&
          withinEdits(fuzzyToken.token, word, fuzzyToken.max),
      ),
    );

  return (doc) => {
    const matched =
      (Boolean(codeNeedle) && doc.codes.some((code) => code.includes(codeNeedle))) ||
      exactWord.test(doc.text) ||
      substring.some((token) => doc.text.includes(token)) ||
      matchesPrefix(doc) ||
      matchesFuzzy(doc);
    return matched ? relevance(doc, tokens, codeNeedle) : null;
  };
}
