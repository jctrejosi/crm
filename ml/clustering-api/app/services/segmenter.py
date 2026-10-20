"""Selección del mejor segmento para un conjunto de productos.

Flujo:
1. Si el modelo no existe y `auto_fit`, se entrena con la vista RFM
   (equivalente a /fit-from-db).
2. Se asignan labels a todos los clientes de la vista RFM.
3. Se mide la afinidad: clientes de cada segmento que compraron las mismas
   categorías (tipo_producto) que los productos seleccionados, en la réplica
   pos.venta_lineas.
4. Se devuelve el segmento con mayor afinidad (share de compradores) y sus
   clientes (ids = cédula/NIT, que mapean a customers.document_number).
"""

from collections import Counter
from types import SimpleNamespace

from app.services.assigner import Assigner
from app.services.clusterer import Clusterer
from app.services.db import execute_read, read_features
from app.services.model_store import ModelStore

# Vista RFM + columna identificadora usadas para entrenar/asignar.
RFM_QUERY = "SELECT * FROM analytics.vw_rfm_clientes"
RFM_ID_COLUMN = "cliente_cod"

# Parámetros por defecto del auto-fit (mismos defaults que /fit-from-db).
AUTO_FIT_K = 6
AUTO_FIT_ALGORITHM = "minibatch"


def _ensure_model(model_name: str, auto_fit: bool, progress=None) -> None:
    if ModelStore.model_exists(model_name):
        return
    if not auto_fit:
        raise FileNotFoundError(f"No existe el modelo '{model_name}'")
    if progress:
        progress("fit", "Entrenando el modelo de segmentación…", 12)
    ids, feature_names, X = read_features(RFM_QUERY, RFM_ID_COLUMN)
    Clusterer.fit_matrix(
        SimpleNamespace(
            model_name=model_name,
            algorithm=AUTO_FIT_ALGORITHM,
            k=AUTO_FIT_K,
            scale=True,
            random_state=42,
            max_iter=300,
        ),
        X,
        feature_names=feature_names,
        id_column=RFM_ID_COLUMN,
    )
    if progress:
        progress("fit_done", "Modelo entrenado", 25)


def _assign_labels(model_name: str) -> tuple:
    """Devuelve (ids, labels, X, feature_names) para construir features."""
    ids, feature_names, X = read_features(RFM_QUERY, RFM_ID_COLUMN)
    result = Assigner.assign_matrix(model_name, X)
    return ids, result["labels"], X, feature_names


def _product_categories(products: list[str]) -> list[str]:
    """Categorías (tipo_producto) de los productos seleccionados."""
    rows = execute_read(
        "SELECT DISTINCT tipo_producto FROM pos.venta_lineas "
        "WHERE articulo_cod = ANY(%s) "
        "AND tipo_producto IS NOT NULL AND tipo_producto <> ''",
        [products],
    )
    return [r[0] for r in rows]


def _clean_phone(v) -> str | None:
    """Normaliza teléfono: descarta vacíos y valores basura (0, 000, ...)."""
    if not v:
        return None
    s = str(v).strip()
    if not s or s.strip("0") == "":
        return None
    return s


def _client_contacts(cedulas: list[str]) -> dict:
    """Datos de contacto de pos.clientes (nombre, email, celular, consent)."""
    if not cedulas:
        return {}
    rows = execute_read(
        "SELECT cedula, nombre, email, celular, telefono, "
        "consentimiento_email, consentimiento_whatsapp, consentimiento_sms "
        "FROM pos.clientes WHERE cedula = ANY(%s)",
        [cedulas],
    )
    contacts = {}
    for r in rows:
        phone = _clean_phone(r[3]) or _clean_phone(r[4])
        contacts[r[0]] = {
            "name": (r[1] or "").strip() or None,
            "email": (r[2] or "").strip() or None,
            "phone": phone,
            "consent_email": bool(r[5]),
            "consent_whatsapp": bool(r[6]),
            "consent_sms": bool(r[7]),
        }
    return contacts


def _category_buyers(categories: list[str]) -> set:
    """Clientes que compraron algo de las categorías dadas (unión)."""
    if not categories:
        return set()
    rows = execute_read(
        "SELECT DISTINCT cliente_cod FROM pos.venta_lineas "
        "WHERE tipo_producto = ANY(%s) AND cliente_cod IS NOT NULL",
        [categories],
    )
    return {r[0] for r in rows}


def _exact_buyers(products: list[str]) -> set:
    """Clientes que compraron al menos uno de los artículos exactos."""
    rows = execute_read(
        "SELECT DISTINCT cliente_cod FROM pos.venta_lineas "
        "WHERE articulo_cod = ANY(%s) AND cliente_cod IS NOT NULL",
        [products],
    )
    return {r[0] for r in rows}


def _co_buyers(products: list[str]) -> set:
    """Clientes que compraron TODOS los productos en la MISMA factura."""
    if len(products) < 2:
        return _exact_buyers(products)
    rows = execute_read(
        "SELECT cliente_cod FROM pos.venta_lineas "
        "WHERE articulo_cod = ANY(%s) AND cliente_cod IS NOT NULL "
        "GROUP BY factura_num, cliente_cod "
        "HAVING count(DISTINCT articulo_cod) = %s",
        [products, len(products)],
    )
    return {r[0] for r in rows}


