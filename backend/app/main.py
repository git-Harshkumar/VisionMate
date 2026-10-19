"""
VisionMate - Main FastAPI Application
File: backend/app/main.py

Purpose:
- Configures FastAPI with CORS, lifespan events, and modular API routers.
- Performs model warm-up on startup to guarantee responsive inference on the first user request.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.vision.detector import ObjectDetector
from backend.app.routes.health import router as health_router
from backend.app.routes.inspect import router as inspect_router
from backend.app.routes.model_info import router as model_info_router
from backend.app.routes.read_text import router as read_text_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager: primes models during startup."""
    print(f"[*] Initializing {settings.PROJECT_NAME} v{settings.VERSION}...")
    try:
        # Preload YOLO model into memory and run warm-up pass
        detector = ObjectDetector()
        print(f"[+] Loaded YOLO model '{settings.MODEL_NAME}' successfully on {settings.DEVICE}.")
    except Exception as e:
        print(f"[-] Warning: Failed to pre-warm detector: {e}")

    yield

    print("[*] VisionMate service shutting down cleanly.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "VisionMate Backend: Camera-based visual assistant providing deterministic, "
        "spatially prioritized object detection and on-demand OCR for low-vision accessibility."
    ),
    lifespan=lifespan
)

# CORS middleware for React / Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes with versioned prefix
app.include_router(health_router, prefix=settings.API_V1_STR)
app.include_router(inspect_router, prefix=settings.API_V1_STR)
app.include_router(model_info_router, prefix=settings.API_V1_STR)
app.include_router(read_text_router, prefix=settings.API_V1_STR)

# Also expose health check at top level for container orchestrators
app.include_router(health_router, prefix="")


@app.get("/")
def root_info():
    """Service landing endpoint with API links."""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
        "inspect": f"{settings.API_V1_STR}/inspect",
        "description": "AI Visual Assistant for Accessibility"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
