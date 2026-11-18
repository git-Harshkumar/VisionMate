"""
VisionMate - Text Translation Service
File: backend/app/vision/translator.py

Purpose:
- Translates open-ended spoken text (OCR readings, VLM answers, catalog announcements)
  into the user's selected speech language via the existing Gemini integration.
- Bounded safety-critical navigation guidance is NOT handled here; it is generated
  bilingually in backend/app/vision/navigation.py so warnings never wait on a network call.
- Falls back to the original text when no API key is configured or translation fails,
  so a spoken result is never lost.
"""

import os
import time
from typing import Optional, Tuple
import httpx

from backend.app.config import settings
from backend.app.schemas.translate import TranslateResponse


LANGUAGE_NAMES = {
    "hi": "Hindi",
}

_CACHE_LIMIT = 500


def _resolve_gemini_api_key() -> str:
    """Same key resolution order as the VLM service: settings, environment, backend/.env."""
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
    return key


class TranslatorService:
    """Translates open-ended spoken text with an in-memory cache."""

    def __init__(self):
        self.api_key = _resolve_gemini_api_key()
        self.model_name = settings.VLM_MODEL_NAME
        self._cache: dict[Tuple[str, str], str] = {}

    async def _call_gemini(self, prompt: str) -> Optional[str]:
        """Calls Gemini for a text-only completion. Returns None on any failure."""
        api_key = self.api_key or os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            return None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 400},
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    return None
                data = resp.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    return None
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts:
                    return None
                translated = parts[0].get("text", "").strip()
                return translated or None
        except Exception:
            return None

    async def translate(self, text: str, target_language: str) -> TranslateResponse:
        """
        Translates text for speech output. Never raises: on any problem the
        original text is returned with translated=False so speech can continue.
        """
        start_time = time.perf_counter()

        def _done(translated_text: str, translated: bool, model_used: str) -> TranslateResponse:
            return TranslateResponse(
                success=True,
                translated_text=translated_text,
                translated=translated,
                latency_ms=round((time.perf_counter() - start_time) * 1000, 2),
                model_used=model_used,
            )

        if not text or not text.strip():
            return _done(text, False, "none (empty text)")

        target = (target_language or "en").lower().split("-")[0].strip()
        if target == "en":
            return _done(text, False, "none (source language)")
        if target not in LANGUAGE_NAMES:
            return _done(text, False, f"unsupported language '{target}'")

        cache_key = (text, target)
        if cache_key in self._cache:
            return _done(self._cache[cache_key], True, f"{self.model_name} (cache)")

        prompt = (
            f"Translate the following text to {LANGUAGE_NAMES[target]}. "
            "It will be spoken aloud by an assistive device for a blind user. "
            "Return only the translation: no explanations, no quotes, no notes. "
            "Keep object names and numbers accurate.\n\n"
            f"{text}"
        )

        translated = await self._call_gemini(prompt)
        if not translated:
            return _done(text, False, "unavailable (no GEMINI_API_KEY or request failed)")

        if len(self._cache) >= _CACHE_LIMIT:
            self._cache.pop(next(iter(self._cache)))
        self._cache[cache_key] = translated
        return _done(translated, True, self.model_name)
