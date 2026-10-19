"""
VisionMate - Configuration Module
File: backend/app/config.py

Purpose:
- Centralized configuration management using pydantic-settings.
- Enforces typed environment variables with production-ready defaults.
- Sets thresholds for model confidence, spatial zones, frame sizes, and announcement cooldowns.
"""

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application Metadata
    PROJECT_NAME: str = "VisionMate - AI Visual Assistant"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    # Computer Vision & Detection Parameters
    MODEL_NAME: str = "yolov8n.pt"
    DEVICE: str = "cpu"  # 'cpu' or 'cuda'
    CONFIDENCE_THRESHOLD: float = 0.25   # Lowered for accessibility — captures more real objects
    IOU_THRESHOLD: float = 0.40
    MAX_IMAGE_DIM: int = 1024  # Max width/height to resize frames for CPU efficiency

    # Assistive Spatial & Cognitive Limits
    MAX_OBSERVATIONS_PER_FRAME: int = 6  # More objects = better spatial awareness for navigation
    COOLDOWN_SECONDS: float = 3.5        # Faster re-announcements in navigation mode
    
    # Priority Obstacles (Higher priority for immediate navigation awareness)
    HIGH_PRIORITY_CLASSES: List[str] = [
        "person", "car", "bus", "truck", "traffic light", "stop sign",
        "bicycle", "motorcycle", "dog", "fire hydrant", "chair",
        "couch", "dining table", "bed", "refrigerator", "toilet",
        "closed door", "door", "closed door / wall", "wall barrier",
        "closed curtain", "curtain", "curtains", "wall"
    ]

    # CORS Configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


# Instantiate a singleton settings instance
settings = Settings()
