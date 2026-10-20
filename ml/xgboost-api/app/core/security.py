from fastapi import Header, HTTPException, status

from app.core.config import settings


def verify_admin_key(
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")
) -> None:
    if x_admin_key != settings.ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autorizado. Clave de administración incorrecta o ausente."
        )