"""Clientes RFM con su segmento, features y contacto.

Sirve a la UI de campañas para: (1) listar TODOS los clientes con su
probabilidad de compra (analítica) y (2) segmentar manualmente por
filtros sobre los atributos de la réplica. El scoring (propensión /
uplift) lo orquesta el backend del ecommerce con xgboost/uplift.
"""

from datetime import date
import threading
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import verify_admin_key
from app.services.assigner import Assigner
from app.services.db import DatabaseError, execute_read, read_features
from app.services.model_store import ModelStore
from app.services.segmenter import RFM_ID_COLUMN, RFM_QUERY, _client_contacts

router = APIRouter()

# Features numéricas del modelo RFM (mismas que consume xgboost/uplift).
FEATURES = ("frecuencia", "monetario", "ticket_promedio", "categorias_distintas")

MAX_LIMIT = 100000

# Clubs disponibles en pos.clientes (mapeo etiqueta → columna booleana).
CLUBS = {
    "vino": "club_vino",
    "parrilla": "club_parrilla",
    "salud": "club_salud",
    "mascotas": "club_mascotas",
    "amas_de_casa": "club_amas_de_casa",
}

# Canales de consentimiento.
CONSENT_CHANNELS = ("email", "whatsapp", "sms")

# Columnas extra de pos.clientes que alimentan los filtros manuales.
PROFILE_COLS = (
    "cedula", "ciudad", "barrio", "direccion", "fecha_nacimiento", "sexo",
    "estado_civil", "hijos", "profesion", "sucursal", "valor_total", "puntos",
    "tiene_mascota", "tiene_carro", "es_empleado",
    "club_vino", "club_parrilla", "club_salud", "club_mascotas",
    "club_amas_de_casa",
    "consentimiento_email", "consentimiento_whatsapp", "consentimiento_sms",
)


class ClientsFilters(BaseModel):
    segment: Optional[int] = Field(None, description="Solo clientes de este segmento")
    min_frecuencia: Optional[float] = None
    max_frecuencia: Optional[float] = None
    min_monetario: Optional[float] = None
    max_monetario: Optional[float] = None
    min_ticket_promedio: Optional[float] = None
    max_ticket_promedio: Optional[float] = None
    min_categorias_distintas: Optional[float] = None
    max_categorias_distintas: Optional[float] = None
    cedulas: Optional[list[str]] = Field(
        None, description="Solo estos clientes (cédula/NIT)"
    )

    # ── Ubicación ──
    ciudades: Optional[list[str]] = Field(None, description="Ciudades (match exacto)")
    barrios: Optional[list[str]] = Field(None, description="Barrios (match exacto)")
    direccion_contiene: Optional[str] = Field(
        None, description="Texto contenido en la dirección (sin tildes)"
    )

    # ── Demografía ──
    min_edad: Optional[int] = Field(None, ge=0, le=120)
    max_edad: Optional[int] = Field(None, ge=0, le=120)
    sexos: Optional[list[str]] = Field(None, description="M | F | I")
    estados_civiles: Optional[list[str]] = None
    min_hijos: Optional[int] = Field(None, ge=0)
    max_hijos: Optional[int] = Field(None, ge=0)
    profesiones: Optional[list[str]] = None

    # ── Económico (proxy de ingresos: gasto histórico y puntos) ──
    min_valor_total: Optional[float] = Field(None, ge=0)
    max_valor_total: Optional[float] = Field(None, ge=0)
    min_puntos: Optional[float] = Field(None, ge=0)
    max_puntos: Optional[float] = Field(None, ge=0)

    # ── Estilo de vida ──
    tiene_mascota: Optional[bool] = None
    tiene_carro: Optional[bool] = None
    es_empleado: Optional[bool] = None
    clubs: Optional[list[str]] = Field(
        None, description="Alguno de: vino, parrilla, salud, mascotas, amas_de_casa"
    )

    # ── Contacto legal ──
    consentimientos: Optional[list[str]] = Field(
        None, description="Solo clientes con consentimiento en alguno: email, whatsapp, sms"
    )
    sucursales: Optional[list[str]] = None


class SegmentClientsRequest(BaseModel):
    model_name: str = "seg_rfm_v1"
    filters: ClientsFilters = Field(default_factory=ClientsFilters)
    offset: int = Field(0, ge=0)
    limit: int = Field(100, ge=1, le=MAX_LIMIT)
    with_contacts: bool = True


# ── Caché del perfil completo de pos.clientes (para filtros manuales) ──
# La carga completa (~184K filas) tarda varios segundos; se cachea con TTL
# porque la réplica cambia lento. Solo se usa cuando hay filtros de perfil.
_PROFILE_CACHE_TTL = 30 * 60  # segundos
_profile_cache: dict = {}
_profile_lock = threading.Lock()


