"""
VisionMate - Inspection & Health Schemas
File: backend/app/schemas/inspection.py

Purpose:
- Defines the data contract for camera frame inspections, telemetry, and service health checks.
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.detection import DetectionItem
from backend.app.schemas.navigation import NavigationGuidance


class InspectionRequest(BaseModel):
    image_base64: Optional[str] = Field(None, description="Base64 encoded JPEG or PNG image string")
    return_annotated_image: bool = Field(True, description="Whether to encode and return an annotated JPEG overlay")
    confidence_threshold: Optional[float] = Field(
        None, ge=0.05, le=0.95, description="Optional override for detection confidence threshold"
    )


class InspectionResponse(BaseModel):
    success: bool = Field(..., description="Whether frame processing succeeded")
    frame_width: int = Field(..., description="Processed frame width in pixels")
    frame_height: int = Field(..., description="Processed frame height in pixels")
    inference_time_ms: float = Field(..., description="Time taken by the YOLO model in milliseconds")
    total_time_ms: float = Field(..., description="Total pipeline latency in milliseconds")
    total_detected_count: int = Field(..., description="Total raw objects found before prioritization")
    prioritized_count: int = Field(..., description="Count of prioritized objects returned")
    detections: List[DetectionItem] = Field(default_factory=list, description="Prioritized list of detected items")
    speech_text: str = Field(..., description="Concise synthesized announcement ready for Web Speech TTS")
    new_announcements: List[str] = Field(default_factory=list, description="List of items newly announced after cooldown filtering")
    annotated_image: Optional[str] = Field(None, description="Base64 data URL of annotated preview frame")
    message: Optional[str] = Field(None, description="Optional status message or diagnostic notes")
    navigation: Optional[NavigationGuidance] = Field(default=None, description="Actionable safe corridor navigation guidance")
    prioritized_detections: Optional[List[DetectionItem]] = Field(default=None, description="Compatibility alias for detections")
    annotated_image_base64: Optional[str] = Field(default=None, description="Compatibility alias for annotated_image")
    announcement: Optional[str] = Field(default=None, description="Compatibility alias for speech_text")


class HealthResponse(BaseModel):
    status: str = Field(..., description="Health status (e.g., 'ok' or 'degraded')")
    version: str = Field(..., description="API Version")
    model_loaded: bool = Field(..., description="Whether the YOLO model weights are loaded in memory")
    model_name: str = Field(..., description="Model filename or identifier")
    device: str = Field(..., description="Compute device currently active (e.g. cpu, cuda)")
