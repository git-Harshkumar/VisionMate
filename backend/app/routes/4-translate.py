"""
VisionMate - Translation Route
File: backend/app/routes/translate.py

Purpose:
- Handles POST /api/v1/translate for localizing open-ended spoken text into the
  user's selected speech language. Bounded navigation warnings are translated
  deterministically inside the inspection pipeline instead (no network delay).
"""

from fastapi import APIRouter, HTTPException, status
from backend.app.schemas.translate import TranslateRequest, TranslateResponse
from backend.app.vision.translator import TranslatorService

router = APIRouter(tags=["Translation"])
translator_service = TranslatorService()


@router.post(
    "/translate",
    response_model=TranslateResponse,
    summary="Translate open-ended spoken text into the selected speech language",
    status_code=status.HTTP_200_OK
)
async def translate_text(request: TranslateRequest) -> TranslateResponse:
    if request.text is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'text' is required."
        )
    return await translator_service.translate(
        text=request.text,
        target_language=request.target_language
    )
