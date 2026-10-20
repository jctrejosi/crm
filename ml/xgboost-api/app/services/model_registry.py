from pathlib import Path

from app.services.model_store import (
    ModelStore
)


class ModelRegistry:

    @staticmethod
    def list_models() -> list[dict]:

        models = []

        for model_name in ModelStore.list_models():

            try:

                metadata = (
                    ModelStore.load_metadata(
                        model_name
                    )
                )

                metadata["model_name"] = (
                    model_name
                )

                models.append(
                    metadata
                )

            except FileNotFoundError:
                continue

        return sorted(
            models,
            key=lambda model: (
                model.get("trained_at")
                or model.get("created_at")
                or ""
            ),
            reverse=True
        )

    @staticmethod
    def get_model(
        model_name: str
    ) -> dict:

        metadata = (
            ModelStore.load_metadata(
                model_name
            )
        )

        metadata["model_name"] = (
            model_name
        )

        return metadata

    @staticmethod
    def model_exists(
        model_name: str
    ) -> bool:

        return (
            ModelStore.model_exists(
                model_name
            )
        )

    @staticmethod
    def validate_model(
        model_name: str
    ) -> bool:

        return (
            ModelStore.model_exists(
                model_name
            )
            and
            ModelStore.metadata_exists(
                model_name
            )
        )

    @staticmethod
    def delete_model(
        model_name: str
    ) -> bool:

        return (
            ModelStore.delete_model(
                model_name
            )
        )

    @staticmethod
    def get_model_summary(
        model_name: str
    ) -> dict:

        metadata = (
            ModelRegistry.get_model(
                model_name
            )
        )

        return {
            "model_name":
                metadata["model_name"],

            "target_column":
                metadata.get("target_column"),

            "records":
                metadata.get("records"),

            "features":
                metadata.get("features"),

            "lags":
                metadata.get("lags"),

            "r2":
                metadata.get("r2")
        }