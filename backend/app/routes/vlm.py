"""
VisionMate - VLM Route (Tier 2 Multimodal Query API)
File: backend/app/routes/vlm.py

Purpose:
- Handles conversational scene understanding and questions from the user via POST /api/v1/ask-vlm.
"""

from fastapi import APIRouter, HTTPException, status
from backend.app.schemas.vlm import VLMRequest, VLMResponse
from backend.app.vision.vlm import VLMService

router = APIRouter(tags=["Vision-Language Model (Tier 2)"])
vlm_service = VLMService()


@router.post(
    "/ask-vlm",
    response_model=VLMResponse,
    summary="Query Multimodal VLM for rich scene description or targeted questions",
    status_code=status.HTTP_200_OK
)
async def ask_vlm(request: VLMRequest) -> VLMResponse:
    if not request.image_base64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image base64 payload is required."
        )

    response = await vlm_service.query(
        image_base64=request.image_base64,
        prompt=request.prompt or "Describe this scene for a blind person.",
        intent=request.intent or "scene_description"
    )
    return response

