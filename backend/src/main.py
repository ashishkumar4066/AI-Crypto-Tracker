"""
FastAPI application entry point.

Run with:
    cd backend
    uvicorn src.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.db.database import create_tables
from src.api.sync_routes import router as sync_router
from src.api.txn_routes import router as txn_router
from src.api.graph_routes import router as graph_router
from src.api.import_routes import router as import_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)


# ---------------------------------------------------------------------------
# Lifespan: create DB tables on startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AI Crypto Tracker",
    description="Production-grade crypto portfolio tracker & tax engine",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS -- allow the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes under /api/v1
app.include_router(sync_router, prefix="/api/v1", tags=["sync"])
app.include_router(txn_router, prefix="/api/v1", tags=["transactions"])
app.include_router(graph_router, prefix="/api/v1", tags=["graph"])
app.include_router(import_router, prefix="/api/v1", tags=["import"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
