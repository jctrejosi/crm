import pandas as pd


class DatasetBuilder:

    @staticmethod
    def split_features_target(
        df: pd.DataFrame,
        target_column: str
    ) -> tuple[pd.DataFrame, pd.Series]:

        if target_column not in df.columns:
            raise ValueError(
                f"La columna objetivo '{target_column}' no existe"
            )

        X = df.drop(
            columns=[target_column]
        ).copy()

        y = df[
            target_column
        ].copy()

        if "date" in X.columns:
            X = X.drop(
                columns=["date"]
            )

        return X, y

    @staticmethod
    def train_test_split_time_series(
        X: pd.DataFrame,
        y: pd.Series,
        test_size: float = 0.2
    ) -> tuple[
        pd.DataFrame,
        pd.DataFrame,
        pd.Series,
        pd.Series
    ]:

        if not 0 < test_size < 1:
            raise ValueError(
                "test_size debe estar entre 0 y 1"
            )

        split_index = int(
            len(X) * (1 - test_size)
        )

        X_train = X.iloc[:split_index]
        X_test = X.iloc[split_index:]

        y_train = y.iloc[:split_index]
        y_test = y.iloc[split_index:]

        return (
            X_train,
            X_test,
            y_train,
            y_test
        )