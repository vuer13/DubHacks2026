"""FastAPI application entry point.

Run from the repository root with:
    uvicorn backend.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config as _config
from .nav.router import router as nav_router
from .perception.router import router as perception_router
from .safety.router import router as safety_router
from .voice.router import router as voice_router
from .models import HealthResponse

app = FastAPI(title="TrailSense API", version="0.1.0")

# Open during local development. Restrict origins before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(perception_router)
app.include_router(safety_router)
app.include_router(nav_router)
app.include_router(voice_router)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Basic liveness check.

    Example: curl http://localhost:8000/health
    """
    return HealthResponse(ok=True)
