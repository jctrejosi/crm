from datetime import datetime
from time import time

from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

from app.schemas.train import TrainRequest

from app.services.data import DataService
from app.services.feature_engineering import FeatureEngineering
from app.services.time_series_supervised import TimeSeriesSupervised
from app.services.dataset_builder import DatasetBuilder
from app.services.xgboost_wrapper import XGBoostWrapper
from app.services.model_store import ModelStore


class Trainer:

    @staticmethod
    def train(
        request: TrainRequest,
        lags: int = 24,
        test_size: float = 0.2
    ) -> dict:

        start_time = time()

        # DataFrame base
        df = DataService.to_dataframe(
            request
        )

        # Features temporales
        df = FeatureEngineering.add_datetime_features(
            df
        )

        # Dataset supervisado
        df = TimeSeriesSupervised.create_dataset(
            df=df,
            target_column=request.target_column,
            lags=lags
        )

        if df.empty:
            raise ValueError(
                "No hay suficientes registros para generar los lags solicitados"
            )

        # Features y target
        X, y = DatasetBuilder.split_features_target(
            df=df,
            target_column=request.target_column
        )

        if len(X) < 10:
            raise ValueError(
                "Cantidad insuficiente de registros para entrenar"
            )

        # División temporal
        (
            X_train,
            X_test,
            y_train,
            y_test
        ) = DatasetBuilder.train_test_split_time_series(
            X=X,
            y=y,
            test_size=test_size
        )

        # Entrenamiento
        model = XGBoostWrapper()

        model.fit(
            X_train=X_train,
            y_train=y_train
        )

        # Predicciones
        predictions = model.predict(
            X_test
        )

        # Métricas
        mae = mean_absolute_error(
            y_test,
            predictions
        )

        rmse = (
            mean_squared_error(
                y_test,
                predictions
            ) ** 0.5
        )

        r2 = r2_score(
            y_test,
            predictions
        )

        # Persistencia
        ModelStore.create_model_directory(
            request.model_name
        )

        model_path = (
            ModelStore.get_model_path(
                request.model_name
            )
        )

        model.save(
            str(model_path)
        )

        # Metadata
        metadata = {
            "model_name": request.model_name,
            "target_column": request.target_column,
            "trained_at": datetime.utcnow().isoformat(),
            "records": len(df),
            "features": len(X.columns),
            "feature_columns": X.columns.tolist(),
            "lags": lags,
            "test_size": test_size,
            "mae": float(mae),
            "rmse": float(rmse),
            "r2": float(r2)
        }

        ModelStore.save_metadata(
            request.model_name,
            metadata
        )

        training_time = (
            time() - start_time
        )

        return {
            "status": "success",
            "model_name": request.model_name,
            "model_path": str(model_path),
            "records": len(df),
            "features": len(X.columns),
            "mae": float(mae),
            "rmse": float(rmse),
            "r2": float(r2),
            "training_time_seconds": round(
                training_time,
                2
            )
        }