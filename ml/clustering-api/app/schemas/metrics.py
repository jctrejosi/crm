from typing import Dict, Optional

from pydantic import BaseModel


class MetricsResponse(BaseModel):
    model_name: str
    metrics: Dict[str, Optional[float]]
