"""
VisionMate - Health Check Route
File: backend/app/routes/health.py

Purpose:
- System liveness and readiness probe for deployment and monitoring.
- Reports model availability and active inference compute device.
"""

from fastapi import APIRouter
from backend.app.config import settings
from backend.app.schemas.inspection import HealthResponse
from backend.app.vision.detector import ObjectDetector

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health_check():
    """Verify backend health and model loading state."""
    detector = ObjectDetector()
    is_loaded = detector.model is not None
    return HealthResponse(
        status="ok" if is_loaded else "degraded",
        version=settings.VERSION,
        model_loaded=is_loaded,
        model_name=settings.MODEL_NAME,
        device=settings.DEVICE
    )
