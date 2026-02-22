import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .settings import settings

# SQL 로그 비활성화
for _logger_name in ["sqlalchemy.engine", "sqlalchemy.engine.Engine", "sqlalchemy.pool"]:
    _logger = logging.getLogger(_logger_name)
    _logger.setLevel(logging.WARNING)
    _logger.propagate = False
    _logger.handlers.clear()
 
engine = create_engine(settings.database_url, pool_pre_ping=True, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
