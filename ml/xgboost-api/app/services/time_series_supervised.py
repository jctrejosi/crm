import pandas as pd


class TimeSeriesSupervised:

    @staticmethod
    def create_dataset(
        df: pd.DataFrame,
        target_column: str,
        lags: int = 24
    ) -> pd.DataFrame:

        if target_column not in df.columns:
            raise ValueError(
                f"La columna objetivo '{target_column}' no existe"
            )

        if lags < 1:
            raise ValueError(
                "La cantidad de lags debe ser mayor que 0"
            )

        supervised_df = df.copy()

        for lag in range(
            1,
            lags + 1
        ):
            supervised_df[
                f"{target_column}_lag_{lag}"
            ] = supervised_df[
                target_column
            ].shift(lag)

        supervised_df = (
            supervised_df
            .dropna()
            .reset_index(drop=True)
        )

        return supervised_df