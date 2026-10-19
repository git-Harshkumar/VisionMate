"""
VisionMate - OCR Service Unit & Integration Tests
File: backend/tests/test_ocr.py

Tests:
- OCR runs on a real image with visible text (drawn synthetically).
- Returns OCRResponse with correct schema.
- Returns success=False gracefully on bad input.
- API /read-text endpoint returns 200 with valid image.
- API /read-text returns 400 on corrupt file.
"""

import base64
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.vision.ocr import OCRService
from backend.app.main import app

client = TestClient(app)


def create_text_image(text: str = "EXIT", width: int = 300, height: int = 100) -> np.ndarray:
    """Creates a clean white image with bold black text for OCR testing."""
    img = np.full((height, width, 3), 255, dtype=np.uint8)
    cv2.putText(img, text, (30, 70), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 4, cv2.LINE_AA)
    return img


def create_text_image_bytes(text: str = "EXIT") -> bytes:
    img = create_text_image(text)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


class TestOCRService:
    def test_ocr_service_is_singleton(self):
        s1 = OCRService()
        s2 = OCRService()
        assert s1 is s2

    def test_ocr_returns_valid_response_structure(self):
        ocr = OCRService()
        img = create_text_image("HELLO")
        result = ocr.read_text(img)

        assert result.success is True
        assert result.inference_time_ms >= 0
        assert isinstance(result.total_text, str)
        assert isinstance(result.speech_text, str)
        assert isinstance(result.blocks, list)

    def test_ocr_detects_bold_text(self):
        ocr = OCRService()
        img = create_text_image("EXIT")
        result = ocr.read_text(img)

        # EasyOCR should detect the word EXIT with reasonably high confidence
        detected_texts = [b.text.upper() for b in result.blocks]
        assert any("EXIT" in t for t in detected_texts), (
            f"Expected 'EXIT' to be detected but got: {detected_texts}"
        )

    def test_ocr_on_blank_image_returns_no_text(self):
        ocr = OCRService()
        blank = np.full((200, 200, 3), 200, dtype=np.uint8)
        result = ocr.read_text(blank)

        assert result.success is True
        assert result.total_blocks_count == 0
        assert "No text detected" in result.message or result.speech_text == "No readable text was found."

    def test_ocr_block_schema_has_required_fields(self):
        ocr = OCRService()
        img = create_text_image("STOP")
        result = ocr.read_text(img)

        for block in result.blocks:
            assert hasattr(block, "text")
            assert hasattr(block, "confidence")
            assert hasattr(block, "box")
            assert isinstance(block.box, list)
            assert len(block.box) == 4  # four corner points
            assert 0.0 <= block.confidence <= 1.0

    def test_speech_text_starts_with_reading_when_text_found(self):
        ocr = OCRService()
        img = create_text_image("OPEN")
        result = ocr.read_text(img)

        if result.total_blocks_count > 0:
            assert result.speech_text.startswith("Reading text:")


class TestOCRAPIEndpoints:
    def test_read_text_multipart_valid_image(self):
        jpeg_bytes = create_text_image_bytes("TEST")
        files = {"file": ("test_text.jpg", jpeg_bytes, "image/jpeg")}
        response = client.post("/api/v1/read-text", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "speech_text" in data
        assert "blocks" in data

    def test_read_text_json_valid_image(self):
        jpeg_bytes = create_text_image_bytes("PUSH")
        b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
        payload = {
            "image_base64": f"data:image/jpeg;base64,{b64}",
            "return_annotated_image": False
        }
        response = client.post("/api/v1/read-text-json", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    def test_read_text_corrupt_file_returns_400(self):
        files = {"file": ("corrupt.jpg", b"not_an_image", "image/jpeg")}
        response = client.post("/api/v1/read-text", files=files)
        assert response.status_code == 400

    def test_read_text_json_missing_payload_returns_400(self):
        payload = {"image_base64": ""}
        response = client.post("/api/v1/read-text-json", json=payload)
        assert response.status_code == 400
