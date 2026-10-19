"""
VisionMate - Safe Path Navigation Engine Unit Tests
File: backend/tests/test_navigation.py

Tests:
1. Empty scene -> Path clear forward (STRAIGHT)
2. Obstacle in Center corridor -> Veer Right when Right is clear
3. Obstacle in Center and Right -> Veer Left
4. Obstacle in all corridors -> Stop
5. Low obstacle near feet -> Urgent hazard warning
"""

import pytest
from backend.app.schemas.detection import (
    DetectionItem,
    BoundingBox,
    SpatialPosition,
    ProminenceLevel
)
from backend.app.schemas.navigation import (
    CorridorStatus,
    NavigationAction
)
from backend.app.vision.navigation import NavigationEngine


def make_detection(
    item_id: int,
    label: str,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    frame_w: int = 1000,
    frame_h: int = 1000,
    prominence: ProminenceLevel = ProminenceLevel.PROMINENT
) -> DetectionItem:
    w = x2 - x1
    h = y2 - y1
    area = w * h
    area_ratio = area / float(frame_w * frame_h)
    x_c = (x1 + x2) / 2.0

    if x_c < frame_w * 0.35:
        pos = SpatialPosition.LEFT
    elif x_c > frame_w * 0.65:
        pos = SpatialPosition.RIGHT
    else:
        pos = SpatialPosition.CENTER

    return DetectionItem(
        id=item_id,
        label=label,
        confidence=0.9,
        box=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, width=w, height=h, area=area),
        position=pos,
        prominence=prominence,
        area_ratio=round(area_ratio, 4),
        is_priority=True,
        description=f"{label} {pos.value}"
    )


class TestNavigationEngine:
    def test_clear_path_when_no_detections(self):
        guidance = NavigationEngine.analyze(
            detections=[],
            frame_width=1000,
            frame_height=1000
        )
        assert guidance.action == NavigationAction.STRAIGHT
        assert guidance.center_clear is True
        assert guidance.safe_corridor == "center"
        assert "Path clear" in guidance.guidance_speech

    def test_veer_right_when_center_blocked_by_chair(self):
        # Chair blocking center corridor (x1=380, x2=620)
        chair = make_detection(
            item_id=1,
            label="chair",
            x1=380,
            y1=400,
            x2=620,
            y2=800,
            prominence=ProminenceLevel.PROMINENT
        )
        guidance = NavigationEngine.analyze(
            detections=[chair],
            frame_width=1000,
            frame_height=1000
        )
        assert guidance.center_clear is False
        assert guidance.corridors["center"].status != CorridorStatus.CLEAR
        assert guidance.action in (NavigationAction.VEER_RIGHT, NavigationAction.VEER_LEFT)
        assert "chair" in guidance.guidance_speech.lower()

    def test_veer_left_when_center_and_right_blocked(self):
        # Center blocked by chair, right blocked by table
        chair = make_detection(1, "chair", 400, 400, 600, 750)
        table = make_detection(2, "dining table", 700, 400, 950, 800)

        guidance = NavigationEngine.analyze(
            detections=[chair, table],
            frame_width=1000,
            frame_height=1000
        )
        assert guidance.action == NavigationAction.VEER_LEFT
        assert guidance.safe_corridor == "left"
        assert guidance.corridors["left"].status == CorridorStatus.CLEAR

    def test_stop_when_all_corridors_blocked(self):
        # Left couch, center person, right table
        couch = make_detection(1, "couch", 50, 400, 320, 850)
        person = make_detection(2, "person", 380, 200, 620, 900)
        table = make_detection(3, "dining table", 680, 400, 950, 850)

        guidance = NavigationEngine.analyze(
            detections=[couch, person, table],
            frame_width=1000,
            frame_height=1000
        )
        assert guidance.action == NavigationAction.STOP
        assert guidance.safe_corridor == "none"
        assert "Stop" in guidance.guidance_speech

    def test_urgent_hazard_near_foot_level(self):
        # Backpack right in front of feet (y2 = 920 on 1000 height frame)
        backpack = make_detection(
            1, "backpack", 400, 700, 600, 920,
            prominence=ProminenceLevel.PROMINENT
        )
        guidance = NavigationEngine.analyze(
            detections=[backpack],
            frame_width=1000,
            frame_height=1000
        )
        assert guidance.urgent_hazard is not None
        assert "foot level" in guidance.urgent_hazard.lower()

    def test_closed_door_blocks_path_and_gives_clear_guidance(self):
        door = make_detection(
            1, "closed door", 200, 50, 800, 900,
            prominence=ProminenceLevel.PROMINENT
        )
        guidance = NavigationEngine.analyze(
            detections=[door],
            frame_width=1000,
            frame_height=1000
        )
        assert guidance.center_clear is False
        assert "door" in guidance.guidance_speech.lower()
        assert guidance.obstacle_explanation is not None
        assert "door" in guidance.obstacle_explanation.lower()
        assert len(guidance.next_steps) > 0

    def test_closed_curtain_blocks_path_and_gives_clear_guidance(self):
        curtain = make_detection(
            1, "closed curtain", 150, 50, 850, 900,
            prominence=ProminenceLevel.PROMINENT
        )
        guidance = NavigationEngine.analyze(
            detections=[curtain],
            frame_width=1000,
            frame_height=1000
        )
        assert guidance.center_clear is False
        assert "curtain" in guidance.guidance_speech.lower()
        assert guidance.obstacle_explanation is not None
        assert "curtain" in guidance.obstacle_explanation.lower()
        assert len(guidance.next_steps) > 0

