"""
VisionMate - Object Detector
File: backend/app/vision/detector.py

Purpose:
- Wraps Ultralytics YOLO with thread-safe inference execution.
- Implements model warm-up to eliminate cold-start latency spikes.
- Returns normalized, typed detection dictionaries ready for downstream spatial prioritization.
"""

import threading
import time
from typing import List, Dict, Any, Optional
import numpy as np
from ultralytics import YOLO

from backend.app.config import settings


class ObjectDetector:
    """Thread-safe YOLO object detection service."""

    _instance: Optional["ObjectDetector"] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ObjectDetector, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, model_name: str = settings.MODEL_NAME, device: str = settings.DEVICE):
        if self._initialized:
            return

        self.model_name = model_name
        self.device = device
        self.model: Optional[YOLO] = None
        self._load_lock = threading.Lock()
        self._load_model()
        self._warmup()
        self._initialized = True

    def _load_model(self):
        """Loads YOLO weights into memory."""
        with self._load_lock:
            try:
                self.model = YOLO(self.model_name)
            except Exception as e:
                raise RuntimeError(f"Failed to load YOLO model '{self.model_name}': {str(e)}")

    def _warmup(self):
        """Runs a 1x1 synthetic inference pass to prime the model graph and weights."""
        if self.model is None:
            return
        dummy_frame = np.zeros((320, 320, 3), dtype=np.uint8)
        try:
            self.model.predict(
                source=dummy_frame,
                device=self.device,
                verbose=False,
                save=False
            )
        except Exception:
            pass  # Non-fatal if warmup encounters device warning

    def detect(
        self, 
        image: np.ndarray, 
        conf_threshold: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Runs object detection on a BGR image array.
        Returns:
            {
                "inference_time_ms": float,
                "raw_detections": List[Dict]
            }
        """
        if self.model is None:
            raise RuntimeError("YOLO model is not initialized.")

        conf = conf_threshold if conf_threshold is not None else settings.CONFIDENCE_THRESHOLD
        h, w = image.shape[:2]

        start_time = time.perf_counter()
        results = self.model.predict(
            source=image,
            conf=conf,
            iou=settings.IOU_THRESHOLD,
            device=self.device,
            verbose=False,
            save=False
        )
        inference_time_ms = round((time.perf_counter() - start_time) * 1000, 2)

        raw_detections: List[Dict[str, Any]] = []
        if results and len(results) > 0:
            result = results[0]
            boxes = result.boxes
            names = result.names

            for box in boxes:
                cls_id = int(box.cls[0].item())
                label = names.get(cls_id, f"class_{cls_id}").lower()
                confidence = float(box.conf[0].item())
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                # Clamp bounding box coordinates to image boundaries
                x1 = max(0, min(int(x1), w - 1))
                y1 = max(0, min(int(y1), h - 1))
                x2 = max(x1 + 1, min(int(x2), w))
                y2 = max(y1 + 1, min(int(y2), h))

                raw_detections.append({
                    "label": label,
                    "confidence": round(confidence, 3),
                    "box": (x1, y1, x2, y2)
                })

        return {
            "inference_time_ms": inference_time_ms,
            "raw_detections": raw_detections
        }
