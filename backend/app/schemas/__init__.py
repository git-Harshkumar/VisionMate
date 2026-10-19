"""
Pydantic Schemas Package
"""
from backend.app.schemas.detection import (
    BoundingBox,
    SpatialPosition,
    ProminenceLevel,
    DetectionItem
)
from backend.app.schemas.inspection import (
    InspectionRequest,
    InspectionResponse,
    HealthResponse
)
from backend.app.schemas.ocr import (
    OCRBlock,
    OCRResponse
)

__all__ = [
    "BoundingBox",
    "SpatialPosition",
    "ProminenceLevel",
    "DetectionItem",
    "InspectionRequest",
    "InspectionResponse",
    "HealthResponse",
    "OCRBlock",
    "OCRResponse",
]
