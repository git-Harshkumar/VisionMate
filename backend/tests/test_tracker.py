"""
VisionMate - Temporal Tracker Unit Tests
File: backend/tests/test_tracker.py

Tests:
- IoU computation correctness.
- Track ID assignment on first detection.
- Track persistence across frames (same object, same track_id).
- Announcement suppression during cooldown window.
- Announcement triggered on position change.
- Announcement triggered on rapid approach (prominence escalation).
- Cooldown expiry re-enables announcement.
- Stale track removal after disappearance timeout.
"""

import time
import pytest

from backend.app.vision.tracker import TemporalTracker, compute_iou
from backend.app.schemas.detection import (
    DetectionItem, BoundingBox, SpatialPosition, ProminenceLevel
)


def make_detection(
    label: str,
    x1: int, y1: int, x2: int, y2: int,
    position: SpatialPosition = SpatialPosition.CENTER,
    prominence: ProminenceLevel = ProminenceLevel.MID_RANGE,
    confidence: float = 0.80,
    idx: int = 1,
    area_ratio: float = 0.10
) -> DetectionItem:
    """Helper to construct a DetectionItem for testing."""
    bw = max(1, x2 - x1)
    bh = max(1, y2 - y1)
    return DetectionItem(
        id=idx,
        label=label,
        confidence=confidence,
        box=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, width=bw, height=bh, area=bw * bh),
        position=position,
        prominence=prominence,
        area_ratio=area_ratio,
        is_priority=False,
        description=f"{label} {position.value}",
        track_id=None
    )


class TestIoU:
    def test_perfect_overlap(self):
        assert compute_iou((0, 0, 100, 100), (0, 0, 100, 100)) == 1.0

    def test_no_overlap(self):
        assert compute_iou((0, 0, 50, 50), (100, 100, 200, 200)) == 0.0

    def test_partial_overlap(self):
        iou = compute_iou((0, 0, 100, 100), (50, 50, 150, 150))
        # Intersection = 50x50 = 2500, Union = 10000+10000-2500 = 17500
        expected = 2500 / 17500
        assert abs(iou - expected) < 1e-6


class TestTemporalTracker:
    def setup_method(self):
        """Reset singleton between tests."""
        tracker = TemporalTracker()
        tracker.reset()

    def test_new_detection_gets_track_id(self):
        tracker = TemporalTracker()
        det = make_detection("person", 100, 50, 300, 400)
        updated, announcements, speech = tracker.update([det], current_time=0.0)

        assert updated[0].track_id is not None
        assert updated[0].track_id == 1
        assert len(announcements) == 1
        assert "person" in announcements[0]
        assert speech.startswith("Ahead:")

    def test_same_object_keeps_track_id_across_frames(self):
        tracker = TemporalTracker()

        # Frame 1 — initial detection
        det1 = make_detection("chair", 100, 100, 250, 350)
        updated1, _, _ = tracker.update([det1], current_time=0.0)
        track_id_1 = updated1[0].track_id

        # Frame 2 — slightly shifted box, same class (should match same track)
        det2 = make_detection("chair", 105, 105, 255, 355)
        updated2, _, _ = tracker.update([det2], current_time=0.2)
        track_id_2 = updated2[0].track_id

        assert track_id_1 == track_id_2, "Track ID must persist for the same object across frames"

    def test_cooldown_suppresses_duplicate_announcements(self):
        tracker = TemporalTracker()
        tracker.reset(cooldown_seconds=5.0)

        det = make_detection("person", 100, 50, 300, 400)
        _, _, _ = tracker.update([det], current_time=0.0)

        # Same object, same position, within cooldown window
        det2 = make_detection("person", 102, 52, 302, 402)
        _, announcements2, speech2 = tracker.update([det2], current_time=1.0)

        # Must be silenced — no new announcements
        assert len(announcements2) == 0
        assert speech2 == ""

    def test_position_change_breaks_cooldown(self):
        tracker = TemporalTracker()
        tracker.reset(cooldown_seconds=5.0)

        # Initial: person in center
        det1 = make_detection("person", 200, 50, 400, 400, position=SpatialPosition.CENTER)
        tracker.update([det1], current_time=0.0)

        # Frame 2: same person, now shifted LEFT — position break triggers announcement
        det2 = make_detection("person", 10, 50, 210, 400, position=SpatialPosition.LEFT)
        _, announcements, speech = tracker.update([det2], current_time=1.0)

        assert len(announcements) == 1
        assert "on the left" in announcements[0]

    def test_rapid_approach_breaks_cooldown(self):
        tracker = TemporalTracker()
        tracker.reset(cooldown_seconds=5.0)

        # Initial: person mid-range
        det1 = make_detection("person", 200, 100, 350, 350, prominence=ProminenceLevel.MID_RANGE)
        tracker.update([det1], current_time=0.0)

        # Frame 2: now prominent/close — proximity escalation triggers announcement
        det2 = make_detection("person", 100, 50, 520, 460, prominence=ProminenceLevel.PROMINENT)
        _, announcements, speech = tracker.update([det2], current_time=1.0)

        assert len(announcements) == 1
        assert "close" in announcements[0]

    def test_cooldown_expiry_re_announces(self):
        tracker = TemporalTracker()
        tracker.reset(cooldown_seconds=3.0)

        det = make_detection("car", 150, 100, 350, 350)
        tracker.update([det], current_time=0.0)

        # Still in cooldown
        det2 = make_detection("car", 152, 102, 352, 352)
        _, ann2, _ = tracker.update([det2], current_time=1.5)
        assert len(ann2) == 0

        # After cooldown expires
        det3 = make_detection("car", 154, 104, 354, 354)
        _, ann3, speech3 = tracker.update([det3], current_time=4.0)
        assert len(ann3) == 1
        assert "car" in ann3[0]

    def test_stale_track_removed_after_timeout(self):
        tracker = TemporalTracker()
        tracker.reset(cooldown_seconds=5.0, disappearance_timeout=2.0)

        # Initial detection
        det = make_detection("dog", 200, 200, 350, 350)
        tracker.update([det], current_time=0.0)
        assert 1 in tracker.tracks

        # Simulate frames where dog is not detected for > disappearance_timeout
        tracker.update([], current_time=3.0)  # 3s > 2s timeout

        assert 1 not in tracker.tracks, "Stale track should be removed after disappearance timeout"

    def test_multiple_new_objects_all_announced(self):
        tracker = TemporalTracker()
        tracker.reset(cooldown_seconds=5.0)
        dets = [
            make_detection("person", 50, 50, 200, 400, position=SpatialPosition.LEFT, idx=1),
            make_detection("car", 250, 100, 450, 350, position=SpatialPosition.CENTER, idx=2),
        ]
        _, announcements, speech = tracker.update(dets, current_time=0.0)

        assert len(announcements) == 2
        labels = " ".join(announcements)
        assert "person" in labels
        assert "car" in labels
        assert speech.startswith("Ahead:")
