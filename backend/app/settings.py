from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    _ENV_FILE = str(Path(__file__).resolve().parent.parent / ".env")

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "ToeicVoca"
    base_path: str = "/voca"

    db_host: str = Field(default="127.0.0.1", validation_alias="DB_HOST")
    db_port: int = Field(default=5432, validation_alias="DB_PORT")
    db_user: str = Field(default="hackersvoca_app", validation_alias="DB_USER")
    db_password: str = Field(default="CHANGE_ME", validation_alias="DB_PASSWORD")
    db_name: str = Field(default="HackersVoca", validation_alias="DB_NAME")

    cors_allow_origins: str = "*"

    @property
    def database_url(self) -> str:
        return (
            "postgresql+psycopg://"
            f"{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()
