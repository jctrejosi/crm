from datetime import datetime
from time import time

import numpy as np
import pandas as pd
import xgboost as xgb

from sklearn.metrics import (
    accuracy_score,
    log_loss,
    roc_auc_score
)
from sklearn.model_selection import (
    train_test_split
)

from app.schemas.propensity import (
    PropensityTrainRequest
)
from app.services.model_store import (
    ModelStore
)


class PropensityTrainer:

    @staticmethod
    def train(
        request: PropensityTrainRequest
    ) -> dict:

        start_time = time()

        df = pd.DataFrame(
            request.data
        )

        if df.empty:
            raise ValueError(
                "El dataset está vacío"
            )

        if request.target_column not in df.columns:
            raise ValueError(
                f"La columna objetivo '{request.target_column}' no existe"
            )

        feature_columns = (
            request.feature_columns
            if request.feature_columns
            else [
                column
                for column in df.columns
                if column != request.target_column
            ]
        )

        missing = [
            column
            for column in feature_columns
            if column not in df.columns
        ]

        if missing:
            raise ValueError(
                f"Columnas de features inexistentes: {missing}"
            )

        X = df[feature_columns].copy()
        y = df[request.target_column]

        # Codificación del target a 0..k-1 y registro de clases originales
        classes = sorted(
            {str(value) for value in y.unique()}
        )
        class_map = {
            clase: indice
            for indice, clase in enumerate(classes)
        }
        y_enc = (
            y.astype(str)
            .map(class_map)
            .astype(int)
        )

        if request.problem_type == "multiclass" and len(classes) < 2:
            raise ValueError(
                "multiclass necesita al menos 2 clases distintas"
            )

        # Categóricas (p. ej. segmento): codificación ordinal; desconocidas → -1
        categorical_maps = {}

        for column in request.categorical_columns:

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

            categorical_maps[column] = categories

        # División estratificada
        stratify = (
            y_enc
            if len(y_enc.unique()) > 1
            else None
        )

        (
            X_train,
            X_val,
            y_train,
            y_val
        ) = train_test_split(
            X,
            y_enc,
            test_size=request.test_size,
            random_state=request.random_state,
            stratify=stratify
        )

        objective = (
            "binary:logistic"
            if request.problem_type == "binary"
            else "multi:softprob"
        )

        model = xgb.XGBClassifier(
            objective=objective,
            num_class=(
                len(classes)
                if request.problem_type == "multiclass"
                else None
            ),
            n_estimators=request.n_estimators,
            max_depth=request.max_depth,
            learning_rate=request.learning_rate,
            subsample=request.subsample,
            colsample_bytree=request.colsample_bytree,
            min_child_weight=request.min_child_weight,
            random_state=request.random_state,
            n_jobs=-1,
            verbosity=0,
            eval_metric=(
                "auc"
                if request.problem_type == "binary"
                else "mlogloss"
            ),
            # xgboost >= 3.x: early_stopping_rounds va en el constructor
            early_stopping_rounds=request.early_stopping_rounds
        )

        fit_kwargs = {}

        if request.early_stopping_rounds:
            fit_kwargs = {
                "eval_set": [(X_val, y_val)]
            }

        model.fit(
            X_train,
            y_train,
            **fit_kwargs
        )

        # Métricas sobre la partición de validación
        proba = model.predict_proba(
            X_val
        )
        y_pred = model.predict(
            X_val
        )

        if (
            request.problem_type == "binary"
            or proba.shape[1] == 2
        ):
            auc = float(
                roc_auc_score(
                    y_val,
                    proba[:, 1]
                )
            )
            logloss = float(
                log_loss(
                    y_val,
                    proba[:, 1]
                )
            )
        else:
            auc = float(
                roc_auc_score(
                    y_val,
                    proba,
                    multi_class="ovr",
                    average="macro"
                )
            )
            logloss = float(
                log_loss(
                    y_val,
                    proba
                )
            )

        accuracy = float(
            accuracy_score(
                y_val,
                y_pred
            )
        )

        metrics = {
            "accuracy": accuracy,
            "auc": auc,
            "logloss": logloss
        }

        # Explicabilidad: SHAP si está disponible; si no, gain de XGBoost
        shap_importance = (
            PropensityTrainer._explain(
                model=model,
                X_val=X_val,
                feature_columns=feature_columns,
                with_shap=request.with_shap
            )
        )

        # Persistencia
        ModelStore.create_model_directory(
            request.model_name
        )

        model.save_model(
            str(
                ModelStore.get_model_path(
                    request.model_name
                )
            )
        )

        metadata = {
            "model_name": request.model_name,
            "problem_type": request.problem_type,
            "target_column": request.target_column,
            "feature_columns": feature_columns,
            "categorical_columns": categorical_maps,
            "classes": classes,
            "n_classes": len(classes),
            "created_at": datetime.utcnow().isoformat(),
            "records": len(df),
            "features": len(feature_columns),
            "test_size": request.test_size,
            "early_stopping": (
                int(model.best_iteration)
                if model.best_iteration is not None
                else None
            ),
            "metrics": metrics,
            "shap_importance": shap_importance,
            "training_time_seconds": round(
                time() - start_time,
                2
            )
        }

        ModelStore.save_metadata(
            request.model_name,
            metadata
        )

        return {
            "status": "success",
            "model_name": request.model_name,
            "problem_type": request.problem_type,
            "records": len(df),
            "features": len(feature_columns),
            "metrics": metrics,
            "shap_importance": shap_importance,
            "training_time_seconds": metadata["training_time_seconds"]
        }

    @staticmethod
    def _explain(
        model,
        X_val: pd.DataFrame,
        feature_columns: list[str],
        with_shap: bool
    ) -> dict:

        if with_shap:

            try:

                import shap

                sample = X_val.head(200)

                explainer = shap.TreeExplainer(
                    model
                )

                shap_values = (
                    explainer.shap_values(
                        sample
                    )
                )

                # shap 0.5x devuelve formatos distintos según versión y tipo:
                #   binario:  (n, f) o lista de 2 arrays (n, f)
                #   multiclass: (n, f, k) o lista de k arrays (n, f)
                # Localizamos el eje de features por su tamaño y promediamos
                # el resto (muestras y clases).
                array = np.asarray(
                    shap_values
                )

                n_features = len(
                    feature_columns
                )

                feature_axes = [
                    indice
                    for indice, size in enumerate(
                        array.shape
                    )
                    if size == n_features
                ]

                if not feature_axes:
                    feature_axes = [
                        array.ndim - 1
                    ]

                axis = feature_axes[-1]

                mean_abs = (
                    np.abs(array)
                    .mean(
                        axis=tuple(
                            indice
                            for indice in range(
                                array.ndim
                            )
                            if indice != axis
                        )
                    )
                )

                return {
                    feature: float(value)
                    for feature, value in zip(
                        feature_columns,
                        mean_abs
                    )
                }

            except ImportError:
                pass

        # Fallback: importancia por ganancia del propio XGBoost
        score = (
            model
            .get_booster()
            .get_score(
                importance_type="gain"
            )
        )

        return {
            key: float(value)
            for key, value in score.items()
        }
