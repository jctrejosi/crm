import json
import shutil

from pathlib import Path


class ModelStore:

    BASE_PATH = Path(
        "saved_models"
    )

    @classmethod
    def get_model_directory(
        cls,
        model_name: str
    ) -> Path:

        return (
            cls.BASE_PATH
            / model_name
        )

    @classmethod
    def get_model_path(
        cls,
        model_name: str
    ) -> Path:

        return (
            cls.get_model_directory(
                model_name
            )
            / "model.json"
        )

    @classmethod
    def get_metadata_path(
        cls,
        model_name: str
    ) -> Path:

        return (
            cls.get_model_directory(
                model_name
            )
            / "metadata.json"
        )

    @classmethod
    def create_model_directory(
        cls,
        model_name: str
    ) -> Path:

        model_dir = cls.get_model_directory(
            model_name
        )

        model_dir.mkdir(
            parents=True,
            exist_ok=True
        )

        return model_dir

    @classmethod
    def save_metadata(
        cls,
        model_name: str,
        metadata: dict
    ) -> None:

        metadata_path = cls.get_metadata_path(
            model_name
        )

        with open(
            metadata_path,
            "w",
            encoding="utf-8"
        ) as file:

            json.dump(
                metadata,
                file,
                indent=4,
                ensure_ascii=False
            )

    @classmethod
    def load_metadata(
        cls,
        model_name: str
    ) -> dict:

        metadata_path = cls.get_metadata_path(
            model_name
        )

        if not metadata_path.exists():
            raise FileNotFoundError(
                f"No existe metadata para '{model_name}'"
            )

        with open(
            metadata_path,
            "r",
            encoding="utf-8"
        ) as file:

            return json.load(
                file
            )

    @classmethod
    def model_exists(
        cls,
        model_name: str
    ) -> bool:

        return cls.get_model_path(
            model_name
        ).exists()

    @classmethod
    def metadata_exists(
        cls,
        model_name: str
    ) -> bool:

        return cls.get_metadata_path(
            model_name
        ).exists()

    @classmethod
    def delete_model(
        cls,
        model_name: str
    ) -> bool:

        model_dir = cls.get_model_directory(
            model_name
        )

        if not model_dir.exists():
            return False

        shutil.rmtree(
            model_dir
        )

        return True

    @classmethod
    def list_models(
        cls
    ) -> list[str]:

        if not cls.BASE_PATH.exists():
            return []

        return sorted(
            [
                directory.name
                for directory in cls.BASE_PATH.iterdir()
                if directory.is_dir()
            ]
        )