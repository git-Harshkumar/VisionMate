"""
VisionMate - Safe Path & Navigation Engine
File: backend/app/vision/navigation.py

Purpose:
- Evaluates 3-zone walking corridors (Left, Center, Right) from real-time detections.
- Detects immediate floor/trip hazards based on bounding box geometry and proximity.
- Calculates corridor clearance metrics and determines safe steering actions
  (Straight, Veer Right, Veer Left, Stop + actionable next steps).
- Generates natural, understandable audio guidance tailored for visually impaired mobility.
- Explains WHAT is ahead, WHY to stop/maneuver, and gives NUMBERED next steps.
- Handles closed doors and wall barriers explicitly.
- Speaks guidance in the user's selected language. Spoken guidance is generated
  deterministically from bilingual templates (English and Hindi), so safety-critical
  warnings never wait on a cloud translation and never silently fall back to the
  wrong language. On-screen explanations and next steps remain in English.
"""

from typing import List, Dict, Tuple, Optional
from backend.app.schemas.detection import DetectionItem, ProminenceLevel
from backend.app.schemas.navigation import (
    CorridorStatus,
    NavigationAction,
    CorridorDetail,
    NavigationGuidance
)


# ── Classes that physically impede walking ──
# Includes standard indoor furniture/obstacles + custom detected barriers (doors, curtains, walls)
INDOOR_OBSTACLE_CLASSES = {
    "closed door", "door", "closed door / wall", "wall barrier",
    "closed curtain", "curtain", "curtains", "wall",
    "person", "chair", "couch", "bed", "dining table", "bench",
    "potted plant", "refrigerator", "toilet", "tv",
    "dog", "cat", "suitcase", "backpack", "sports ball",
    "bicycle", "car", "motorcycle", "bus", "truck",
    "umbrella", "handbag", "clock", "vase",
    "laptop", "keyboard", "mouse", "remote", "bottle",
    "cup", "bowl", "book", "teddy bear", "fire hydrant"
}

# High urgency classes warranting immediate intervention
HIGH_DANGER_CLASSES = {
    "closed door", "closed door / wall", "wall barrier",
    "closed curtain", "curtain", "curtains", "wall",
    "person", "car", "bus", "truck", "motorcycle", "bicycle", "dog"
}

# ── Hindi obstacle names for spoken guidance (keyed by lowercase detection label) ──
OBSTACLE_NAMES_HI = {
    "person": "व्यक्ति",
    "chair": "कुर्सी",
    "couch": "सोफ़ा",
    "bed": "बिस्तर",
    "dining table": "खाने की मेज़",
    "bench": "बेंच",
    "potted plant": "गमला",
    "refrigerator": "फ़्रिज",
    "toilet": "शौचालय",
    "tv": "टीवी",
    "dog": "कुत्ता",
    "cat": "बिल्ली",
    "suitcase": "सूटकेस",
    "backpack": "बैग",
    "sports ball": "गेंद",
    "bicycle": "साइकिल",
    "car": "गाड़ी",
    "motorcycle": "मोटरसाइकिल",
    "bus": "बस",
    "truck": "ट्रक",
    "umbrella": "छाता",
    "handbag": "हैंडबैग",
    "clock": "घड़ी",
    "vase": "फूलदान",
    "laptop": "लैपटॉप",
    "keyboard": "कीबोर्ड",
    "mouse": "माउस",
    "remote": "रिमोट",
    "bottle": "बोतल",
    "cup": "कप",
    "bowl": "कटोरा",
    "book": "किताब",
    "teddy bear": "खिलौना भालू",
    "fire hydrant": "फ़ायर हाइड्रेंट",
    "closed door": "बंद दरवाज़ा",
    "door": "दरवाज़ा",
    "closed door / wall": "बंद दरवाज़ा या दीवार",
    "wall barrier": "दीवार",
    "closed curtain": "बंद पर्दा",
    "curtain": "पर्दा",
    "curtains": "पर्दे",
    "wall": "दीवार",
    "obstacle": "रुकावट",
}

