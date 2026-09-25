import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_PATH = os.getenv("DATABASE_PATH", "./route53.db")

_db_dir = os.path.dirname(os.path.abspath(DATABASE_PATH))
os.makedirs(_db_dir, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_conn, _record) -> None:  # type: ignore[no-untyped-def]
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