def _client_profiles() -> dict[str, dict]:
    """Atributos de filtrado de pos.clientes, indexados por cédula."""
    now = time.monotonic()
    with _profile_lock:
        hit = _profile_cache.get("profiles")
        if hit is not None and now - hit[0] < _PROFILE_CACHE_TTL:
            return hit[1]

    cols = ", ".join(PROFILE_COLS)
    rows = execute_read(f"SELECT {cols} FROM pos.clientes")
    profiles: dict[str, dict] = {}
    idx = {c: i for i, c in enumerate(PROFILE_COLS)}

    def g(row: tuple, col: str):
        return row[idx[col]]

    today = date.today()
    for row in rows:
        cedula = (g(row, "cedula") or "").strip()
        if not cedula:
            continue
        dob = g(row, "fecha_nacimiento")
        edad = None
        if dob:
            try:
                edad = today.year - dob.year - (
                    (today.month, today.day) < (dob.month, dob.day)
                )
            except (TypeError, ValueError):
                edad = None
        profiles[cedula] = {
            "ciudad": (g(row, "ciudad") or "").strip().upper(),
            "barrio": (g(row, "barrio") or "").strip().upper(),
            "direccion": (g(row, "direccion") or "").strip().upper(),
            "edad": edad,
            "sexo": (g(row, "sexo") or "").strip().upper(),
            "estado_civil": (g(row, "estado_civil") or "").strip().upper(),
            "hijos": g(row, "hijos") or 0,
            "profesion": (g(row, "profesion") or "").strip().upper(),
            "sucursal": (g(row, "sucursal") or "").strip().upper(),
            "valor_total": g(row, "valor_total") or 0.0,
            "puntos": g(row, "puntos") or 0.0,
            "tiene_mascota": bool(g(row, "tiene_mascota")),
            "tiene_carro": bool(g(row, "tiene_carro")),
            "es_empleado": bool(g(row, "es_empleado")),
            "clubs": [name for name, col in CLUBS.items() if g(row, col)],
            "consentimientos": [
                ch for ch, col in (
                    ("email", "consentimiento_email"),
                    ("whatsapp", "consentimiento_whatsapp"),
                    ("sms", "consentimiento_sms"),
                ) if g(row, col)
            ],
        }
    with _profile_lock:
        _profile_cache["profiles"] = (time.monotonic(), profiles)
    return profiles


def _needs_profiles(f: ClientsFilters) -> bool:
    """True si hay algún filtro que requiera los atributos de pos.clientes."""
    return any((
        f.ciudades, f.barrios, f.direccion_contiene,
        f.min_edad is not None, f.max_edad is not None,
        f.sexos, f.estados_civiles,
        f.min_hijos is not None, f.max_hijos is not None,
        f.profesiones,
        f.min_valor_total is not None, f.max_valor_total is not None,
        f.min_puntos is not None, f.max_puntos is not None,
        f.tiene_mascota is not None, f.tiene_carro is not None,
        f.es_empleado is not None,
        f.clubs, f.consentimientos, f.sucursales,
    ))


def _clean_list(v: list[str] | None) -> set[str]:
    if not v:
        return set()
    return {(s or "").strip().upper() for s in v if s and s.strip()}


def _matches_profile(f: ClientsFilters, p: dict | None) -> bool:
    """Aplica los filtros de perfil a un cliente (p = atributos o None)."""
    if p is None:
        # Sin perfil en pos.clientes: solo pasa si no hay filtros excluyentes.
        return not _needs_profiles(f)

    ciudades = _clean_list(f.ciudades)
    if ciudades and p["ciudad"] not in ciudades:
        return False
    barrios = _clean_list(f.barrios)
    if barrios and p["barrio"] not in barrios:
        return False
    if f.direccion_contiene:
        needle = f.direccion_contiene.strip().upper()
        if needle and needle not in p["direccion"]:
            return False
    if f.min_edad is not None and (p["edad"] is None or p["edad"] < f.min_edad):
        return False
    if f.max_edad is not None and (p["edad"] is None or p["edad"] > f.max_edad):
        return False
    sexos = _clean_list(f.sexos)
    if sexos and p["sexo"] not in sexos:
        return False
    estados = _clean_list(f.estados_civiles)
    if estados and p["estado_civil"] not in estados:
        return False
    if f.min_hijos is not None and p["hijos"] < f.min_hijos:
        return False
    if f.max_hijos is not None and p["hijos"] > f.max_hijos:
        return False
    profesiones = _clean_list(f.profesiones)
    if profesiones and p["profesion"] not in profesiones:
        return False
    if f.min_valor_total is not None and p["valor_total"] < f.min_valor_total:
        return False
    if f.max_valor_total is not None and p["valor_total"] > f.max_valor_total:
        return False
    if f.min_puntos is not None and p["puntos"] < f.min_puntos:
        return False
    if f.max_puntos is not None and p["puntos"] > f.max_puntos:
        return False
    if f.tiene_mascota is not None and p["tiene_mascota"] != f.tiene_mascota:
        return False
    if f.tiene_carro is not None and p["tiene_carro"] != f.tiene_carro:
        return False
    if f.es_empleado is not None and p["es_empleado"] != f.es_empleado:
        return False
    if f.clubs:
        wanted = {c for c in (f.clubs or []) if c in CLUBS}
        if wanted and not (wanted & set(p["clubs"])):
            return False
    if f.consentimientos:
        wanted = {c for c in (f.consentimientos or []) if c in CONSENT_CHANNELS}
        if wanted and not (wanted & set(p["consentimientos"])):
            return False
    sucursales = _clean_list(f.sucursales)
    if sucursales and p["sucursal"] not in sucursales:
        return False
    return True


