from typing import Dict, Optional

from pydantic import BaseModel


class ModelInfo(BaseModel):
    model_name: str
    algorithm: str
    k: int
    n_samples: int
    n_features: int
    created_at: str
    metrics: Dict[str, Optional[float]]
