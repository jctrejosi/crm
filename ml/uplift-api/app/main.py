from fastapi import FastAPI

from app.core.config import settings

from app.routes.health import router as health_router
from app.routes.train import router as train_router
from app.routes.predict import router as predict_router
from app.routes.models import router as models_router
from app.routes.metrics import router as metrics_router
from app.routes.admin import router as admin_router


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
)

app.include_router(health_router, tags=["Health"])
app.include_router(train_router, tags=["Uplift"])
app.include_router(predict_router, tags=["Uplift"])
app.include_router(models_router, tags=["Models"])
app.include_router(metrics_router, tags=["Metrics"])
app.include_router(admin_router, tags=["Admin"])
