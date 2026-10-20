from datetime import datetime
from time import time

import numpy as np
import pandas as pd

from econml.dr import DRLearner
from econml.grf import CausalForest
from econml.metalearners import SLearner, TLearner, XLearner

from sklearn.model_selection import train_test_split

from xgboost import XGBClassifier, XGBRegressor

from app.ml.qini import auuc, gain_at_k, qini_curve
from app.schemas.train import UpliftTrainRequest
from app.services.model_store import ModelStore
from app.services.validation import (
    apply_categorical_maps,
    encode_categoricals,
    validate_campaign_data,
)


class UpliftTrainer:

    @staticmethod
    def train(request: UpliftTrainRequest) -> dict:

        start_time = time()

        df = pd.DataFrame(request.data)

        feature_columns = (
            request.feature_columns
            if request.feature_columns
            else [
                column
                for column in df.columns
                if column not in (
                    request.treatment_column,
                    request.outcome_column,
                )
            ]
        )

        treatment, treatment_classes = validate_campaign_data(
            df,
            request.treatment_column,
            request.outcome_column,
            feature_columns,
        )

        X = df[feature_columns].copy()
        Y = df[request.outcome_column].astype(float)
        T = treatment

        categorical_maps = encode_categoricals(
            X,
            request.categorical_columns,
        )

        # División estratificada por tratamiento
        (
            X_train, X_test,
            T_train, T_test,
            Y_train, Y_test,
        ) = train_test_split(
            X, T, Y,
            test_size=request.test_size,
            random_state=request.random_state,
            stratify=T,
        )

        outcome_is_binary = (
            Y.nunique() == 2
            and set(Y.unique()) <= {0.0, 1.0}
        )

        # Modelos base (robustos por defecto: XGBoost)
        def _regressor(**overrides):
            params = dict(
                n_estimators=request.n_estimators,
                max_depth=request.max_depth,
                learning_rate=request.learning_rate,
                random_state=request.random_state,
                n_jobs=-1,
                verbosity=0,
            )
            params.update(overrides)
            return XGBRegressor(**params)

        def _classifier(**overrides):
            params = dict(
                n_estimators=request.n_estimators,
                max_depth=request.max_depth,
                learning_rate=request.learning_rate,
                random_state=request.random_state,
                n_jobs=-1,
                verbosity=0,
                eval_metric="logloss",
            )
            params.update(overrides)
            return XGBClassifier(**params)

        model_y = (
            _classifier(objective="binary:logistic")
            if outcome_is_binary
            else _regressor()
        )
        model_t = _classifier(objective="binary:logistic")
        model_final = _regressor()

        # Método de uplift
        if request.method == "dr_learner":
            model = DRLearner(
                model_propensity=model_t,
                model_regression=model_y,
                model_final=model_final,
                cv=request.cv,
                mc_iters=1,
                random_state=request.random_state,
                discrete_outcome=outcome_is_binary,
            )
        elif request.method == "x_learner":
            model = XLearner(
                models=model_y,
                cate_models=_regressor(),
                propensity_model=model_t,
            )
        elif request.method == "t_learner":
            model = TLearner(
                models=[
                    model_y,
                    _classifier(objective="binary:logistic")
                    if outcome_is_binary
                    else _regressor(),
                ]
            )
        elif request.method == "causal_forest":
            model = CausalForest(
                n_estimators=request.n_estimators,
                max_depth=request.max_depth,
                min_samples_leaf=20,
                random_state=request.random_state,
                n_jobs=-1,
            )

        # La firma de fit difiere entre métodos en econml 0.17:
        #   meta-learners: fit(Y, T, X=X) · causal_forest: fit(X, T, y)
        if request.method == "causal_forest":
            model.fit(
                X_train,
                T_train,
                Y_train,
            )
        else:
            model.fit(
                Y_train,
                T_train,
                X=X_train,
            )

        # Evaluación sobre el holdout (test)
        effect_test = UpliftTrainer._effect(
            model,
            X_test,
            request.method,
        )

        ate = float(
            effect_test.mean()
            if request.method == "causal_forest"
            else np.asarray(model.ate(X_test)).reshape(-1)[0]
        )

        y_test_arr = Y_test.to_numpy(dtype=float)
        t_test_arr = T_test.to_numpy(dtype=int)

        metrics = {
            "ate": round(ate, 6),
            "auuc": round(auuc(y_test_arr, t_test_arr, effect_test), 6),
            "gain_top_20": round(
                gain_at_k(y_test_arr, t_test_arr, effect_test, 0.2),
                6,
            ),
            "cate_min": round(float(effect_test.min()), 6),
            "cate_p25": round(float(np.quantile(effect_test, 0.25)), 6),
            "cate_median": round(float(np.median(effect_test)), 6),
            "cate_p75": round(float(np.quantile(effect_test, 0.75)), 6),
            "cate_max": round(float(effect_test.max()), 6),
            "test_size": int(len(Y_test)),
        }

        importance = UpliftTrainer._feature_importance(
            model,
            X_train,
            feature_columns,
            request.method,
            request.random_state,
        )

        # Persistencia
        ModelStore.create_model_directory(request.model_name)
        ModelStore.save_model(request.model_name, model)

        metadata = {
            "model_name": request.model_name,
            "method": request.method,
            "treatment_column": request.treatment_column,
            "treatment_classes": treatment_classes,
            "outcome_column": request.outcome_column,
            "outcome_is_binary": outcome_is_binary,
            "feature_columns": feature_columns,
            "categorical_columns": categorical_maps,
            "created_at": datetime.utcnow().isoformat(),
            "records": len(df),
            "features": len(feature_columns),
            "cv": request.cv,
            "test_size": request.test_size,
            "metrics": metrics,
            "feature_importance": importance,
            "training_time_seconds": round(time() - start_time, 2),
        }

        ModelStore.save_metadata(request.model_name, metadata)

        return {
            "status": "success",
            "model_name": request.model_name,
            "method": request.method,
            "records": len(df),
            "metrics": metrics,
            "feature_importance": importance,
            "training_time_seconds": metadata["training_time_seconds"],
        }

    @staticmethod
    def _effect(model, X, method: str) -> np.ndarray:
        """CATE estimado por fila. econml 0.17: causal_forest usa predict()."""
        if method == "causal_forest":
            return np.asarray(model.predict(X)).reshape(-1)
        return np.asarray(model.effect(X)).reshape(-1)

    @staticmethod
    def _feature_importance(
        model,
        X_train: pd.DataFrame,
        feature_columns: list[str],
        method: str,
        seed: int,
    ) -> dict:

        # CausalForest trae importancia nativa
        try:
            importance = model.feature_importances_
            if hasattr(importance, "__len__") and len(importance) == len(feature_columns):
                return {
                    feature: float(value)
                    for feature, value in zip(feature_columns, importance)
                }
        except (AttributeError, TypeError):
            pass

        # DRLearner expone feature_importance(X)
        try:
            importance = model.feature_importance(X_train.head(2000))
            if isinstance(importance, dict):
                return {
                    key: float(value)
                    for key, value in importance.items()
                }
        except (AttributeError, TypeError):
            pass

        # Genérico robusto: importancia por permutación sobre el CATE estimado
        return UpliftTrainer._permutation_importance(
            model,
            X_train,
            feature_columns,
            method,
            seed,
        )

    @staticmethod
    def _permutation_importance(
        model,
        X_train: pd.DataFrame,
        feature_columns: list[str],
        method: str,
        seed: int,
    ) -> dict:

        sample = (
            X_train.sample(n=min(2000, len(X_train)), random_state=seed)
            if len(X_train) > 2000
            else X_train
        )

        base_effect = UpliftTrainer._effect(
            model,
            sample,
            method,
        )

        rng = np.random.default_rng(seed)
        importance = {}

        for column in feature_columns:

            diffs = []

            for _ in range(5):

                perturbed = sample.copy()
                perturbed[column] = rng.permutation(
                    perturbed[column].to_numpy()
                )

                perm_effect = UpliftTrainer._effect(
                    model,
                    perturbed,
                    method,
                )

                diffs.append(
                    float(np.mean(np.abs(perm_effect - base_effect)))
                )

            importance[column] = float(np.mean(diffs))

        return importance
