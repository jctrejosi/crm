from __future__ import annotations

import pandas as pd

from app.services.feature_engineering import (
    FeatureEngineering
)
from app.services.time_series_supervised import (
    TimeSeriesSupervised
)
from app.services.dataset_builder import (
    DatasetBuilder
)
from app.services.xgboost_wrapper import (
    XGBoostWrapper
)
from app.services.model_store import (
    ModelStore
)


class Predictor:

    @staticmethod
    def _load_model(
        model_name: str
    ) -> tuple[XGBoostWrapper, dict]:

        if not ModelStore.model_exists(
            model_name
        ):
            raise FileNotFoundError(
                f"No existe el modelo '{model_name}'"
            )

        metadata = (
            ModelStore.load_metadata(
                model_name
            )
        )

        model = XGBoostWrapper()

        model.load(
            str(
                ModelStore.get_model_path(
                    model_name
                )
            )
        )

        return model, metadata

    @staticmethod
    def _prepare_dataframe(
        df: pd.DataFrame
    ) -> pd.DataFrame:

        result = df.copy()

        if "date" not in result.columns:
            raise ValueError(
                "La columna 'date' es obligatoria"
            )

        if not pd.api.types.is_datetime64_any_dtype(
            result["date"]
        ):
            result["date"] = pd.to_datetime(
                result["date"],
                errors="raise"
            )

        result = result.sort_values(
            by="date"
        ).reset_index(
            drop=True
        )

        result = (
            FeatureEngineering
            .add_datetime_features(
                result
            )
        )

        return result

    @staticmethod
    def predict_next(
        model_name: str,
        df: pd.DataFrame
    ) -> float:

        model, metadata = (
            Predictor._load_model(
                model_name
            )
        )

        target_column = (
            metadata["target_column"]
        )

        feature_columns = (
            metadata["feature_columns"]
        )

        lags = metadata["lags"]

        df = Predictor._prepare_dataframe(
            df
        )

        df = (
            TimeSeriesSupervised
            .create_dataset(
                df=df,
                target_column=target_column,
                lags=lags
            )
        )

        if df.empty:
            raise ValueError(
                "No hay suficientes datos para predecir"
            )

        X, _ = (
            DatasetBuilder
            .split_features_target(
                df=df,
                target_column=target_column
            )
        )

        X = X.reindex(
            columns=feature_columns,
            fill_value=0
        )

        prediction = model.predict(
            X.tail(1)
        )[0]

        return float(
            prediction
        )

    @staticmethod
    def predict_future(
        model_name: str,
        df: pd.DataFrame,
        points: int = 1
    ) -> list[dict]:

        if points < 1:
            raise ValueError(
                "points debe ser mayor que 0"
            )

        model, metadata = (
            Predictor._load_model(
                model_name
            )
        )

        target_column = (
            metadata["target_column"]
        )

        feature_columns = (
            metadata["feature_columns"]
        )

        lags = metadata["lags"]

        history = (
            Predictor
            ._prepare_dataframe(df)
            .copy()
        )

        forecast: list[dict] = []

        for step in range(
            1,
            points + 1
        ):

            supervised_df = (
                TimeSeriesSupervised
                .create_dataset(
                    df=history,
                    target_column=target_column,
                    lags=lags
                )
            )

            if supervised_df.empty:
                raise ValueError(
                    "No hay suficientes datos históricos para generar predicción"
                )

            X, _ = (
                DatasetBuilder
                .split_features_target(
                    df=supervised_df,
                    target_column=target_column
                )
            )

            X = X.reindex(
                columns=feature_columns,
                fill_value=0
            )

            next_prediction = float(
                model.predict(
                    X.tail(1)
                )[0]
            )

            last_date = (
                history["date"]
                .iloc[-1]
            )

            if len(history) >= 2:

                frequency = (
                    history["date"]
                    .iloc[-1]
                    -
                    history["date"]
                    .iloc[-2]
                )

            else:

                frequency = (
                    pd.Timedelta(
                        hours=1
                    )
                )

            next_date = (
                last_date
                + frequency
            )

            forecast.append(
                {
                    "step": step,
                    "date": (
                        next_date
                        .isoformat()
                    ),
                    "value": (
                        next_prediction
                    )
                }
            )

            new_row = (
                history
                .iloc[-1]
                .copy()
            )

            new_row["date"] = (
                next_date
            )

            new_row[
                target_column
            ] = (
                next_prediction
            )

            history = pd.concat(
                [
                    history,
                    pd.DataFrame(
                        [new_row]
                    )
                ],
                ignore_index=True
            )

        return forecast