PROXIMITY_HI = {
    "very close": "बहुत पास",
    "nearby": "पास",
    "ahead": "आगे",
    "in the distance": "दूर",
}

# ── Bilingual spoken guidance templates: key -> (English, Hindi) ──
# English strings must stay identical to the original single-language output.
_SPEECH_TEMPLATES: Dict[str, Tuple[str, str]] = {
    "empty_clear": (
        "Path clear ahead. Walk forward slowly with your cane.",
        "रास्ता साफ़ है। धीरे-धीरे आगे बढ़ें और छड़ी से जाँचते रहें।",
    ),
    "curtain_caution_right": (
        "Caution! Closed curtains directly ahead. Step to your right where the passage is open.",
        "सावधान! ठीक सामने बंद पर्दे हैं। दाईं ओर कदम बढ़ाएँ, वहाँ रास्ता खुला है।",
    ),
    "curtain_caution_left": (
        "Caution! Closed curtains directly ahead. Step to your left where the passage is open.",
        "सावधान! ठीक सामने बंद पर्दे हैं। बाईं ओर कदम बढ़ाएँ, वहाँ रास्ता खुला है।",
    ),
    "curtain_stop": (
        "Stop immediately! Closed curtains directly in front of you. Stand still and probe ahead.",
        "तुरंत रुकें! बिल्कुल सामने बंद पर्दे हैं। स्थिर खड़े रहें और छड़ी से आगे जाँचें।",
    ),
    "door_caution_right": (
        "Caution! Closed door directly ahead. Step to your right where the passage is open.",
        "सावधान! ठीक सामने बंद दरवाज़ा है। दाईं ओर कदम बढ़ाएँ, वहाँ रास्ता खुला है।",
    ),
    "door_caution_left": (
        "Caution! Closed door directly ahead. Step to your left where the passage is open.",
        "सावधान! ठीक सामने बंद दरवाज़ा है। बाईं ओर कदम बढ़ाएँ, वहाँ रास्ता खुला है।",
    ),
    "door_stop": (
        "Stop immediately! Closed door directly in front of you. Stand still and probe ahead.",
        "तुरंत रुकें! बिल्कुल सामने बंद दरवाज़ा है। स्थिर खड़े रहें और आगे जाँचें।",
    ),
    "urgent_veer_right": (
        "Caution! {obs_cap} is very close at your feet. Step to your right to go around it.",
        "सावधान! {obs} आपके पैरों के बिल्कुल पास है। इससे बचने के लिए दाईं ओर कदम बढ़ाएँ।",
    ),
    "urgent_veer_left": (
        "Caution! {obs_cap} is very close at your feet. Step to your left to go around it.",
        "सावधान! {obs} आपके पैरों के बिल्कुल पास है। इससे बचने के लिए बाईं ओर कदम बढ़ाएँ।",
    ),
    "urgent_stop": (
        "Stop immediately! {obs_cap} is directly in front of your feet. Both sides are blocked. Stand still.",
        "तुरंत रुकें! {obs} बिल्कुल आपके पैरों के सामने है। दोनों ओर रास्ता बंद है। स्थिर खड़े रहें।",
    ),
    "straight_side_warnings": (
        "Walk straight ahead. Caution: {warnings}.",
        "सीधे आगे चलें। सावधान: {warnings}।",
    ),
    "straight_clear": (
        "Path is clear ahead. Safe to walk straight forward.",
        "आगे रास्ता साफ़ है। सीधे चलना सुरक्षित है।",
    ),
    "veer_right_both_open": (
        "Step to your right. {obs_cap} is {prox} in your center path, but your right side is open.",
        "दाईं ओर कदम बढ़ाएँ। {obs} आपके सीधे रास्ते में {prox} है, लेकिन दाईं ओर रास्ता खुला है।",
    ),
    "veer_left_both_open": (
        "Step to your left. {obs_cap} is {prox} in your center path, but your left side is open.",
        "बाईं ओर कदम बढ़ाएँ। {obs} आपके सीधे रास्ते में {prox} है, लेकिन बाईं ओर रास्ता खुला है।",
    ),
    "veer_right_only": (
        "Step to your right. {obs_cap} is {prox} blocking ahead, and your right side is clear.",
        "दाईं ओर कदम बढ़ाएँ। {obs} {prox} आगे रास्ता रोके हुए है, और दाईं ओर रास्ता साफ़ है।",
    ),
    "veer_left_only": (
        "Step to your left. {obs_cap} is {prox} blocking ahead, and your left side is clear.",
        "बाईं ओर कदम बढ़ाएँ। {obs} {prox} आगे रास्ता रोके हुए है, और बाईं ओर रास्ता साफ़ है।",
    ),
    "narrow_right": (
        "Move carefully to your right. {obs_cap} is {prox} blocking ahead. Narrow passage on the right.",
        "सावधानी से दाईं ओर बढ़ें। {obs} {prox} रास्ता रोके हुए है। दाईं ओर तंग रास्ता है।",
    ),
    "narrow_left": (
        "Move carefully to your left. {obs_cap} is {prox} blocking ahead. Narrow passage on the left.",
        "सावधानी से बाईं ओर बढ़ें। {obs} {prox} रास्ता रोके हुए है। बाईं ओर तंग रास्ता है।",
    ),
    "better_right": (
        "Move carefully to your right. {obs_cap} is {prox} blocking center, and the right side has more room.",
        "सावधानी से दाईं ओर बढ़ें। {obs} बीच के रास्ते में {prox} है, और दाईं ओर ज़्यादा जगह है।",
    ),
    "better_left": (
        "Move carefully to your left. {obs_cap} is {prox} blocking center, and the left side has more room.",
        "सावधानी से बाईं ओर बढ़ें। {obs} बीच के रास्ते में {prox} है, और बाईं ओर ज़्यादा जगह है।",
    ),
    "blocked_curtain": (
        "Stop! Closed curtains directly ahead, blocking your path. Stand still and probe ahead with your cane.",
        "रुकें! ठीक सामने बंद पर्दे रास्ता रोके हुए हैं। स्थिर खड़े रहें और छड़ी से आगे जाँचें।",
    ),
    "blocked_door": (
        "Stop! A closed door is directly ahead, blocking your path. Stand still and probe ahead.",
        "रुकें! ठीक सामने बंद दरवाज़ा रास्ता रोके हुए है। स्थिर खड़े रहें और आगे जाँचें।",
    ),
    "blocked_generic": (
        "Stop! Path blocked in all directions by {obs_str}. Stand still and use your cane to find a way around.",
        "रुकें! हर ओर रास्ता बंद है: {obs_str}। स्थिर खड़े रहें और छड़ी से निकलने का रास्ता खोजें।",
    ),
}


