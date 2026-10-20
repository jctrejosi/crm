import json
import shutil

from pathlib import Path

import joblib

from app.core.config import settings


class ModelStore:

    BASE_PATH = Path(settings.MODELS_DIR)

    @classmethod
    def get_model_directory(cls, model_name: str) -> Path:
        return cls.BASE_PATH / model_name

    @classmethod
    def get_model_path(cls, model_name: str) -> Path:
        return cls.get_model_directory(model_name) / "model.joblib"

    @classmethod
    def get_centroids_path(cls, model_name: str) -> Path:
        return cls.get_model_directory(model_name) / "centroids.json"

    @classmethod
    def get_metadata_path(cls, model_name: str) -> Path:
        return cls.get_model_directory(model_name) / "metadata.json"

    @classmethod
    def create_model_directory(cls, model_name: str) -> Path:
        model_dir = cls.get_model_directory(model_name)
        model_dir.mkdir(parents=True, exist_ok=True)
        return model_dir

    @classmethod
    def save_model(cls, model_name: str, pipeline: dict) -> None:
        joblib.dump(pipeline, cls.get_model_path(model_name))

    @classmethod
    def load_model(cls, model_name: str) -> dict:
        path = cls.get_model_path(model_name)
        if not path.exists():
            raise FileNotFoundError(f"No existe el modelo '{model_name}'")
        return joblib.load(path)

    @classmethod
    def save_centroids(cls, model_name: str, centroids: list) -> None:
        with open(cls.get_centroids_path(model_name), "w", encoding="utf-8") as f:
            json.dump(centroids, f, indent=4, ensure_ascii=False)

    @classmethod
    def save_metadata(cls, model_name: str, metadata: dict) -> None:
        with open(cls.get_metadata_path(model_name), "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4, ensure_ascii=False)

    @classmethod
    def load_metadata(cls, model_name: str) -> dict:
        path = cls.get_metadata_path(model_name)
        if not path.exists():
            raise FileNotFoundError(f"No existe metadata para '{model_name}'")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    @classmethod
    def model_exists(cls, model_name: str) -> bool:
        return cls.get_model_path(model_name).exists()

    @classmethod
    def delete_model(cls, model_name: str) -> bool:
        model_dir = cls.get_model_directory(model_name)
        if not model_dir.exists():
            return False
        shutil.rmtree(model_dir)
        return True

    @classmethod
    def list_models(cls) -> list:
        if not cls.BASE_PATH.exists():
            return []
        return sorted(
            directory.name
            for directory in cls.BASE_PATH.iterdir()
            if directory.is_dir()
        )
