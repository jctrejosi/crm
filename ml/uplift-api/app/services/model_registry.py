from app.services.model_store import ModelStore


class ModelRegistry:

    @staticmethod
    def list_models() -> list:

        models = []

        for model_name in ModelStore.list_models():

            try:
                metadata = ModelStore.load_metadata(model_name)
            except FileNotFoundError:
                continue

            models.append({
                "model_name": model_name,
                "method": metadata.get("method"),
                "treatment_column": metadata.get("treatment_column"),
                "outcome_column": metadata.get("outcome_column"),
                "records": metadata.get("records"),
                "features": metadata.get("features"),
                "created_at": metadata.get("created_at"),
                "metrics": metadata.get("metrics", {}),
            })

        return sorted(
            models,
            key=lambda model: model.get("created_at", ""),
            reverse=True,
        )
