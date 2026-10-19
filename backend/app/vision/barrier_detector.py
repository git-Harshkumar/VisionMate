"""
VisionMate - Door, Curtain & Surface Barrier Detector
File: backend/app/vision/barrier_detector.py

Purpose:
- Real-time Computer Vision detector for closed doors, door frames, closed curtains/drapes,
  and close flat wall barriers.
- Complements COCO-80 YOLO (which has no door, curtain, or wall classes) to protect visually
  impaired users from walking into closed doors, walls, and closed curtains.
- Runs natively in OpenCV on CPU in under 15ms.
"""

from typing import List, Dict, Any, Optional
import cv2
import numpy as np


class BarrierDetector:
    """
    Lightweight, high-speed indoor barrier detector.
    Identifies closed doors (jambs + header lintel), closed curtains/drapes (vertical fabric ripples),
    and close planar barriers (walls/doors < 1.5m away).
    """

    OUTDOOR_VEHICLE_LABELS = {"bus", "car", "truck", "motorcycle", "train", "airplane", "traffic light"}

    @classmethod
    def detect(
        cls, 
        image_bgr: np.ndarray, 
        existing_detections: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Analyzes a camera frame for indoor doors, curtains, and close barriers.
        Returns a list of raw detection dictionaries:
        [{'label': 'closed door' | 'closed curtain' | 'closed door / wall', 'confidence': float, 'box': (x1, y1, x2, y2)}]
        """
        if image_bgr is None:
            return []

        h, w = image_bgr.shape[:2]
        if h < 80 or w < 80:
            return []

        # If outdoor vehicles are present, skip indoor architectural detection to avoid false positives
        if existing_detections:
            for det in existing_detections:
                if det.get("label", "").lower() in cls.OUTDOOR_VEHICLE_LABELS and det.get("confidence", 0) > 0.40:
                    return []

        # Scale down to 480px width for fast and consistent edge/gradient analysis
        proc_w = 480
        scale = proc_w / float(w)
        proc_h = max(1, int(h * scale))
        proc_img = cv2.resize(image_bgr, (proc_w, proc_h), interpolation=cv2.INTER_AREA)

        gray = cv2.cvtColor(proc_img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 40, 120)

        detections: List[Dict[str, Any]] = []

        # 1. Closed Curtain / Window Drapery Detection (Vertical fabric ripple folds)
        curtain_detections = cls._detect_curtains(blurred, edges, proc_w, proc_h, w, h)
        if curtain_detections:
            detections.extend(curtain_detections)

        # 2. Door Frame Detection: Vertical Jambs + Horizontal Lintel Header
        door_detections = cls._detect_doors(proc_img, gray, edges, proc_w, proc_h, scale, w, h)
        if door_detections:
            detections.extend(door_detections)

        # 3. Close Flat Wall / Door Barrier Detection (when user is right in front of a flat surface < 1.2m)
        has_prominent_barrier = bool(curtain_detections or door_detections)
        if existing_detections and not has_prominent_barrier:
            for det in existing_detections:
                box = det.get("box", (0, 0, 0, 0))
                area_ratio = ((box[2] - box[0]) * (box[3] - box[1])) / float(max(1, w * h))
                if area_ratio > 0.20:
                    has_prominent_barrier = True
                    break

        if not has_prominent_barrier:
            flat_barrier = cls._detect_flat_barrier(gray, edges, proc_w, proc_h, w, h)
            if flat_barrier:
                detections.append(flat_barrier)

        return detections

    @classmethod
    def _detect_curtains(
        cls, 
        blurred: np.ndarray, 
        edges: np.ndarray, 
        proc_w: int, 
        proc_h: int, 
        orig_w: int, 
        orig_h: int
    ) -> List[Dict[str, Any]]:
        """
        Detects closed curtains or window drapes.
        Curtains have distinctive periodic vertical ripples/folds that produce strong horizontal
        gradients (Sobel X) compared to vertical gradients (Sobel Y), spanning vertically across
        the forward corridor.
        """
        # Central-to-wide corridor where curtains would block the path
        cx1, cx2 = int(proc_w * 0.15), int(proc_w * 0.85)
        cy1, cy2 = int(proc_h * 0.10), int(proc_h * 0.82)

        roi_gray = blurred[cy1:cy2, cx1:cx2]
        if roi_gray.size == 0:
            return []

        sobel_x = cv2.Sobel(roi_gray, cv2.CV_32F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(roi_gray, cv2.CV_32F, 0, 1, ksize=3)

        abs_sx = np.abs(sobel_x)
        abs_sy = np.abs(sobel_y)

        mean_sx = float(np.mean(abs_sx))
        mean_sy = float(np.mean(abs_sy))

        # Calculate gradient ratio (vertical lines create strong X gradients)
        ratio = mean_sx / max(1.0, mean_sy)

        # Check for periodic vertical ripple folds across columns
        roi_edges = edges[cy1:cy2, cx1:cx2]
        col_edge_sums = np.sum(roi_edges > 0, axis=0)
        raw_peaks = [
            x for x in range(1, len(col_edge_sums) - 1)
            if col_edge_sums[x] > int((cy2 - cy1) * 0.12)
            and col_edge_sums[x] >= col_edge_sums[x - 1]
            and col_edge_sums[x] >= col_edge_sums[x + 1]
        ]

        # Group peaks into distinct fold clusters (minimum 18px separation)
        clusters = []
        for p in raw_peaks:
            if not clusters or (p - clusters[-1]) >= 18:
                clusters.append(p)

        # Closed curtains have at least 4 distinct vertical folds and dominant vertical gradient
        if len(clusters) >= 4 and ratio > 1.40 and mean_sx > 10.0:
            box_x1 = int(orig_w * 0.15)
            box_y1 = int(orig_h * 0.08)
            box_x2 = int(orig_w * 0.85)
            box_y2 = int(orig_h * 0.88)

            conf = round(max(0.76, min(0.94, 0.74 + (len(clusters) * 0.03))), 2)

            return [{
                "label": "closed curtain",
                "confidence": conf,
                "box": (box_x1, box_y1, box_x2, box_y2)
            }]

        return []

    @classmethod
    def _detect_doors(
        cls, 
        proc_img: np.ndarray,
        gray: np.ndarray, 
        edges: np.ndarray, 
        proc_w: int, 
        proc_h: int, 
        scale: float, 
        orig_w: int, 
        orig_h: int
    ) -> List[Dict[str, Any]]:
        """Detects door frames via vertical jambs with horizontal header lines and door aspect ratio."""
        min_line_len = int(proc_h * 0.28)
        v_lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180,
            threshold=50,
            minLineLength=min_line_len,
            maxLineGap=int(proc_h * 0.08)
        )

        vertical_lines = []
        if v_lines is not None:
            for line in v_lines:
                pts = line.reshape(-1)
                if len(pts) < 4:
                    continue
                x1, y1, x2, y2 = int(pts[0]), int(pts[1]), int(pts[2]), int(pts[3])
                dx = abs(x2 - x1)
                dy = abs(y2 - y1)
                if dy >= min_line_len and (dx / float(max(1, dy)) < 0.20):
                    avg_x = (x1 + x2) / 2.0
                    vertical_lines.append((avg_x, min(y1, y2), max(y1, y2)))

        if len(vertical_lines) < 2:
            return []

        vertical_lines.sort(key=lambda it: it[0])

        # Find horizontal lines for door header (lintel)
        min_header_w = int(proc_w * 0.15)
        h_lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180,
            threshold=40,
            minLineLength=min_header_w,
            maxLineGap=int(proc_w * 0.06)
        )
        horizontal_headers = []
        if h_lines is not None:
            for line in h_lines:
                pts = line.reshape(-1)
                if len(pts) < 4:
                    continue
                hx1, hy1, hx2, hy2 = int(pts[0]), int(pts[1]), int(pts[2]), int(pts[3])
                h_dx = abs(hx2 - hx1)
                h_dy = abs(hy2 - hy1)
                if h_dx >= min_header_w and (h_dy / float(max(1, h_dx)) < 0.20):
                    horizontal_headers.append((min(hx1, hx2), max(hx1, hx2), (hy1 + hy2) / 2.0))

        door_candidates = []
        for i in range(len(vertical_lines)):
            x_i, y1_i, y2_i = vertical_lines[i]
            for j in range(i + 1, len(vertical_lines)):
                x_j, y1_j, y2_j = vertical_lines[j]
                span_w = x_j - x_i
                w_ratio = span_w / float(proc_w)

                # Standard door occupies 18% to 68% of camera width
                if 0.18 <= w_ratio <= 0.68:
                    overlap_y1 = max(y1_i, y1_j)
                    overlap_y2 = min(y2_i, y2_j)
                    span_h = overlap_y2 - overlap_y1
                    h_ratio = span_h / float(proc_h)

                    # Doors have height > width, aspect ratio between 1.2 and 2.85
                    aspect_ratio = span_h / max(1.0, span_w)
                    if h_ratio >= 0.35 and (1.20 <= aspect_ratio <= 2.85):
                        # Verify top horizontal header (lintel) exists
                        has_header = False
                        for hx1, hx2, hy in horizontal_headers:
                            if abs(hy - overlap_y1) < (span_h * 0.15):
                                h_overlap = max(0, min(x_j, hx2) - max(x_i, hx1))
                                if h_overlap >= (span_w * 0.40):
                                    has_header = True
                                    break

                        if not has_header:
                            top_strip = edges[max(0, int(overlap_y1 - 10)):min(proc_h, int(overlap_y1 + 10)), int(x_i):int(x_j)]
                            if top_strip.size > 0 and (np.count_nonzero(top_strip) / float(top_strip.size)) > 0.10:
                                has_header = True

                        if has_header or h_ratio > 0.55:
                            # Verify interior panel is not outdoor noise
                            door_interior_edges = edges[int(overlap_y1):int(overlap_y2), int(x_i):int(x_j)]
                            if door_interior_edges.size > 0:
                                interior_edge_density = np.count_nonzero(door_interior_edges) / float(door_interior_edges.size)
                                if interior_edge_density > 0.30:
                                    continue

                            cand_x1 = max(0, int(x_i / scale))
                            cand_y1 = max(0, int(min(y1_i, y1_j) / scale))
                            cand_x2 = min(orig_w, int(x_j / scale))
                            cand_y2 = min(orig_h, int(max(y2_i, y2_j) / scale))

                            center_x = (cand_x1 + cand_x2) / 2.0
                            offset = abs(center_x - (orig_w / 2.0)) / float(orig_w)
                            conf = round(max(0.72, min(0.92, 0.75 + (h_ratio * 0.2) - (offset * 0.1))), 2)

                            door_candidates.append({
                                "label": "closed door",
                                "confidence": conf,
                                "box": (cand_x1, cand_y1, cand_x2, cand_y2)
                            })

        # Apply Non-Maximum Suppression (NMS) to eliminate duplicate overlapping boxes
        return cls._apply_nms(door_candidates, iou_thresh=0.35)

    @classmethod
    def _detect_flat_barrier(
        cls, 
        gray: np.ndarray, 
        edges: np.ndarray, 
        proc_w: int, 
        proc_h: int, 
        orig_w: int, 
        orig_h: int
    ) -> Optional[Dict[str, Any]]:
        """
        Detects if the user is standing directly in front of a flat planar surface (< 1.2m away),
        such as a closed door or wall that fills the forward corridor with no depth variation.
        """
        cx1, cx2 = int(proc_w * 0.25), int(proc_w * 0.75)
        cy1, cy2 = int(proc_h * 0.15), int(proc_h * 0.70)
        center_gray = gray[cy1:cy2, cx1:cx2]
        center_edges = edges[cy1:cy2, cx1:cx2]

        if center_gray.size == 0:
            return None

        edge_density = np.count_nonzero(center_edges) / float(center_gray.size)
        std_dev = float(np.std(center_gray))
        mean_val = float(np.mean(center_gray))

        # Check for planar uniformity in forward corridor
        if edge_density < 0.035 and std_dev < 38.0 and (30.0 < mean_val < 225.0):
            # Check bottom region for baseboard or floor-wall threshold line
            bottom_strip = edges[int(proc_h * 0.70):proc_h, cx1:cx2]
            if bottom_strip.size > 0:
                row_sums = np.sum(bottom_strip > 0, axis=1)
                # If any row has a strong horizontal line extending across >= 35% of the corridor
                if np.any(row_sums >= int((cx2 - cx1) * 0.35)):
                    return {
                        "label": "closed door / wall",
                        "confidence": 0.82,
                        "box": (int(orig_w * 0.18), int(orig_h * 0.12), int(orig_w * 0.82), int(orig_h * 0.88))
                    }

        return None

    @staticmethod
    def _apply_nms(candidates: List[Dict[str, Any]], iou_thresh: float = 0.35) -> List[Dict[str, Any]]:
        """Standard Non-Maximum Suppression for bounding boxes."""
        if not candidates:
            return []
        candidates.sort(key=lambda c: c["confidence"], reverse=True)
        keep = []
        for cand in candidates:
            x1, y1, x2, y2 = cand["box"]
            area = max(1, (x2 - x1) * (y2 - y1))
            overlapped = False
            for k in keep:
                kx1, ky1, kx2, ky2 = k["box"]
                k_area = max(1, (kx2 - kx1) * (ky2 - ky1))
                inter_x1 = max(x1, kx1)
                inter_y1 = max(y1, ky1)
                inter_x2 = min(x2, kx2)
                inter_y2 = min(y2, ky2)
                inter_w = max(0, inter_x2 - inter_x1)
                inter_h = max(0, inter_y2 - inter_y1)
                inter_area = inter_w * inter_h
                iou = inter_area / float(area + k_area - inter_area)
                if iou > iou_thresh:
                    overlapped = True
                    break
            if not overlapped:
                keep.append(cand)
        return keep
