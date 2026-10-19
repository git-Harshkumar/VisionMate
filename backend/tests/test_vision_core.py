"""
VisionMate - Vision Core Unit Tests
File: backend/tests/test_vision_core.py

Purpose:
- Unit tests validating image decoding, aspect ratio preservation, spatial zone mapping,
  prominence evaluation, prioritizer rankings, and detector execution.
"""

import base64
import cv2
import numpy as np
import pytest

from backend.app.schemas.detection import SpatialPosition, ProminenceLevel
from backend.app.vision.image_processor import ImageProcessor
from backend.app.vision.prioritizer import Prioritizer
from backend.app.vision.detector import ObjectDetector


def create_dummy_jpeg_bytes(width=640, height=480) -> bytes:
    """Helper to generate valid JPEG image bytes in memory."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    cv2.rectangle(img, (50, 50), (200, 200), (0, 255, 0), -1)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


class TestImageProcessor:
    def test_decode_valid_bytes(self):
        jpeg_bytes = create_dummy_jpeg_bytes(320, 240)
        img = ImageProcessor.decode_from_bytes(jpeg_bytes)
        assert img is not None
        assert img.shape == (240, 320, 3)

    def test_decode_empty_bytes_raises_error(self):
        with pytest.raises(ValueError, match="Empty image byte payload"):
            ImageProcessor.decode_from_bytes(b"")

    def test_decode_corrupt_bytes_raises_error(self):
        with pytest.raises(ValueError, match="Failed to decode image"):
            ImageProcessor.decode_from_bytes(b"invalid_non_image_garbage_bytes")

    def test_decode_from_base64_data_uri(self):
        jpeg_bytes = create_dummy_jpeg_bytes(100, 80)
        b64_str = base64.b64encode(jpeg_bytes).decode("utf-8")
        data_uri = f"data:image/jpeg;base64,{b64_str}"
        img = ImageProcessor.decode_from_base64(data_uri)
        assert img.shape == (80, 100, 3)

    def test_resize_with_aspect_ratio_downscales_oversized(self):
        large_img = np.zeros((2000, 1000, 3), dtype=np.uint8)
        resized, scale = ImageProcessor.resize_with_aspect_ratio(large_img, max_dim=1000)
        assert scale == 0.5
        assert resized.shape == (1000, 500, 3)

    def test_resize_with_aspect_ratio_noop_on_smaller(self):
        small_img = np.zeros((400, 600, 3), dtype=np.uint8)
        resized, scale = ImageProcessor.resize_with_aspect_ratio(small_img, max_dim=1000)
        assert scale == 1.0
        assert resized.shape == (400, 600, 3)

    def test_encode_to_base64_jpeg(self):
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        data_uri = ImageProcessor.encode_to_base64_jpeg(img)
        assert data_uri.startswith("data:image/jpeg;base64,")


class TestPrioritizer:
    def test_spatial_position_mapping(self):
        frame_w = 600
        # 0 to 198 is Left (< 0.33)
        assert Prioritizer.calculate_spatial_position(100, frame_w) == SpatialPosition.LEFT
        # 198 to 396 is Center (0.33 - 0.66)
        assert Prioritizer.calculate_spatial_position(300, frame_w) == SpatialPosition.CENTER
        # > 396 is Right (> 0.66)
        assert Prioritizer.calculate_spatial_position(500, frame_w) == SpatialPosition.RIGHT

    def test_prominence_calculation(self):
        assert Prioritizer.calculate_prominence(0.25) == ProminenceLevel.PROMINENT
        assert Prioritizer.calculate_prominence(0.10) == ProminenceLevel.MID_RANGE
        assert Prioritizer.calculate_prominence(0.02) == ProminenceLevel.DISTANT

    def test_prioritization_and_natural_speech_synthesis(self):
        raw_detections = [
            # Low priority object on the left, distant
            {"label": "book", "confidence": 0.60, "box": (10, 10, 30, 30)},
            # High priority object in the center, prominent
            {"label": "person", "confidence": 0.88, "box": (150, 50, 450, 450)},
            # Mid-priority object on the right
            {"label": "chair", "confidence": 0.75, "box": (500, 200, 600, 400)},
        ]
        items, speech_text = Prioritizer.prioritize(
            raw_detections=raw_detections,
            frame_width=640,
            frame_height=480,
            max_items=2
        )

        assert len(items) == 2
        # Person should be ranked first because of priority class + center + prominence
        assert items[0].label == "person"
        assert items[0].position == SpatialPosition.CENTER
        assert items[0].prominence == ProminenceLevel.PROMINENT
        assert "person in the center" in speech_text
        assert speech_text.startswith("Ahead: ")

    def test_prioritization_empty(self):
        items, speech_text = Prioritizer.prioritize([], 640, 480)
        assert len(items) == 0
        assert speech_text == "No prominent objects detected ahead."


class TestObjectDetector:
    def test_detector_inference(self):
        detector = ObjectDetector()
        assert detector.model is not None

        # Test inference on blank frame (should run fast without errors)
        blank = np.zeros((320, 320, 3), dtype=np.uint8)
        result = detector.detect(blank)
        assert "inference_time_ms" in result
        assert "raw_detections" in result
        assert isinstance(result["raw_detections"], list)
