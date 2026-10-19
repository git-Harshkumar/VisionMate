"""
VisionMate - Frame Inspection Route
File: backend/app/routes/inspect.py

Purpose:
- Handles camera frame ingestion (via multipart/form-data or JSON base64).
- Orchestrates image validation, downscaling, YOLO object detection, spatial prioritization.
- Passes detections through the TemporalTracker for persistent IDs and cooldown filtering.
- Returns structured observations, audio-ready descriptions, and visual preview overlays.
"""

import time
from typing import Optional
from fastapi import APIRouter, File, UploadFile, HTTPException, Query, Body
import numpy as np

from backend.app.config import settings
from backend.app.schemas.inspection import InspectionRequest, InspectionResponse
from backend.app.vision.image_processor import ImageProcessor
from backend.app.vision.detector import ObjectDetector
from backend.app.vision.prioritizer import Prioritizer
from backend.app.vision.tracker import TemporalTracker
from backend.app.vision.navigation import NavigationEngine
from backend.app.vision.barrier_detector import BarrierDetector

router = APIRouter(tags=["Inspection"])


def _process_frame(
    image: np.ndarray,
    conf_threshold: Optional[float] = None,
    return_annotated: bool = True
) -> InspectionResponse:
    """Core pipeline execution shared by multipart and JSON endpoints."""
    start_total = time.perf_counter()

    # 1. Aspect-ratio preserving resize to ensure responsive CPU latency
    resized_image, scale = ImageProcessor.resize_with_aspect_ratio(
        image, max_dim=settings.MAX_IMAGE_DIM
    )
    frame_h, frame_w = resized_image.shape[:2]

    # 2. Run object detection
    detector = ObjectDetector()
    det_result = detector.detect(resized_image, conf_threshold=conf_threshold)
    raw_detections = det_result["raw_detections"]
    inference_time_ms = det_result["inference_time_ms"]

    # 2b. Run indoor closed door, curtain & wall barrier detection (complements COCO-80)
    barrier_detections = BarrierDetector.detect(resized_image, existing_detections=raw_detections)
    if barrier_detections:
        raw_detections.extend(barrier_detections)

    # 3. Spatial mapping, prominence estimation, and prioritization
    prioritized_detections, _ = Prioritizer.prioritize(
        raw_detections=raw_detections,
        frame_width=frame_w,
        frame_height=frame_h,
        max_items=settings.MAX_OBSERVATIONS_PER_FRAME
    )

    # 4. Temporal tracking and cooldown-filtered announcement filtering
    tracker = TemporalTracker()
    tracked_detections, new_announcements, speech_text = tracker.update(prioritized_detections)

    # 5. Safe Walking Path and Corridor Navigation analysis
    nav_guidance = NavigationEngine.analyze(
        detections=tracked_detections,
        frame_width=frame_w,
        frame_height=frame_h
    )

    # 6. Optional visual annotation overlay
    annotated_b64: Optional[str] = None
    if return_annotated:
        annotated_img = ImageProcessor.draw_detections(resized_image, tracked_detections)
        annotated_b64 = ImageProcessor.encode_to_base64_jpeg(annotated_img, quality=80)

    total_time_ms = round((time.perf_counter() - start_total) * 1000, 2)

    return InspectionResponse(
        success=True,
        frame_width=frame_w,
        frame_height=frame_h,
        inference_time_ms=inference_time_ms,
        total_time_ms=total_time_ms,
        total_detected_count=len(raw_detections),
        prioritized_count=len(tracked_detections),
        detections=tracked_detections,
        prioritized_detections=tracked_detections,
        speech_text=speech_text,
        announcement=speech_text,
        new_announcements=new_announcements,
        annotated_image=annotated_b64,
        annotated_image_base64=annotated_b64,
        navigation=nav_guidance,
        message="Frame successfully inspected."
    )


@router.post("/inspect", response_model=InspectionResponse)
async def inspect_multipart_frame(
    file: UploadFile = File(..., description="Camera frame image file (JPEG, PNG, WebP)"),
    return_annotated: bool = Query(True, description="Whether to include base64 visual debug overlay"),
    confidence_threshold: Optional[float] = Query(None, ge=0.05, le=0.95, description="Confidence override")
):
    """
    Inspect a camera frame sent via standard multipart/form-data file upload.
    Ideal for direct browser file or blob streaming.
    """
    try:
        file_bytes = await file.read()
        image = ImageProcessor.decode_from_bytes(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload handling failed: {str(e)}")

    return _process_frame(
        image=image,
        conf_threshold=confidence_threshold,
        return_annotated=return_annotated
    )


@router.post("/inspect-json", response_model=InspectionResponse)
async def inspect_json_frame(
    payload: InspectionRequest = Body(..., description="JSON payload containing base64 image string")
):
    """
    Inspect a camera frame sent as a base64 encoded string within JSON.
    Useful for HTML5 canvas capture `toDataURL()`.
    """
    if not payload.image_base64:
        raise HTTPException(status_code=400, detail="Missing required field: image_base64")

    try:
        image = ImageProcessor.decode_from_base64(payload.image_base64)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Base64 processing failed: {str(e)}")

    return _process_frame(
        image=image,
        conf_threshold=payload.confidence_threshold,
        return_annotated=payload.return_annotated_image
    )