@router.post(
    "/segment-clients",
    dependencies=[Depends(verify_admin_key)],
)
def segment_clients(request: SegmentClientsRequest):
    """Clientes de la réplica RFM con segmento, features y contacto (filtrable)."""
    try:
        ids, feature_names, X = read_features(RFM_QUERY, RFM_ID_COLUMN)
        metadata = ModelStore.load_metadata(request.model_name)
        expected = metadata.get("feature_names")
        if expected is not None and feature_names != expected:
            raise ValueError(
                f"las features de la consulta no coinciden con el modelo: "
                f"esperaba {expected}, recibió {feature_names}"
            )
        result = Assigner.assign_matrix(request.model_name, X)
        labels = result["labels"]

        feat_names = [n for n in FEATURES if n in feature_names]
        feat_idx = {n: feature_names.index(n) for n in feat_names}

        f = request.filters
        cedulas_set = set(f.cedulas or [])

        # Atributos de pos.clientes solo si hay filtros que los necesiten.
        profiles = _client_profiles() if _needs_profiles(f) else {}

        matched: list[dict] = []
        for i, cedula in enumerate(ids):
            seg = labels[i]
            if f.segment is not None and seg != f.segment:
                continue
            if cedulas_set and cedula not in cedulas_set:
                continue
            features = {n: float(X[i][feat_idx[n]]) for n in feat_names}
            if f.min_frecuencia is not None and features.get("frecuencia", 0) < f.min_frecuencia:
                continue
            if f.max_frecuencia is not None and features.get("frecuencia", 0) > f.max_frecuencia:
                continue
            if f.min_monetario is not None and features.get("monetario", 0) < f.min_monetario:
                continue
            if f.max_monetario is not None and features.get("monetario", 0) > f.max_monetario:
                continue
            if f.min_ticket_promedio is not None and features.get("ticket_promedio", 0) < f.min_ticket_promedio:
                continue
            if f.max_ticket_promedio is not None and features.get("ticket_promedio", 0) > f.max_ticket_promedio:
                continue
            if f.min_categorias_distintas is not None and features.get("categorias_distintas", 0) < f.min_categorias_distintas:
                continue
            if f.max_categorias_distintas is not None and features.get("categorias_distintas", 0) > f.max_categorias_distintas:
                continue
            if not _matches_profile(f, profiles.get(str(cedula))):
                continue
            matched.append({"cedula": cedula, "segment": seg, "features": features})

        total = len(matched)
        page = matched[request.offset : request.offset + request.limit]

        if request.with_contacts and page:
            contacts = _client_contacts([r["cedula"] for r in page])
            for r in page:
                c = contacts.get(r["cedula"], {})
                r["name"] = c.get("name")
                r["email"] = c.get("email")
                r["phone"] = c.get("phone")
                r["consent_email"] = c.get("consent_email", False)
                r["consent_whatsapp"] = c.get("consent_whatsapp", False)
                r["consent_sms"] = c.get("consent_sms", False)

        return {
            "model_name": request.model_name,
            "total": total,
            "offset": request.offset,
            "clients": page,
        }
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except DatabaseError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )


# ── Opciones para los selects de la UI (segmentación manual) ──

_OPTIONS_CACHE_TTL = 30 * 60


def _top_values(col: str, limit: int, drop_digits: bool = True) -> list[str]:
    extra = "AND {0} !~ '^[0-9]+$' ".format(col) if drop_digits else ""
    rows = execute_read(
        f"SELECT {col}, count(*) AS n FROM pos.clientes "
        f"WHERE {col} IS NOT NULL AND btrim({col}) <> '' {extra}"
        f"GROUP BY {col} ORDER BY n DESC LIMIT {limit}"
    )
    return [str(r[0]).strip() for r in rows if r[0]]


@router.get(
    "/client-filter-options",
    dependencies=[Depends(verify_admin_key)],
)
def client_filter_options():
    """Valores distintos de la réplica para poblar los selects de filtros."""
    now = time.monotonic()
    with _profile_lock:
        hit = _profile_cache.get("options")
        if hit is not None and now - hit[0] < _OPTIONS_CACHE_TTL:
            return hit[1]
    try:
        options = {
            "ciudades": _top_values("ciudad", 40),
            "barrios": _top_values("barrio", 80),
            "profesiones": _top_values("profesion", 40),
            "estadosCiviles": _top_values("estado_civil", 20),
            "sucursales": _top_values("sucursal", 30, drop_digits=False),
            "sexos": ["F", "M"],
        }
    except DatabaseError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    with _profile_lock:
        _profile_cache["options"] = (time.monotonic(), options)
    return options