def _normalize_language(language: Optional[str]) -> str:
    """Maps any incoming language code to a supported guidance language."""
    if language and str(language).lower().startswith("hi"):
        return "hi"
    return "en"


def _speech(key: str, language: str, **params) -> str:
    """Renders a bilingual guidance template. Unknown params stay unused safely."""
    en, hi = _SPEECH_TEMPLATES[key]
    template = hi if language == "hi" else en
    return template.format(**params) if params else template


def _proximity_label(area_ratio: float, y2_ratio: float) -> str:
    """Returns a natural verbal proximity estimate from bounding box size and ground position."""
    if area_ratio > 0.32 or y2_ratio > 0.86:
        return "very close"
    elif area_ratio > 0.16 or y2_ratio > 0.68:
        return "nearby"
    elif area_ratio > 0.05:
        return "ahead"
    else:
        return "in the distance"


def _format_obstacle_name(label: str) -> str:
    """Formats raw label into natural speech (e.g. 'closed door / wall' -> 'closed door or wall')."""
    cleaned = label.lower().replace("/", " or ").strip()
    if "curtain" in cleaned:
        return "closed curtains"
    if cleaned in ("chair", "couch", "table", "person", "bed", "bench", "door", "closed door", "dog", "cat"):
        return f"a {cleaned}"
    elif cleaned.startswith("a ") or cleaned.startswith("an "):
        return cleaned
    return cleaned


