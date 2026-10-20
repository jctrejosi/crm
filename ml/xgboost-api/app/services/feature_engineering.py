import pandas as pd


class FeatureEngineering:

    @staticmethod
    def add_datetime_features(
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

        result["hour"] = (
            result["date"].dt.hour
        )

        result["day"] = (
            result["date"].dt.day
        )

        result["day_of_week"] = (
            result["date"].dt.dayofweek
        )

        result["month"] = (
            result["date"].dt.month
        )

        result["quarter"] = (
            result["date"].dt.quarter
        )

        result["week_of_year"] = (
            result["date"]
            .dt.isocalendar()
            .week
            .astype(int)
        )

        result["is_weekend"] = (
            result["day_of_week"] >= 5
        ).astype(int)

        return result