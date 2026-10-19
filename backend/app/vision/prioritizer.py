"""
VisionMate - Detection Prioritizer
File: backend/app/vision/prioritizer.py

Purpose:
- Converts raw bounding boxes into spatial zones (left, center, right).
- Calculates relative visual prominence (bounding box area ratio) without making uncalibrated distance claims.
- Ranks detected objects based on obstacle hazard level, path proximity, and confidence.
- Synthesizes concise natural phrasing tailored for assistive speech delivery.
"""

from typing import List, Dict, Any, Tuple
from backend.app.config import settings
from backend.app.schemas.detection import (
    BoundingBox,
    SpatialPosition,
    ProminenceLevel,
    DetectionItem
)


class Prioritizer:
    """Ranks and formats detected objects for accessible audio delivery."""

    @staticmethod
    def calculate_spatial_position(x_center: float, frame_width: int) -> SpatialPosition:
        """
        Classifies horizontal position into three equal sectors:
        - Left: 0% - 33%
        - Center: 33% - 66%
        - Right: 66% - 100%
        """
        ratio = x_center / max(1, frame_width)
        if ratio < 0.33:
            return SpatialPosition.LEFT
        elif ratio > 0.66:
            return SpatialPosition.RIGHT
        else:
            return SpatialPosition.CENTER

    @staticmethod
    def calculate_prominence(area_ratio: float) -> ProminenceLevel:
        """
        Assigns relative visual prominence based on bounding box area ratio.
        Crucial Safety Rule: We describe visual scale/prominence honestly,
        never claiming calibrated metric distances without specialized depth sensors.
        """
        if area_ratio > 0.20:
            return ProminenceLevel.PROMINENT
        elif area_ratio > 0.05:
            return ProminenceLevel.MID_RANGE
        else:
            return ProminenceLevel.DISTANT

    @classmethod
    def prioritize(
        cls, 
        raw_detections: List[Dict[str, Any]], 
        frame_width: int, 
        frame_height: int,
        max_items: int = settings.MAX_OBSERVATIONS_PER_FRAME
    ) -> Tuple[List[DetectionItem], str]:
        """
        Ranks raw detections, filters low-priority clutter, and produces
        top observations and a concise speech string.
        """
        if not raw_detections:
            return [], "No prominent objects detected ahead."

        frame_area = max(1, frame_width * frame_height)
        scored_items = []

        for item in raw_detections:
            x1, y1, x2, y2 = item["box"]
            box_w = max(1, x2 - x1)
            box_h = max(1, y2 - y1)
            box_area = box_w * box_h
            area_ratio = box_area / frame_area

            x_center = x1 + (box_w / 2.0)
            spatial_pos = cls.calculate_spatial_position(x_center, frame_width)
            prominence = cls.calculate_prominence(area_ratio)

            is_priority = item["label"] in settings.HIGH_PRIORITY_CLASSES

            # Priority scoring heuristic:
            # - High priority classes (people, vehicles, obstacles) +2.5
            # - Center position (directly in forward path) +1.5
            # - Prominence (larger screen occupation / closer visual scale) +2.0 / +1.0
            # - Confidence score +0.0 to 1.0
            score = 0.0
            if is_priority:
                score += 2.5
            if spatial_pos == SpatialPosition.CENTER:
                score += 1.5
            if prominence == ProminenceLevel.PROMINENT:
                score += 2.0
            elif prominence == ProminenceLevel.MID_RANGE:
                score += 1.0
            score += item["confidence"]

            # Concise verbal description for this specific item
            item_desc = f"{item['label']} {spatial_pos.value}"
            if prominence == ProminenceLevel.PROMINENT:
                item_desc += " (close)"

            scored_items.append((score, {
                "label": item["label"],
                "confidence": item["confidence"],
                "box": BoundingBox(
                    x1=x1, y1=y1, x2=x2, y2=y2,
                    width=box_w, height=box_h, area=box_area
                ),
                "position": spatial_pos,
                "prominence": prominence,
                "area_ratio": round(area_ratio, 4),
                "is_priority": is_priority,
                "description": item_desc
            }))

        # Sort descending by priority score
        scored_items.sort(key=lambda x: x[0], reverse=True)

        # Select top N items
        selected_candidates = scored_items[:max_items]

        detection_items: List[DetectionItem] = []
        speech_phrases: List[str] = []

        for idx, (_, data) in enumerate(selected_candidates):
            det = DetectionItem(id=idx + 1, **data)
            detection_items.append(det)
            speech_phrases.append(f"{det.label} {det.position.value}")

        # Construct concise synthesized announcement
        if not speech_phrases:
            speech_text = "No prominent objects detected ahead."
        else:
            speech_text = "Ahead: " + ", ".join(speech_phrases) + "."

        return detection_items, speech_text
