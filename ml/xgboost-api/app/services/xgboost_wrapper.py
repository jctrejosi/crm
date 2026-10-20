from pathlib import Path

import pandas as pd
import xgboost as xgb


class XGBoostWrapper:

    def __init__(
        self,
        n_estimators: int = 300,
        max_depth: int = 6,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        random_state: int = 42
    ):

        self.model = xgb.XGBRegressor(
            objective="reg:squarederror",
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            random_state=random_state,
            n_jobs=-1
        )

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series
    ) -> None:

        self.model.fit(
            X_train,
            y_train
        )

    def predict(
        self,
        X: pd.DataFrame
    ):

        return self.model.predict(X)

    def save(
        self,
        model_path: str
    ) -> None:

        path = Path(model_path)

        path.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        self.model.save_model(
            str(path)
        )

    def load(
        self,
        model_path: str
    ) -> None:

        self.model.load_model(
            model_path
        )

    def get_feature_importance(
        self
    ) -> dict:

        booster = self.model.get_booster()

        return booster.get_score(
            importance_type="gain"
        )