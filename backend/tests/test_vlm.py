"""
VisionMate - Unit tests for VLM route and OCR framing cues
File: backend/tests/test_vlm.py
"""

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas.ocr import OCRBlock
from backend.app.vision.ocr import OCRService

client = TestClient(app)


def test_calculate_framing_guidance():
    # Test text touching edges
    blocks_touching_left = [
        OCRBlock(text="Hello", confidence=0.9, box=[[10, 50], [100, 50], [100, 80], [10, 80]])
    ]
    # In a 1000x1000 frame, x=10 is <= 40 (margin_x = 40)
    cue = OCRService._calculate_framing_guidance(blocks_touching_left, 1000, 1000)
    assert cue is not None
    assert "left" in cue.lower()


def test_calculate_framing_guidance_move_back():
    blocks_wide = [
        OCRBlock(text="Left edge", confidence=0.9, box=[[10, 50], [50, 50], [50, 80], [10, 80]]),
        OCRBlock(text="Right edge", confidence=0.9, box=[[980, 50], [1000, 50], [1000, 80], [980, 80]])
    ]
    cue = OCRService._calculate_framing_guidance(blocks_wide, 1000, 1000)
    assert cue is not None
    assert "move camera back" in cue.lower()


def test_vlm_fallback_without_api_key():
    payload = {
        "image_base64": "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "prompt": "What is in front of me?"
    }
    response = client.post("/api/v1/ask-vlm", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "spoken_response" in data

