from fastapi import Header, HTTPException, status

from app.core.config import settings


def verify_admin_key(
    x_admin_key: str = Header(default=None)
) -> bool:

    if x_admin_key != settings.ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clave de administrador inválida"
        )

    return True
