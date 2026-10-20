from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Valores por defecto: la API arranca sin variables de entorno.
    # En producción se sobrescriben con variables de entorno o un .env.
    APP_NAME: str = "XGBoost API"
    APP_VERSION: str = "1.0.0"

    ADMIN_KEY: str = "change-me"

    MODELS_DIR: str = "saved_models"

    class Config:
        env_file = ".env"


settings = Settings()