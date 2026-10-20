import pandas as pd


def validate_dataframe(
    df: pd.DataFrame,
    target_column: str
) -> None:

    if df.empty:
        raise ValueError(
            "El dataset está vacío"
        )

    if "date" not in df.columns:
        raise ValueError(
            "La columna 'date' es obligatoria"
        )

    if target_column not in df.columns:
        raise ValueError(
            f"La columna objetivo '{target_column}' no existe"
        )

    if df[target_column].isna().all():
        raise ValueError(
            f"La columna objetivo '{target_column}' no contiene datos válidos"
        )