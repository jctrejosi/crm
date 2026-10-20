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
            key=lambda model: model.get(
                "trained_at",
                ""
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
                metadata["target_column"],

            "records":
                metadata["records"],

            "features":
                metadata["features"],

            "lags":
                metadata["lags"],

            "r2":
                metadata["r2"]
        }