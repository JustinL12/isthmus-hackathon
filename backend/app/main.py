import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # before importing app modules, which read env vars

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from . import store  # noqa: E402
from .routers import ai, catalog, plans, reference, suggest  # noqa: E402
from .services import claude, databricks, email  # noqa: E402

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


async def _migrate_databricks():
    try:
        await asyncio.to_thread(databricks.ensure_tables)
    except Exception:
        log.exception("Databricks column check failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Add any new Databricks columns in the background: the warehouse may take a minute to wake.
    task = asyncio.create_task(_migrate_databricks()) if databricks.is_configured() else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Isthmus Care API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (reference.router, catalog.router, plans.router, suggest.router, ai.router):
    app.include_router(r, prefix="/api")


@app.get("/health")
def health(warm: bool = False):
    """What's configured. `?warm=true` also queries Databricks, waking the SQL
    warehouse; run it a few minutes before the demo."""
    return {
        "ok": True,
        "database": store.backend_name(),
        "database_up": store.ping(),
        "databricks": databricks.is_configured(),
        "databricks_up": databricks.ping() if warm and databricks.is_configured() else None,
        "claude": claude.is_configured(),
        "email": email.is_configured(),
    }
