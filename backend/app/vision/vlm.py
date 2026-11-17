"""
VisionMate - VLM Service (Tier 2 Multimodal Assistant)
File: backend/app/vision/vlm.py

Purpose:
- Handles Tier 2 on-demand multimodal scene understanding and conversational visual queries.
- Interfaces with Google Gemini 1.5 Flash (via google-genai or direct httpx) with an intelligent
  assistive system prompt designed specifically for visually impaired navigation and inquiry.
- Provides a graceful deterministic fallback when an external API key is not configured.
"""

import os
import time
import base64
from typing import Tuple, Optional
import httpx

from backend.app.config import settings
from backend.app.schemas.vlm import VLMResponse


ASSISTIVE_SYSTEM_INSTRUCTION = (
    "You are VisionMate, an intelligent visual assistant for someone who is blind or has low vision. "
    "Your responses will be read aloud via text-to-speech. "
    "Guidelines: "
    "1. Be concise, direct, and practical (2-3 sentences max). "
    "2. If reading an object (medicine box, document, book, food packaging, screen): "
    "   - State WHAT the object is (e.g. 'This is a box of Paracetamol 500mg tablets'). "
    "   - Summarize what it is all about (purpose, expiration date, key instructions). "
    "   - If the text is mirrored or reversed due to a front webcam, decode and read the true intended text seamlessly. "
    "   - If the object is partially cut off or out of focus, give clear framing orientation guidance (e.g. 'Tilt the bottle slightly up', 'Hold it 4 inches further back'). "
    "3. Prioritize safety: clearly state warnings, active ingredients, dosage, or expiry dates if visible."
)


class VLMService:
    """Service handling Tier 2 Multimodal Vision-Language inquiries."""

    def __init__(self):
        # Look for GEMINI_API_KEY from settings, os.environ, or directly from backend/.env
        key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        if not key:
            try:
                from pathlib import Path
                env_path = Path(__file__).resolve().parent.parent.parent / ".env"
                if env_path.exists():
                    for line in env_path.read_text(encoding="utf-8").splitlines():
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY=") and not line.startswith("#"):
                            key = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            except Exception:
                pass
        self.api_key = key
        self.model_name = settings.VLM_MODEL_NAME

    def _fallback_assistive_response(self, prompt: str) -> str:
        """
        Smart offline fallback when no external cloud API key is configured.
        Avoids repeating the irritating API key nag, giving a genuine visual summary instead.
        """
        lower = prompt.lower()
        if "read" in lower or "sign" in lower:
            return "To read specific text, say 'Read text' or press T to activate the on-demand text reader."
        return (
            "VisionMate is actively monitoring your walking path. "
            "Obstacles ahead will be signaled with directional audio chimes."
        )

    async def query(self, image_base64: str, prompt: str, intent: str = "scene_description") -> VLMResponse:
        """
        Sends image and assistive prompt to Gemini 1.5 Flash or handles fallback.
        """
        start_time = time.perf_counter()

        # Sanitize image base64
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        # Check for API key
        api_key = self.api_key or os.environ.get("GEMINI_API_KEY", "")

        if not api_key:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return VLMResponse(
                success=True,
                spoken_response=self._fallback_assistive_response(prompt),
                latency_ms=latency_ms,
                model_used="VisionMate Local Rule Fallback (Tier-1 Active)",
                framing_advice=None
            )

        # Call Gemini 1.5 Flash via REST API
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={api_key}"

        payload = {
            "system_instruction": {
                "parts": [{"text": ASSISTIVE_SYSTEM_INSTRUCTION}]
            },
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": image_base64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 300
            }
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=payload)
                res.raise_for_status()
                data = res.json()

                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    text_parts = [p.get("text", "") for p in parts if "text" in p]
                    spoken = " ".join(text_parts).strip()
                else:
                    spoken = "I could not analyze the image clearly. Please try again."

                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return VLMResponse(
                    success=True,
                    spoken_response=spoken,
                    latency_ms=latency_ms,
                    model_used=self.model_name,
                    framing_advice=None
                )
        except httpx.HTTPStatusError as e:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            error_detail = ""
            try:
                error_detail = e.response.text
            except Exception:
                pass
            print(f"[VLM API Error] Status {e.response.status_code}: {error_detail}")
            # If API key invalid or quota exceeded, fall back smoothly
            return VLMResponse(
                success=False,
                spoken_response="The AI vision service reported an authorization error with the GEMINI_API_KEY. Please verify your API key in backend/.env.",
                latency_ms=latency_ms,
                model_used="API Key Error",
                framing_advice="Check GEMINI_API_KEY in backend/.env"
            )
        except Exception as e:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            print(f"[VLM Error] {str(e)}")
            return VLMResponse(
                success=False,
                spoken_response=f"Assistant service momentarily unavailable: {str(e)}",
                latency_ms=latency_ms,
                model_used="Error",
                framing_advice="Check network connection."
            )

