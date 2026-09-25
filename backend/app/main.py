from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .database import Base, SessionLocal, engine
from .errors import register_error_handlers
from .routers import auth, records, zones
from .seed import seed


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="Route 53 Clone API", lifespan=lifespan)
register_error_handlers(app)

app.include_router(auth.router)
app.include_router(zones.router)
app.include_router(records.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
