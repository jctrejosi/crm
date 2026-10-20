from fastapi import FastAPI

from app.core.config import settings

from app.routes.health import router as health_router
from app.routes.fit import router as fit_router
from app.routes.assign import router as assign_router
from app.routes.models import router as models_router
from app.routes.metrics import router as metrics_router
from app.routes.admin import router as admin_router
from app.routes.segment import router as segment_router
from app.routes.clients import router as clients_router


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION
)

app.include_router(health_router, tags=["Health"])
app.include_router(fit_router, tags=["Fit"])
app.include_router(assign_router, tags=["Assign"])
app.include_router(models_router, tags=["Models"])
app.include_router(metrics_router, tags=["Metrics"])
app.include_router(admin_router, tags=["Admin"])
app.include_router(segment_router, tags=["Segment"])
app.include_router(clients_router, tags=["Clients"])
