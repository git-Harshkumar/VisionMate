"""
VisionMate - Translation Schemas
File: backend/app/schemas/translate.py

Purpose:
- Strong typing for the open-ended text translation endpoint used to localize
  spoken output (OCR readings, VLM answers, catalog announcements).
"""

from pydantic import BaseModel, Field


class TranslateRequest(BaseModel):
    text: str = Field(..., description="Source text (English) to translate for speech output")
    target_language: str = Field(..., description="Target language code, e.g. 'hi' or 'hi-IN'")


class TranslateResponse(BaseModel):
    success: bool = Field(..., description="Whether the request was handled (fallback still counts as handled)")
    translated_text: str = Field(..., description="Translated text, or the original text when translation was not possible")
    translated: bool = Field(..., description="True only when translated_text is a real translation into the target language")
    latency_ms: float = Field(..., description="Translation latency in milliseconds")
    model_used: str = Field(..., description="Model or fallback path used for the result")
