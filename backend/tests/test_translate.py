"""
VisionMate - Translation endpoint & Hindi navigation guidance tests
File: backend/tests/test_translate.py
"""

import asyncio
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas.detection import (
    DetectionItem,
    BoundingBox,
    SpatialPosition,
    ProminenceLevel,
)
from backend.app.schemas.navigation import NavigationAction
from backend.app.vision.navigation import NavigationEngine
from backend.app.vision.translator import TranslatorService

client = TestClient(app)


def _run(coro):
    return asyncio.run(coro)


# ── Translation service ──

def test_translate_english_passthrough():
    service = TranslatorService()
    service.api_key = ""
    result = _run(service.translate("Path is clear ahead.", "en"))
    assert result.translated is False
    assert result.translated_text == "Path is clear ahead."


def test_translate_falls_back_without_api_key():
    service = TranslatorService()
    service.api_key = ""
    result = _run(service.translate("Path is clear ahead.", "hi"))
    assert result.success is True
    assert result.translated is False
    assert result.translated_text == "Path is clear ahead."


def test_translate_unsupported_language_returns_original():
    service = TranslatorService()
    service.api_key = "fake-key"
    result = _run(service.translate("Hello", "fr"))
    assert result.translated is False
    assert result.translated_text == "Hello"


def test_translate_uses_cache_on_second_call():
    service = TranslatorService()
    service.api_key = "fake-key"

    async def scenario():
        with patch.object(service, "_call_gemini", new=AsyncMock(return_value="रास्ता साफ़ है।")) as mock_call:
            first = await service.translate("Path is clear.", "hi")
            second = await service.translate("Path is clear.", "hi")
        return first, second, mock_call.await_count

    first, second, call_count = _run(scenario())
    assert call_count == 1
    assert first.translated is True
    assert first.translated_text == "रास्ता साफ़ है।"
    assert second.translated is True
    assert "cache" in second.model_used


def test_translate_route_english_passthrough():
    response = client.post(
        "/api/v1/translate",
        json={"text": "Path is clear ahead.", "target_language": "en"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["translated"] is False
    assert body["translated_text"] == "Path is clear ahead."


# ── Hindi navigation guidance (deterministic, no network) ──

def _make_center_obstacle(label: str = "chair") -> DetectionItem:
    x1, y1, x2, y2 = 400, 700, 600, 950
    w, h = x2 - x1, y2 - y1
    return DetectionItem(
        id=1,
        label=label,
        confidence=0.9,
        box=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, width=w, height=h, area=w * h),
        position=SpatialPosition.CENTER,
        prominence=ProminenceLevel.PROMINENT,
        area_ratio=round((w * h) / 1_000_000, 4),
        is_priority=True,
        description=f"{label} center",
    )


def test_hindi_clear_path_guidance():
    guidance = NavigationEngine.analyze(detections=[], frame_width=1000, frame_height=1000, language="hi")
    assert guidance.action == NavigationAction.STRAIGHT
    assert "रुकावट नहीं दिख रही" in guidance.guidance_speech
    assert "No obstacles detected" not in guidance.guidance_speech


def test_hindi_urgent_hazard_guidance_uses_obstacle_name():
    detections = [_make_center_obstacle("chair")]
    guidance = NavigationEngine.analyze(detections=detections, frame_width=1000, frame_height=1000, language="hi")
    assert guidance.urgent_hazard is not None
    assert "सावधान" in guidance.guidance_speech or "रुकें" in guidance.guidance_speech
    assert "कुर्सी" in guidance.guidance_speech
    assert "chair" not in guidance.guidance_speech.lower()


def test_hindi_language_code_variants_normalize():
    detections = [_make_center_obstacle("chair")]
    for code in ("hi", "hi-IN", "Hi", "HI"):
        guidance = NavigationEngine.analyze(
            detections=detections, frame_width=1000, frame_height=1000, language=code
        )
        assert "कुर्सी" in guidance.guidance_speech, code


def test_english_guidance_unchanged_by_default():
    detections = [_make_center_obstacle("chair")]
    guidance = NavigationEngine.analyze(detections=detections, frame_width=1000, frame_height=1000)
    assert "Caution" in guidance.guidance_speech or "Stop" in guidance.guidance_speech
    assert "chair" in guidance.guidance_speech.lower()


def test_unknown_language_falls_back_to_english():
    detections = [_make_center_obstacle("chair")]
    guidance = NavigationEngine.analyze(detections=detections, frame_width=1000, frame_height=1000, language="fr")
    assert "chair" in guidance.guidance_speech.lower()


def _make_obstacle(item_id: int, label: str, x1: int, x2: int, y2: int = 950) -> DetectionItem:
    w, h = x2 - x1, y2 - 700
    return DetectionItem(
        id=item_id,
        label=label,
        confidence=0.9,
        box=BoundingBox(x1=x1, y1=700, x2=x2, y2=y2, width=w, height=h, area=w * h),
        position=SpatialPosition.CENTER,
        prominence=ProminenceLevel.PROMINENT,
        area_ratio=round((w * h) / 1_000_000, 4),
        is_priority=True,
        description=f"{label} blocking",
    )


def test_hindi_next_steps_are_localized():
    guidance = NavigationEngine.analyze(detections=[], frame_width=1000, frame_height=1000, language="hi")
    assert guidance.next_steps
    assert any("बढ़ें" in step for step in guidance.next_steps)


def test_hindi_stop_guidance_speaks_localized_recovery_steps():
    blocked = [
        _make_obstacle(1, "chair", 0, 350),
        _make_obstacle(2, "couch", 350, 650),
        _make_obstacle(3, "bed", 650, 1000),
    ]
    guidance = NavigationEngine.analyze(detections=blocked, frame_width=1000, frame_height=1000, language="hi")
    assert guidance.action == NavigationAction.STOP
    assert guidance.next_steps
    joined = " ".join(guidance.next_steps)
    assert "रुकें" in joined and "जाँचें" in joined
    assert "Stop and stand still" not in joined


def test_steps_and_speech_avoid_unverifiable_movements():
    # The camera cannot verify fixed step counts, degree turns or equipment,
    # so neither spoken guidance nor the numbered steps may prescribe them.
    scenes = [
        NavigationEngine.analyze(detections=[], frame_width=1000, frame_height=1000, language=lang)
        for lang in ("en", "hi")
    ] + [
        NavigationEngine.analyze(
            detections=[
                _make_obstacle(1, "chair", 0, 350),
                _make_obstacle(2, "couch", 350, 650),
                _make_obstacle(3, "bed", 650, 1000),
            ],
            frame_width=1000, frame_height=1000, language=lang,
        )
        for lang in ("en", "hi")
    ]
    for g in scenes:
        for text in list(g.next_steps) + [g.guidance_speech]:
            low = text.lower()
            assert "cane" not in low
            assert "छड़ी" not in text
            assert "90 degrees" not in low
            assert "two steps" not in low
