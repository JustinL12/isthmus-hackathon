import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import ai, plans, reference

load_dotenv()

app = FastAPI(title="ClearCare API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (reference.router, plans.router, ai.router):
    app.include_router(r, prefix="/api")


@app.get("/health")
def health():
    return {"ok": True}
