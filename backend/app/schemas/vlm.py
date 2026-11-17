"""
VisionMate - Vision-Language Model (VLM) Schemas
File: backend/app/schemas/vlm.py

Purpose:
- Strong typing for Tier 2 multimodal cloud/local VLM requests and responses.
"""

from typing import Optional
from pydantic import BaseModel, Field


class VLMRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded JPEG or PNG image frame")
    prompt: Optional[str] = Field(
        default="Describe this scene concisely for a blind person navigating. Mention any obstacles, walking path clearance, doors, and stairs.",
        description="User question or assistive prompt"
    )
    intent: Optional[str] = Field(
        default="scene_description",
        description="Intent type: 'scene_description', 'find_object', 'read_handwriting', 'general_query'"
    )


class VLMResponse(BaseModel):
    success: bool = Field(..., description="Whether VLM processing succeeded")
    spoken_response: str = Field(..., description="Clear, assistive natural spoken response tailored for audio delivery")
    latency_ms: float = Field(..., description="VLM inference latency in milliseconds")
    model_used: str = Field(..., description="Name of the model utilized (e.g. Gemini 1.5 Flash or local fallback)")
    framing_advice: Optional[str] = Field(None, description="Optional camera orientation advice if image is unreadable")

