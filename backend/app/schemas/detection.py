"""
VisionMate - Detection Schemas
File: backend/app/schemas/detection.py

Purpose:
- Strongly typed representations of object bounding boxes, spatial coordinates,
  prominence ratings, and accessibility annotations.
"""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class SpatialPosition(str, Enum):
    LEFT = "on the left"
    CENTER = "in the center"
    RIGHT = "on the right"


class ProminenceLevel(str, Enum):
    PROMINENT = "prominent / close"
    MID_RANGE = "mid-range"
    DISTANT = "distant"


class BoundingBox(BaseModel):
    x1: int = Field(..., description="Top-left X coordinate in pixels")
    y1: int = Field(..., description="Top-left Y coordinate in pixels")
    x2: int = Field(..., description="Bottom-right X coordinate in pixels")
    y2: int = Field(..., description="Bottom-right Y coordinate in pixels")
    width: int = Field(..., description="Box width in pixels")
    height: int = Field(..., description="Box height in pixels")
    area: int = Field(..., description="Box area in pixels squared")


class DetectionItem(BaseModel):
    id: int = Field(..., description="Unique sequential observation index in this frame")
    label: str = Field(..., description="Object class name (e.g., person, chair, car)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence score (0.0 to 1.0)")
    box: BoundingBox = Field(..., description="Pixel bounding box coordinates")
    position: SpatialPosition = Field(..., description="Horizontal spatial position relative to camera FOV")
    prominence: ProminenceLevel = Field(..., description="Relative visual prominence based on screen area ratio")
    area_ratio: float = Field(..., ge=0.0, le=1.0, description="Ratio of object bounding box to total frame area")
    is_priority: bool = Field(default=False, description="Whether this class is classified as high-priority/hazard")
    track_id: Optional[int] = Field(None, description="Persistent tracking ID across frames")
    description: str = Field(..., description="Concise verbal description suitable for screen readers or TTS")
