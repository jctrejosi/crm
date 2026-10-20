import pandas as pd

MIN_PER_GROUP = 50


def validate_campaign_data(
    df: pd.DataFrame,
    treatment_column: str,
    outcome_column: str,
    feature_columns: list[str],
) -> tuple[pd.Series, list]:
    """Valida el dataset de campaña y devuelve (tratamiento codificado 0/1, clases)."""

    if df.empty:
        raise ValueError("El dataset está vacío")

    for column in (treatment_column, outcome_column):
        if column not in df.columns:
            raise ValueError(f"La columna '{column}' no existe")

    for column in feature_columns:
        if column not in df.columns:
            raise ValueError(f"La columna de feature '{column}' no existe")

    treatment = df[treatment_column]

    if treatment.nunique() != 2:
        raise ValueError("El tratamiento debe ser binario (2 valores distintos)")

    classes = sorted(
        {str(value) for value in treatment.unique()}
    )
    mapping = {
        clase: indice
        for indice, clase in enumerate(classes)
    }
    treatment_encoded = (
        treatment.astype(str)
        .map(mapping)
        .astype(int)
    )

    n_treated = int(treatment_encoded.sum())
    n_control = int((1 - treatment_encoded).sum())

    if n_treated < MIN_PER_GROUP or n_control < MIN_PER_GROUP:
        raise ValueError(
            f"Grupos muy desbalanceados: tratados={n_treated}, control={n_control} "
            f"(mínimo {MIN_PER_GROUP} por grupo)"
        )

    outcome = df[outcome_column]

    if outcome.nunique() < 2:
        raise ValueError("El resultado no tiene variabilidad (una sola clase)")

    return treatment_encoded, classes


def encode_categoricals(
    X: pd.DataFrame,
    categorical_columns: list[str],
) -> dict:
    """Codificación ordinal de categóricas; desconocidas en predict → -1.

    Devuelve {columna: [categorías]} para reutilizar al predecir.
    """

    maps = {}

    for column in categorical_columns:

        if column not in X.columns:
            continue

        categories = sorted(
            {str(value) for value in X[column].unique()}
        )

        mapping = {
            categoria: indice
            for indice, categoria in enumerate(categories)
        }

        X[column] = (
            X[column]
            .astype(str)
            .map(mapping)
            .fillna(-1)
            .astype(int)
        )

        maps[column] = categories

    return maps


def apply_categorical_maps(
    X: pd.DataFrame,
    maps: dict,
) -> None:
    """Aplica las codificaciones guardadas al predecir (desconocidas → -1)."""

    for column, categories in maps.items():

        if column not in X.columns:
            continue

        mapping = {
            categoria: indice
            for indice, categoria in enumerate(categories)
        }

        X[column] = (
            X[column]
            .astype(str)
            .map(mapping)
            .fillna(-1)
            .astype(int)
        )
