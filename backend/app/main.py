import logging
import os

from dotenv import load_dotenv

load_dotenv()  # before importing app modules, which read env vars

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from . import store  # noqa: E402
from .routers import ai, plans, reference, suggest  # noqa: E402
from .services import claude, databricks, email  # noqa: E402

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ClearCare API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (reference.router, plans.router, suggest.router, ai.router):
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
