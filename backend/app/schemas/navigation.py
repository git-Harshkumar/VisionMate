"""
VisionMate - Safe Path & Navigation Schemas
File: backend/app/schemas/navigation.py

Purpose:
- Models corridor clearance (left, center, right), safe walking directions,
  and actionable assistive navigation guidance for visually impaired individuals.
"""

from enum import Enum
from typing import List, Dict, Optional
from pydantic import BaseModel, Field


class CorridorStatus(str, Enum):
    CLEAR = "clear"
    CAUTION = "caution"
    BLOCKED = "blocked"


class NavigationAction(str, Enum):
    STRAIGHT = "straight"
    VEER_LEFT = "veer_left"
    VEER_RIGHT = "veer_right"
    STOP = "stop"


class CorridorDetail(BaseModel):
    name: str = Field(..., description="Corridor sector identifier (left, center, right)")
    status: CorridorStatus = Field(..., description="Clearance status")
    clearance_score: float = Field(..., ge=0.0, le=1.0, description="Clearance metric (1.0 = empty, 0.0 = impassable)")
    obstacles: List[str] = Field(default_factory=list, description="Obstacle labels detected inside this sector")


class NavigationGuidance(BaseModel):
    action: NavigationAction = Field(..., description="Recommended navigation maneuver")
    guidance_speech: str = Field(..., description="Actionable concise speech string (e.g. 'Path clear forward', 'Obstacle ahead: chair, veer right')")
    center_clear: bool = Field(..., description="Whether forward walking path is unimpeded")
    safe_corridor: str = Field(..., description="Recommended safe walking sector ('center', 'left', 'right', 'none')")
    corridors: Dict[str, CorridorDetail] = Field(..., description="Clearance details for left, center, right corridors")
    urgent_hazard: Optional[str] = Field(None, description="Immediate ground or proximity hazard within 1-2 meters")
    primary_obstacle: Optional[str] = Field(None, description="Main obstacle causing path blockage")
    obstacle_explanation: Optional[str] = Field(None, description="Plain English description of what is ahead and why to maneuver")
    next_steps: List[str] = Field(default_factory=list, description="Actionable numbered steps for the user")
