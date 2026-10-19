"""
VisionMate - Temporal Object Tracker & Announcement Cooldown Manager
File: backend/app/vision/tracker.py

Purpose:
- Associates object detections across video frames using IoU (Intersection-over-Union).
- Assigns persistent tracking IDs to objects in the user's field of view.
- Prevents auditory fatigue and cognitive overload by suppressing repetitive announcements.
- Ensures critical safety alerts (new obstacles, direction shifts, rapid proximity changes) break through immediately.
"""

from dataclasses import dataclass
import threading
import time
from typing import List, Dict, Tuple, Optional
from backend.app.config import settings
from backend.app.schemas.detection import (
    DetectionItem,
    SpatialPosition,
    ProminenceLevel
)


def compute_iou(
    box1: Tuple[int, int, int, int], 
    box2: Tuple[int, int, int, int]
) -> float:
    """
    Computes Intersection-over-Union (IoU) between two bounding boxes: (x1, y1, x2, y2).
    Returns a float between 0.0 and 1.0.
    """
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    inter_width = max(0, x2 - x1)
    inter_height = max(0, y2 - y1)
    inter_area = inter_width * inter_height

    area1 = max(1, (box1[2] - box1[0]) * (box1[3] - box1[1]))
    area2 = max(1, (box2[2] - box2[0]) * (box2[3] - box2[1]))
    union_area = area1 + area2 - inter_area

    return float(inter_area) / float(union_area) if union_area > 0 else 0.0


@dataclass
class TrackedObject:
    """Internal state representation for an actively tracked object."""
    track_id: int
    label: str
    box: Tuple[int, int, int, int]
    position: SpatialPosition
    prominence: ProminenceLevel
    last_seen: float
    last_announced: float = -1.0   # -1.0 sentinel = never announced
    last_announced_position: Optional[SpatialPosition] = None
    last_announced_prominence: Optional[ProminenceLevel] = None
    consecutive_frames: int = 1


