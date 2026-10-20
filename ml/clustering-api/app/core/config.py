from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Valores por defecto: la API arranca sin variables de entorno.
    # En producción se sobrescriben con variables de entorno o un .env.
    APP_NAME: str = "Clustering API"
    APP_VERSION: str = "1.0.0"

    ADMIN_KEY: str = "change-me"

    MODELS_DIR: str = "saved_models"

    # Conexión a la réplica Postgres de analytics (p. ej. la vista
    # analytics.vw_rfm_clientes). Si no se define, los endpoints
    # /fit-from-db y /assign-from-db devuelven 503.
    DATABASE_URL: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()
