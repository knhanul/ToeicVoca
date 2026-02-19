import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .settings import settings

# SQL 로그 비활성화
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
 
engine = create_engine(settings.database_url, pool_pre_ping=True, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
