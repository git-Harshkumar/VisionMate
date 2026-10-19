"""
VisionMate - Optical Character Recognition (OCR) Schemas
File: backend/app/schemas/ocr.py

Purpose:
- Strong typing for on-demand text reading requests and responses.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class OCRBlock(BaseModel):
    text: str = Field(..., description="Recognized text fragment")
    confidence: float = Field(..., ge=0.0, le=1.0, description="OCR confidence score")
    box: List[List[int]] = Field(..., description="Four corner points [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]")


class OCRResponse(BaseModel):
    success: bool = Field(..., description="Whether OCR reading succeeded")
    inference_time_ms: float = Field(..., description="OCR inference latency in milliseconds")
    total_blocks_count: int = Field(..., description="Number of recognized text segments")
    total_text: str = Field(..., description="Full concatenated text detected in the image")
    speech_text: str = Field(..., description="Speech-optimized reading of the recognized text")
    blocks: List[OCRBlock] = Field(default_factory=list, description="Detailed list of recognized text segments")
    message: Optional[str] = Field(None, description="Diagnostic notes if no text was found")