def _obstacle_name_hi(label: str) -> str:
    """Returns the Hindi spoken name for a detection label (falls back to the raw label)."""
    return OBSTACLE_NAMES_HI.get(label.lower().strip(), label)


class NavigationEngine:
    """Evaluates walkable corridors and generates safe path navigation instructions."""

    CORRIDOR_RATIOS = {
        "left":   (0.0,  0.35),
        "center": (0.35, 0.65),
        "right":  (0.65, 1.0)
    }

    @classmethod
    def analyze(
        cls,
        detections: List[DetectionItem],
        frame_width: int,
        frame_height: int,
        language: str = "en"
    ) -> NavigationGuidance:
        """
        Analyzes detected objects, checks corridor clearances, and produces
        actionable navigation directions with clear explanations and next steps.
        Spoken guidance (guidance_speech) is rendered in the requested language
        ("en" or "hi"); explanations and next steps stay in English.
        """
        language = _normalize_language(language)
        w = max(1, frame_width)
        h = max(1, frame_height)

        # ── Empty scene: no obstacles detected ──
        if not detections:
            empty_corridors = {
                name: CorridorDetail(
                    name=name,
                    status=CorridorStatus.CLEAR,
                    clearance_score=1.0,
                    obstacles=[]
                )
                for name in ("left", "center", "right")
            }
            return NavigationGuidance(
                action=NavigationAction.STRAIGHT,
                guidance_speech=_speech("empty_clear", language),
                center_clear=True,
                safe_corridor="center",
                corridors=empty_corridors,
                urgent_hazard=None,
                primary_obstacle=None,
                obstacle_explanation="No objects detected ahead. Path appears visually open. Use your cane to check for steps, closed doors, or walls.",
                next_steps=[
                    "Walk forward at a calm, comfortable pace.",
                    "Keep sweeping your cane side to side at ground level."
                ]
            )

        corridor_bounds = {
            name: (start_r * w, end_r * w)
            for name, (start_r, end_r) in cls.CORRIDOR_RATIOS.items()
        }

        corridor_penalties: Dict[str, float] = {"left": 0.0, "center": 0.0, "right": 0.0}
        corridor_obstacles: Dict[str, List[str]] = {"left": [], "center": [], "right": []}

        urgent_hazard: Optional[str] = None
        primary_obstacle: Optional[str] = None
        primary_proximity: str = "ahead"
        max_penalty = -1.0

        for det in detections:
            box = det.box
            box_x_center = (box.x1 + box.x2) / 2.0
            box_bottom_ratio = box.y2 / float(h)
            area_ratio = box.area / float(w * h) if (w * h) > 0 else 0.0
            det_label = det.label.lower()
            is_obstacle_class = det_label in INDOOR_OBSTACLE_CLASSES
            is_high_danger = det_label in HIGH_DANGER_CLASSES

            # Prominence penalty weight
            prominence_weight = (
                0.70 if det.prominence == ProminenceLevel.PROMINENT
                else 0.35 if det.prominence == ProminenceLevel.MID_RANGE
                else 0.15
            )

            # Ground proximity multiplier — objects near bottom of frame are close to user's feet
            ground_multiplier = 1.0
            if box_bottom_ratio > 0.80:
                ground_multiplier = 1.8
                if is_obstacle_class and (box_bottom_ratio > 0.85 or det.prominence == ProminenceLevel.PROMINENT):
                    if not urgent_hazard:
                        prox = _proximity_label(area_ratio, box_bottom_ratio)
                        urgent_hazard = f"{det.label} {prox} at foot level"
            elif box_bottom_ratio > 0.65:
                ground_multiplier = 1.4

            danger_mult = 1.45 if is_high_danger else 1.0
            item_penalty = prominence_weight * ground_multiplier * danger_mult * (
                1.35 if is_obstacle_class else 0.6
            )

            if item_penalty > max_penalty and is_obstacle_class:
                max_penalty = item_penalty
                primary_obstacle = det.label
                primary_proximity = _proximity_label(area_ratio, box_bottom_ratio)

            # Check overlap with each corridor zone
            for c_name, (c_start, c_end) in corridor_bounds.items():
                overlap = max(0.0, min(box.x2, c_end) - max(box.x1, c_start))
                c_width = c_end - c_start
                overlap_ratio = overlap / max(1.0, c_width)

                if overlap_ratio >= 0.15 or (c_start <= box_x_center <= c_end and overlap > 0):
                    corridor_penalties[c_name] += item_penalty * max(0.4, overlap_ratio)
                    if det.label not in corridor_obstacles[c_name]:
                        corridor_obstacles[c_name].append(det.label)

        # Build corridor details
        corridors: Dict[str, CorridorDetail] = {}
        for c_name in ("left", "center", "right"):
            penalty = corridor_penalties[c_name]
            clearance = max(0.0, min(1.0, 1.0 - penalty))

            if clearance >= 0.68:
                status = CorridorStatus.CLEAR
            elif clearance >= 0.32:
                status = CorridorStatus.CAUTION
            else:
                status = CorridorStatus.BLOCKED

            corridors[c_name] = CorridorDetail(
                name=c_name,
                status=status,
                clearance_score=round(clearance, 2),
                obstacles=corridor_obstacles[c_name]
            )

        action, safe_corridor, guidance_speech, explanation, next_steps = cls._decide_maneuver(
            corridors=corridors,
            urgent_hazard=urgent_hazard,
            primary_obstacle=primary_obstacle,
            primary_proximity=primary_proximity,
            language=language
        )

        return NavigationGuidance(
            action=action,
            guidance_speech=guidance_speech,
            center_clear=(corridors["center"].status == CorridorStatus.CLEAR),
            safe_corridor=safe_corridor,
            corridors=corridors,
            urgent_hazard=urgent_hazard,
            primary_obstacle=primary_obstacle,
            obstacle_explanation=explanation,
            next_steps=next_steps
        )

    @classmethod
    def _decide_maneuver(
        cls,
        corridors: Dict[str, CorridorDetail],
        urgent_hazard: Optional[str],
        primary_obstacle: Optional[str],
        primary_proximity: str = "ahead",
        language: str = "en"
    ) -> Tuple[NavigationAction, str, str, str, List[str]]:
        """
        Determines the safest maneuver, concise speech, detailed explanation of WHAT and WHY,
        and actionable numbered next steps for the blind user. Spoken guidance follows the
        requested language; explanations and next steps remain English for the on-screen card.
        """
        center = corridors["center"]
        left = corridors["left"]
        right = corridors["right"]

        raw_obs = primary_obstacle if primary_obstacle else "obstacle"
        if language == "hi":
            obs = _obstacle_name_hi(raw_obs)
            obs_cap = obs
            prox = PROXIMITY_HI.get(primary_proximity, primary_proximity)
        else:
            obs = _format_obstacle_name(raw_obs)
            obs_cap = obs.capitalize()
            prox = primary_proximity
        is_door = "door" in raw_obs.lower() or "wall" in raw_obs.lower()
        is_curtain = "curtain" in raw_obs.lower()

        # ── 1. URGENT FOOT-LEVEL OR PROXIMITY HAZARD ──
        if urgent_hazard and center.status != CorridorStatus.CLEAR:
            if is_curtain:
                # Closed curtains directly in front
                if right.status == CorridorStatus.CLEAR:
                    return (
                        NavigationAction.VEER_RIGHT, "right",
                        _speech("curtain_caution_right", language),
                        "Closed curtains are blocking your center path very close ahead. The right side is clear.",
                        ["Step one or two paces to your right.", "Sweep your cane on your right side to confirm the opening.", "Proceed forward slowly."]
                    )
                elif left.status == CorridorStatus.CLEAR:
                    return (
                        NavigationAction.VEER_LEFT, "left",
                        _speech("curtain_caution_left", language),
                        "Closed curtains are blocking your center path very close ahead. The left side is clear.",
                        ["Step one or two paces to your left.", "Sweep your cane on your left side to confirm the opening.", "Proceed forward slowly."]
                    )
                else:
                    return (
                        NavigationAction.STOP, "none",
                        _speech("curtain_stop", language),
                        "Closed curtains are right in front of you blocking your entire forward path. You cannot move straight.",
                        ["Stop walking immediately.", "Reach forward or use your cane to touch the curtain fabric.", "Turn slowly 90 degrees right or left to check for an open corridor.", "If both sides remain blocked, take two steps backward."]
                    )

            if is_door:
                # Closed door directly in front
                if right.status == CorridorStatus.CLEAR:
                    return (
                        NavigationAction.VEER_RIGHT, "right",
                        _speech("door_caution_right", language),
                        "A closed door is blocking your center path very close ahead. The right side is clear.",
                        ["Step one or two paces to your right.", "Sweep your cane on your right side to confirm the opening.", "Proceed forward slowly."]
                    )
                elif left.status == CorridorStatus.CLEAR:
                    return (
                        NavigationAction.VEER_LEFT, "left",
                        _speech("door_caution_left", language),
                        "A closed door is blocking your center path very close ahead. The left side is clear.",
                        ["Step one or two paces to your left.", "Sweep your cane on your left side to confirm the opening.", "Proceed forward slowly."]
                    )
                else:
                    return (
                        NavigationAction.STOP, "none",
                        _speech("door_stop", language),
                        "A closed door or wall is right in front of you blocking your entire forward path. You cannot move straight.",
                        ["Stop walking immediately.", "Reach forward or use your cane to locate the door handle or surface.", "Turn slowly 90 degrees right or left to check for an open corridor.", "If both sides remain blocked, take two steps backward."]
                    )

            # Normal urgent obstacle (person, chair, pet, etc.)
            if right.status == CorridorStatus.CLEAR and right.clearance_score >= left.clearance_score:
                return (
                    NavigationAction.VEER_RIGHT, "right",
                    _speech("urgent_veer_right", language, obs=obs, obs_cap=obs_cap),
                    f"{obs_cap} is directly in your center path at foot level. Your right side has plenty of room.",
                    ["Take one or two steps to your right.", "Sweep your cane ahead on the right to confirm the walkway.", "Continue walking forward."]
                )
            elif left.status == CorridorStatus.CLEAR:
                return (
                    NavigationAction.VEER_LEFT, "left",
                    _speech("urgent_veer_left", language, obs=obs, obs_cap=obs_cap),
                    f"{obs_cap} is directly in your center path at foot level. Your left side has plenty of room.",
                    ["Take one or two steps to your left.", "Sweep your cane ahead on the left to confirm the walkway.", "Continue walking forward."]
                )
            else:
                return (
                    NavigationAction.STOP, "none",
                    _speech("urgent_stop", language, obs=obs, obs_cap=obs_cap),
                    f"{obs_cap} is blocking your path at foot level, and neither the left nor right side is clear to pass.",
                    ["Stop immediately and stand still.", "Use your cane to probe the space directly in front of your feet.", "Turn slowly to your right or left to locate a clear exit.", "Take two steps backward if space is tight."]
                )

        # ── 2. CENTER CORRIDOR CLEAR — WALK STRAIGHT WITH SIDE CAUTIONS ──
        if center.status == CorridorStatus.CLEAR:
            if language == "hi":
                side_warnings = []
                if left.status == CorridorStatus.BLOCKED and left.obstacles:
                    side_warnings.append(f"बाईं ओर पास में {_obstacle_name_hi(left.obstacles[0])}")
                elif left.status == CorridorStatus.CAUTION and left.obstacles:
                    side_warnings.append(f"बाईं ओर {_obstacle_name_hi(left.obstacles[0])}")

                if right.status == CorridorStatus.BLOCKED and right.obstacles:
                    side_warnings.append(f"दाईं ओर पास में {_obstacle_name_hi(right.obstacles[0])}")
                elif right.status == CorridorStatus.CAUTION and right.obstacles:
                    side_warnings.append(f"दाईं ओर {_obstacle_name_hi(right.obstacles[0])}")

                warnings_str = " और ".join(side_warnings)
                explanation = f"Your center walking path is open, but be careful: obstacles on your sides ({warnings_str})."
            else:
                side_warnings = []
                if left.status == CorridorStatus.BLOCKED and left.obstacles:
                    side_warnings.append(f"{_format_obstacle_name(left.obstacles[0])} close on your left")
                elif left.status == CorridorStatus.CAUTION and left.obstacles:
                    side_warnings.append(f"{_format_obstacle_name(left.obstacles[0])} on your left")

                if right.status == CorridorStatus.BLOCKED and right.obstacles:
                    side_warnings.append(f"{_format_obstacle_name(right.obstacles[0])} close on your right")
                elif right.status == CorridorStatus.CAUTION and right.obstacles:
                    side_warnings.append(f"{_format_obstacle_name(right.obstacles[0])} on your right")

                warnings_str = ", and ".join(side_warnings)
                explanation = f"Your center walking path is open, but be careful: there is {warnings_str}."

            if side_warnings:
                speech = _speech("straight_side_warnings", language, warnings=warnings_str)
                steps = [
                    "Walk straight forward in the center corridor.",
                    "Keep your cane slightly sweeping forward to guard your sides."
                ]
            else:
                speech = _speech("straight_clear", language)
                explanation = "All forward and side corridors appear open with no obstacles detected."
                steps = [
                    "Walk forward comfortably at normal walking speed.",
                    "Continue scanning ground level with your cane."
                ]
            return NavigationAction.STRAIGHT, "center", speech, explanation, steps

        # ── 3. CENTER BLOCKED OR CAUTION — FIND BEST SAFE SIDE ──
        right_clear = right.status == CorridorStatus.CLEAR
        left_clear = left.status == CorridorStatus.CLEAR
        right_ok = right.status in (CorridorStatus.CLEAR, CorridorStatus.CAUTION)
        left_ok = left.status in (CorridorStatus.CLEAR, CorridorStatus.CAUTION)

        # Both sides open — pick wider side
        if right_clear and left_clear:
            if right.clearance_score >= left.clearance_score:
                return (
                    NavigationAction.VEER_RIGHT, "right",
                    _speech("veer_right_both_open", language, obs=obs, obs_cap=obs_cap, prox=prox),
                    f"{obs_cap} is {primary_proximity} blocking your center path. Both sides are passable, with more clearance on the right.",
                    ["Take one or two steps to your right.", "Sweep your cane forward on the right to confirm the corridor.", "Proceed forward safely."]
                )
            else:
                return (
                    NavigationAction.VEER_LEFT, "left",
                    _speech("veer_left_both_open", language, obs=obs, obs_cap=obs_cap, prox=prox),
                    f"{obs_cap} is {primary_proximity} blocking your center path. Both sides are passable, with more clearance on the left.",
                    ["Take one or two steps to your left.", "Sweep your cane forward on the left to confirm the corridor.", "Proceed forward safely."]
                )

        # Right side clear, left side blocked
        if right_clear and not left_clear:
            return (
                NavigationAction.VEER_RIGHT, "right",
                _speech("veer_right_only", language, obs=obs, obs_cap=obs_cap, prox=prox),
                f"Forward path is blocked by {obs} {primary_proximity}. Your left side is also blocked, but the right corridor is clear to walk.",
                ["Step to your right side.", "Verify the right path with your cane.", "Walk forward around the obstacle."]
            )

        # Left side clear, right side blocked
        if left_clear and not right_clear:
            return (
                NavigationAction.VEER_LEFT, "left",
                _speech("veer_left_only", language, obs=obs, obs_cap=obs_cap, prox=prox),
                f"Forward path is blocked by {obs} {primary_proximity}. Your right side is also blocked, but the left corridor is clear to walk.",
                ["Step to your left side.", "Verify the left path with your cane.", "Walk forward around the obstacle."]
            )

        # Right side narrow but passable
        if right_ok and not left_ok:
            return (
                NavigationAction.VEER_RIGHT, "right",
                _speech("narrow_right", language, obs=obs, obs_cap=obs_cap, prox=prox),
                f"Center path is blocked by {obs} {primary_proximity}. The right side has a narrow but passable space.",
                ["Move slowly toward your right.", "Use your cane to feel the boundaries of the narrow passage.", "Proceed cautiously."]
            )

        # Left side narrow but passable
        if left_ok and not right_ok:
            return (
                NavigationAction.VEER_LEFT, "left",
                _speech("narrow_left", language, obs=obs, obs_cap=obs_cap, prox=prox),
                f"Center path is blocked by {obs} {primary_proximity}. The left side has a narrow but passable space.",
                ["Move slowly toward your left.", "Use your cane to feel the boundaries of the narrow passage.", "Proceed cautiously."]
            )

        # Both sides somewhat tight, pick better one
        if right_ok and left_ok:
            if right.clearance_score >= left.clearance_score:
                return (
                    NavigationAction.VEER_RIGHT, "right",
                    _speech("better_right", language, obs=obs, obs_cap=obs_cap, prox=prox),
                    f"Center path is blocked by {obs} {primary_proximity}. The right corridor provides the best available clearance.",
                    ["Step carefully toward your right.", "Feel the space with your cane before stepping forward."]
                )
            else:
                return (
                    NavigationAction.VEER_LEFT, "left",
                    _speech("better_left", language, obs=obs, obs_cap=obs_cap, prox=prox),
                    f"Center path is blocked by {obs} {primary_proximity}. The left corridor provides the best available clearance.",
                    ["Step carefully toward your left.", "Feel the space with your cane before stepping forward."]
                )

        # ── 4. ALL CORRIDORS BLOCKED — STOP & ACTIONABLE MULTI-STEP GUIDANCE ──
        all_obs = list({o for c in corridors.values() for o in c.obstacles})
        if language == "hi":
            obs_names = [_obstacle_name_hi(o) for o in all_obs[:3]] if all_obs else [obs]
        else:
            obs_names = [_format_obstacle_name(o) for o in all_obs[:3]] if all_obs else [obs]
        obs_str = ", ".join(obs_names)

        if is_curtain or any("curtain" in o for o in all_obs):
            speech = _speech("blocked_curtain", language)
            explanation = "Closed curtains or drapes are blocking your entire forward path. There is no open passage ahead."
            steps = [
                "Stop walking immediately and stand still.",
                "Reach forward or use your cane to touch the curtain fabric.",
                "Slowly turn 90 degrees to your right or left to check if the path continues around the window.",
                "If both sides remain blocked, take two steps backward."
            ]
        elif is_door or any("door" in o or "wall" in o for o in all_obs):
            speech = _speech("blocked_door", language)
            explanation = "A closed door or wall barrier is blocking your entire forward path. There is no open passage to walk through."
            steps = [
                "Stop walking immediately and stand still.",
                "Reach forward or use your cane to locate the door frame and handle.",
                "Slowly turn 90 degrees to your right or left to check if the hallway continues.",
                "If no exit is found, take two steps backward."
            ]
        else:
            speech = _speech("blocked_generic", language, obs_str=obs_str)
            explanation = f"Your forward path and both sides are completely blocked by {obs_str}. Stopping is necessary to prevent a collision."
            steps = [
                "Stop moving immediately and stand still.",
                "Use your cane to sweep the space directly in front of you.",
                "Slowly turn 90 degrees to your right to check if a corridor opens up.",
                "If still blocked, turn to your left or carefully take two steps backward."
            ]

        return NavigationAction.STOP, "none", speech, explanation, steps
