from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Uplift API"
    APP_VERSION: str = "1.0.0"

    ADMIN_KEY: str = "change-me"

    MODELS_DIR: str = "saved_models"

    class Config:
        env_file = ".env"


settings = Settings()
