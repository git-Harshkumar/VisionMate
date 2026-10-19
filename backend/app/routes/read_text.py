"""
VisionMate - Read Text (OCR) Route
File: backend/app/routes/read_text.py

Purpose:
- Exposes the on-demand OCR endpoint, triggered explicitly by the user pressing "Read Text".
- Accepts multipart image upload or JSON base64 payload.
- Runs EasyOCR and returns structured text blocks + speech-ready announcement.
"""

import time
from typing import Optional
from fastapi import APIRouter, File, UploadFile, HTTPException, Body

from backend.app.schemas.ocr import OCRResponse
from backend.app.schemas.inspection import InspectionRequest
from backend.app.vision.image_processor import ImageProcessor
from backend.app.vision.ocr import OCRService

router = APIRouter(tags=["OCR"])


@router.post("/read-text", response_model=OCRResponse)
async def read_text_multipart(
    file: UploadFile = File(..., description="Camera frame image file (JPEG, PNG, WebP)")
):
    """
    Perform on-demand OCR on a multipart-uploaded camera frame.
    Triggered only when the user explicitly requests text reading.
    """
    try:
        file_bytes = await file.read()
        image = ImageProcessor.decode_from_bytes(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload handling failed: {str(e)}")

    ocr_service = OCRService()
    return ocr_service.read_text(image)


@router.post("/read-text-json", response_model=OCRResponse)
async def read_text_json(
    payload: InspectionRequest = Body(..., description="JSON payload containing base64 image string")
):
    """
    Perform on-demand OCR on a base64 encoded camera frame (JSON payload).
    """
    if not payload.image_base64:
        raise HTTPException(status_code=400, detail="Missing required field: image_base64")

    try:
        image = ImageProcessor.decode_from_base64(payload.image_base64)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Base64 processing failed: {str(e)}")

    ocr_service = OCRService()
    return ocr_service.read_text(image)