class TemporalTracker:
    """
    Maintains temporal continuity across consecutive frames and applies
    intelligent auditory cooldown filtering to prevent user fatigue.
    """

    _instance: Optional["TemporalTracker"] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(TemporalTracker, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(
        self,
        cooldown_seconds: float = settings.COOLDOWN_SECONDS,
        disappearance_timeout: float = 2.5,
        iou_threshold: float = 0.30
    ):
        if self._initialized:
            return

        self.cooldown_seconds = cooldown_seconds
        self.disappearance_timeout = disappearance_timeout
        self.iou_threshold = iou_threshold
        self.tracks: Dict[int, TrackedObject] = {}
        self._next_id: int = 1
        self._track_lock = threading.Lock()
        self._initialized = True

    def reset(
        self,
        cooldown_seconds: Optional[float] = None,
        disappearance_timeout: Optional[float] = None,
        iou_threshold: Optional[float] = None
    ):
        """Resets all tracked state and optionally reconfigures parameters. Use in tests for isolation."""
        with self._track_lock:
            self.tracks.clear()
            self._next_id = 1
            if cooldown_seconds is not None:
                self.cooldown_seconds = cooldown_seconds
            if disappearance_timeout is not None:
                self.disappearance_timeout = disappearance_timeout
            if iou_threshold is not None:
                self.iou_threshold = iou_threshold

    def update(
        self,
        detections: List[DetectionItem],
        current_time: Optional[float] = None
    ) -> Tuple[List[DetectionItem], List[str], str]:
        """
        Updates tracks with current frame detections and determines announcement speech.

        Returns:
            (updated_detections, new_announcement_items, speech_text)
            - updated_detections: Detections populated with persistent track_ids.
            - new_announcement_items: List of individual verbal phrases that qualified for speech.
            - speech_text: Concise synthesized sentence, or empty string "" if silenced by cooldown.
        """
        now = current_time if current_time is not None else time.time()

        with self._track_lock:
            # 1. Purge stale tracks exceeding disappearance timeout
            active_ids = list(self.tracks.keys())
            for tid in active_ids:
                if (now - self.tracks[tid].last_seen) > self.disappearance_timeout:
                    del self.tracks[tid]

            # 2. Match detections with existing tracks
            unmatched_tracks = set(self.tracks.keys())
            matched_detection_tracks: Dict[int, int] = {}  # detection index -> track_id

            # Calculate pairwise IoU for matching classes
            candidates: List[Tuple[float, int, int]] = []
            for det_idx, det in enumerate(detections):
                det_box = (det.box.x1, det.box.y1, det.box.x2, det.box.y2)
                for tid in unmatched_tracks:
                    trk = self.tracks[tid]
                    if trk.label == det.label:
                        iou = compute_iou(det_box, trk.box)
                        if iou >= self.iou_threshold:
                            candidates.append((iou, det_idx, tid))

            # Sort candidate pairs by IoU descending (greedy matching)
            candidates.sort(key=lambda x: x[0], reverse=True)
            claimed_dets = set()
            claimed_tracks = set()

            for iou, det_idx, tid in candidates:
                if det_idx not in claimed_dets and tid not in claimed_tracks:
                    claimed_dets.add(det_idx)
                    claimed_tracks.add(tid)
                    matched_detection_tracks[det_idx] = tid

            # 3. Update existing tracks or instantiate new tracks
            new_announcements: List[str] = []

            for det_idx, det in enumerate(detections):
                det_box = (det.box.x1, det.box.y1, det.box.x2, det.box.y2)

                if det_idx in matched_detection_tracks:
                    # Update matched track
                    tid = matched_detection_tracks[det_idx]
                    trk = self.tracks[tid]
                    trk.box = det_box
                    trk.last_seen = now
                    trk.consecutive_frames += 1
                    
                    old_pos = trk.position
                    old_prom = trk.prominence
                    trk.position = det.position
                    trk.prominence = det.prominence
                else:
                    # Create new track
                    tid = self._next_id
                    self._next_id += 1
                    trk = TrackedObject(
                        track_id=tid,
                        label=det.label,
                        box=det_box,
                        position=det.position,
                        prominence=det.prominence,
                        last_seen=now,
                        last_announced=0.0
                    )
                    self.tracks[tid] = trk
                    old_pos = None
                    old_prom = None

                det.track_id = tid

                # 4. Evaluate Cooldown and Announcement Triggers
                should_announce = False
                trigger_reason = ""

                # Trigger Condition A: First-time detection (sentinel -1.0 = never announced)
                if trk.last_announced < 0:
                    should_announce = True
                    trigger_reason = "initial_detection"
                # Trigger Condition B: Spatial shift (moved into a different sector)
                elif trk.last_announced_position != det.position:
                    should_announce = True
                    trigger_reason = "position_shift"
                # Trigger Condition C: Escalated prominence (approaching rapidly into close range)
                elif (
                    trk.last_announced_prominence != ProminenceLevel.PROMINENT
                    and det.prominence == ProminenceLevel.PROMINENT
                ):
                    should_announce = True
                    trigger_reason = "rapid_approach"
                # Trigger Condition D: Cooldown expired (strictly > cooldown window)
                elif (now - trk.last_announced) >= self.cooldown_seconds:
                    should_announce = True
                    trigger_reason = "cooldown_expired"

                if should_announce:
                    phrase = f"{det.label} {det.position.value}"
                    if det.prominence == ProminenceLevel.PROMINENT:
                        phrase += " (close)"
                    new_announcements.append(phrase)

                    # Mark announced timestamp and state
                    trk.last_announced = now
                    trk.last_announced_position = det.position
                    trk.last_announced_prominence = det.prominence

            # 5. Formulate synthesized speech
            if new_announcements:
                speech_text = "Ahead: " + ", ".join(new_announcements) + "."
            else:
                # Deliberately silent to prevent user auditory fatigue
                speech_text = ""

            return detections, new_announcements, speech_text
