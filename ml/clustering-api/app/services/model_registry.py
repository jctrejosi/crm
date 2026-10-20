from app.services.model_store import ModelStore


class ModelRegistry:

    @staticmethod
    def list_models() -> list:
        models = []
        for name in ModelStore.list_models():
            try:
                metadata = ModelStore.load_metadata(name)
            except FileNotFoundError:
                continue
            models.append({
                "model_name": name,
                "algorithm": metadata.get("algorithm"),
                "k": metadata.get("k"),
                "n_samples": metadata.get("n_samples"),
                "n_features": metadata.get("n_features"),
                "created_at": metadata.get("created_at"),
                "metrics": metadata.get("metrics", {})
            })
        return models