def _segment_ranking(
    labels_by_cedula: dict, buyers: set
) -> list[dict]:
    """Ranking de segmentos por share de compradores (afinidad)."""
    buyers_by_seg: Counter = Counter()
    for cedula in buyers:
        lab = labels_by_cedula.get(cedula)
        if lab is not None:
            buyers_by_seg[lab] += 1
    total_by_seg = Counter(labels_by_cedula.values())

    ranking = []
    for seg in sorted(total_by_seg):
        total = total_by_seg[seg]
        buyers_n = buyers_by_seg.get(seg, 0)
        ranking.append({
            "segment": seg,
            "total": total,
            "buyers": buyers_n,
            "share": round(buyers_n / total, 4) if total else 0.0,
        })
    ranking.sort(key=lambda r: (r["share"], r["buyers"]), reverse=True)
    return ranking


def segment_for_products(
    model_name: str,
    products: list[str],
    auto_fit: bool = True,
    limit: int | None = None,
    progress=None,
    mode: str = "multi",
) -> dict:
    def emit(stage: str, message: str, pct: int) -> None:
        if progress:
            progress(stage, message, pct)

    emit("db", "Leyendo réplica de analytics (vista RFM)…", 5)
    _ensure_model(model_name, auto_fit, progress)

    emit("assign", "Asignando segmentos a los clientes…", 40)
    ids, labels, X, feature_names = _assign_labels(model_name)
    labels_by_cedula = dict(zip(ids, labels))

    # Features numéricas por cliente (las que consumen xgboost/uplift).
    feat_names = [
        n for n in ("frecuencia", "monetario", "ticket_promedio", "categorias_distintas")
        if n in feature_names
    ]
    feat_idx = {n: feature_names.index(n) for n in feat_names}
    features_by_cedula = {
        c: {n: float(X[i][feat_idx[n]]) for n in feat_names}
        for i, c in enumerate(ids)
    }

    # Perfil promedio (features RFM) por segmento: para explicar qué representa
    # cada segmento en el ranking (frecuencia, monetario, ticket, categorías).
    seg_feat_sums: dict[int, dict[str, float]] = {}
    seg_feat_counts: dict[int, int] = {}
    for cedula, lab in labels_by_cedula.items():
        f = features_by_cedula.get(cedula)
        if f is None:
            continue
        acc = seg_feat_sums.setdefault(lab, {})
        for k, v in f.items():
            acc[k] = acc.get(k, 0.0) + v
        seg_feat_counts[lab] = seg_feat_counts.get(lab, 0) + 1

    emit("affinity", "Calculando afinidad con los productos seleccionados…", 60)
    categories = _product_categories(products)

    # Dos modos que NO se pisan entre sí:
    #   multi  → unión: clientes que compraron CUALQUIER producto/categoría.
    #   bundle → co-compra: clientes que compraron TODOS juntos (misma factura).
    bundle_fallback = False
    if mode == "bundle" and len(products) >= 2:
        buyers = _co_buyers(products)
        if not buyers:
            bundle_fallback = True
            buyers = _category_buyers(categories) or _exact_buyers(products)
    else:
        buyers = _category_buyers(categories) or _exact_buyers(products)

    ranking = _segment_ranking(labels_by_cedula, buyers)
    if not ranking:
        raise ValueError("no hay segmentos asignados")
    for row in ranking:
        seg = row["segment"]
        n = seg_feat_counts.get(seg, 0)
        row["means"] = (
            {k: round(v / n, 3) for k, v in seg_feat_sums.get(seg, {}).items()}
            if n
            else {}
        )
    best = ranking[0]

    seg_ids = [c for c, lab in labels_by_cedula.items() if lab == best["segment"]]
    if limit:
        seg_ids = seg_ids[:limit]

    emit("contacts", "Obteniendo datos de contacto de los clientes…", 82)
    contacts = _client_contacts(seg_ids)
    empty = {
        "name": None, "email": None, "phone": None,
        "consent_email": False, "consent_whatsapp": False, "consent_sms": False,
    }
    recipients = [
        {
            "cedula": c,
            "segment": labels_by_cedula[c],
            "features": features_by_cedula.get(c, {}),
            **contacts.get(c, empty),
        }
        for c in seg_ids
    ]

    emit("done", "Segmentación completada", 100)

    if mode == "bundle":
        if bundle_fallback:
            note = (
                f"Co-compra de los {len(products)} productos casi nula; "
                f"fallback a {len(buyers)} clientes que compraron sus categorías"
            )
        else:
            note = (
                f"{len(buyers)} clientes compraron los {len(products)} productos "
                f"juntos (misma factura)"
            )
    else:
        if categories:
            note = (
                f"{len(buyers)} clientes compraron productos de "
                f"{len(categories)} categorías relacionadas con la campaña"
            )
        else:
            note = f"{len(buyers)} clientes compraron los productos seleccionados"

    return {
        "model_name": model_name,
        "mode": mode,
        "best_segment": best["segment"],
        "ranking": ranking,
        "buyers": len(buyers),
        "categories": categories,
        "bundle_fallback": bundle_fallback,
        "affinity_note": note,
        # Tamaño real del segmento ganador (sin el tope de `limit`).
        "segment_total": best["total"],
        "total": len(seg_ids),
        "ids": seg_ids,
        "recipients": recipients,
    }
