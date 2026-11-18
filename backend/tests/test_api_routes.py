"""
VisionMate - API Route Integration Tests
File: backend/tests/test_api_routes.py

Purpose:
- Validates FastAPI endpoints (/health, /model-info, /inspect, /inspect-json).
- Ensures correct HTTP status codes, schema conformance, and error handling.
"""

import base64
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def get_test_jpeg_bytes() -> bytes:
    """Creates a sample test image with synthetic shapes."""
    img = np.full((300, 400, 3), 200, dtype=np.uint8)
    cv2.circle(img, (200, 150), 50, (0, 0, 255), -1)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data
    assert data["docs"] == "/docs"


def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["model_name"] == "yolov8n.pt"
    assert data["device"] == "cpu"


def test_model_info_endpoint():
    response = client.get("/api/v1/model-info")
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "yolov8n.pt"
    assert data["total_classes"] > 0
    assert "person" in data["high_priority_classes"]


def test_inspect_multipart_endpoint():
    jpeg_bytes = get_test_jpeg_bytes()
    files = {"file": ("test_frame.jpg", jpeg_bytes, "image/jpeg")}
    response = client.post("/api/v1/inspect", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "frame_width" in data
    assert "frame_height" in data
    assert "inference_time_ms" in data
    assert "speech_text" in data
    assert isinstance(data["detections"], list)


def test_inspect_json_endpoint():
    jpeg_bytes = get_test_jpeg_bytes()
    b64_str = base64.b64encode(jpeg_bytes).decode("utf-8")
    payload = {
        "image_base64": f"data:image/jpeg;base64,{b64_str}",
        "return_annotated_image": True,
        "confidence_threshold": 0.35
    }
    response = client.post("/api/v1/inspect-json", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "speech_text" in data
    assert data["annotated_image"] is not None
    assert data["annotated_image"].startswith("data:image/jpeg;base64,")


def test_inspect_corrupt_file_returns_400():
    files = {"file": ("corrupt.jpg", b"not-a-valid-image", "image/jpeg")}
    response = client.post("/api/v1/inspect", files=files)
    assert response.status_code == 400
    assert "Failed to decode image" in response.json()["detail"]


def test_inspect_empty_json_returns_400():
    payload = {"image_base64": ""}
    response = client.post("/api/v1/inspect-json", json=payload)
    assert response.status_code == 400


def test_slow_inspection_does_not_block_async_event_loop(monkeypatch):
    """A slow CPU worker must leave the API loop free for other requests."""
    import asyncio
    import threading
    from backend.app.routes import inspect as route
    from backend.app.schemas.inspection import InspectionRequest

    worker_started = threading.Event()
    release_worker = threading.Event()

    def slow_pipeline(**kwargs):
        worker_started.set()
        assert release_worker.wait(timeout=2), "The async loop did not release the worker"
        return {"success": True}

    monkeypatch.setattr(route, "_process_frame", slow_pipeline)
    monkeypatch.setattr(route.ImageProcessor, "decode_from_base64", lambda _: np.zeros((8, 8, 3), dtype=np.uint8))

    async def scenario():
        task = asyncio.create_task(route.inspect_json_frame(InspectionRequest(image_base64="test")))
        try:
            for _ in range(100):
                if worker_started.is_set():
                    break
                await asyncio.sleep(0.01)
            assert worker_started.is_set()
            assert not task.done(), "CPU inference blocked the event loop"
        finally:
            release_worker.set()
        assert (await task)["success"]

    asyncio.run(scenario())
