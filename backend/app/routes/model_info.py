"""
VisionMate - Model Information Route
File: backend/app/routes/model_info.py

Purpose:
- Exposes model metadata, available detection classes, and confidence thresholds.
"""

from typing import Dict, Any, List
from fastapi import APIRouter
from backend.app.config import settings
from backend.app.vision.detector import ObjectDetector

router = APIRouter(tags=["Model Info"])


@router.get("/model-info", response_model=Dict[str, Any])
def get_model_info():
    """Retrieve details on the active YOLO model architecture and supported classes."""
    detector = ObjectDetector()
    model_classes: List[str] = []
    if detector.model is not None and hasattr(detector.model, "names"):
        model_classes = list(detector.model.names.values())

    return {
        "model_name": settings.MODEL_NAME,
        "device": settings.DEVICE,
        "confidence_threshold": settings.CONFIDENCE_THRESHOLD,
        "iou_threshold": settings.IOU_THRESHOLD,
        "max_image_dim": settings.MAX_IMAGE_DIM,
        "total_classes": len(model_classes),
        "supported_classes": model_classes[:20],  # Sample of top classes
        "high_priority_classes": settings.HIGH_PRIORITY_CLASSES
    }
