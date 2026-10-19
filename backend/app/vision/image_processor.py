"""
VisionMate - Image Processor
File: backend/app/vision/image_processor.py

Purpose:
- Safe image decoding from binary uploads (multipart/form-data) and base64 strings.
- Aspect-ratio preserving resizing to keep CPU inference latency under 150-200ms.
- Visual annotation renderer for debug overlays and preview screens.
"""

import base64
from typing import Tuple, List, Optional
import cv2
import numpy as np

from backend.app.config import settings
from backend.app.schemas.detection import DetectionItem


class ImageProcessor:
    """Provides modular, robust image validation, decoding, resizing, and annotation."""

    @staticmethod
    def decode_from_bytes(file_bytes: bytes) -> np.ndarray:
        """
        Decode raw image bytes (e.g. from an HTTP upload) into a BGR OpenCV NumPy array.
        Raises ValueError if bytes are empty or corrupt.
        """
        if not file_bytes:
            raise ValueError("Empty image byte payload received.")
        
        np_arr = np.frombuffer(file_bytes, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise ValueError("Failed to decode image. Format may be corrupt or unsupported.")
            
        return image

    @staticmethod
    def decode_from_base64(base64_string: str) -> np.ndarray:
        """
        Decode a base64 encoded string or Data URI (e.g., 'data:image/jpeg;base64,...')
        into a BGR OpenCV NumPy array.
        """
        if not base64_string or not base64_string.strip():
            raise ValueError("Empty base64 image string received.")

        # Strip Data URI prefix if present
        if "," in base64_string:
            base64_string = base64_string.split(",", 1)[1]

        try:
            image_bytes = base64.b64decode(base64_string)
        except Exception as e:
            raise ValueError(f"Base64 decoding failed: {str(e)}")

        return ImageProcessor.decode_from_bytes(image_bytes)

    @staticmethod
    def resize_with_aspect_ratio(
        image: np.ndarray, 
        max_dim: int = settings.MAX_IMAGE_DIM
    ) -> Tuple[np.ndarray, float]:
        """
        Downscales the image if max(height, width) exceeds max_dim,
        preserving original aspect ratio.
        Returns: (resized_image, scale_factor)
        """
        h, w = image.shape[:2]
        if max(h, w) <= max_dim:
            return image, 1.0

        scale = max_dim / float(max(h, w))
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))

        # Use INTER_AREA interpolation for clean, anti-aliased downsampling
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        return resized, scale

    @staticmethod
    def encode_to_base64_jpeg(image: np.ndarray, quality: int = 80) -> str:
        """
        Encodes a BGR OpenCV NumPy array into a base64 data URI string for client rendering.
        """
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        success, buffer = cv2.imencode(".jpg", image, encode_params)
        if not success:
            raise ValueError("Failed to encode image to JPEG.")

        b64_str = base64.b64encode(buffer).decode("utf-8")
        return f"data:image/jpeg;base64,{b64_str}"

    @staticmethod
    def draw_detections(
        image: np.ndarray, 
        detections: List[DetectionItem]
    ) -> np.ndarray:
        """
        Draws high-contrast, accessible bounding boxes and readable labels onto a copy of the image.
        """
        annotated = image.copy()
        
        for det in detections:
            x1, y1, x2, y2 = det.box.x1, det.box.y1, det.box.x2, det.box.y2
            
            # High-priority obstacles in bright amber/red; general objects in vibrant green
            box_color = (0, 70, 230) if det.is_priority else (0, 190, 70)
            
            # Draw primary bounding rectangle
            cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 2)
            
            label = f"{det.label} ({det.confidence:.0%}) - {det.position.value}"
            
            # Text background badge for legibility
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.5
            thickness = 1
            (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, thickness)
            
            badge_y1 = max(0, y1 - text_h - 8)
            badge_y2 = y1
            badge_x1 = x1
            badge_x2 = min(annotated.shape[1], x1 + text_w + 8)
            
            cv2.rectangle(annotated, (badge_x1, badge_y1), (badge_x2, badge_y2), box_color, -1)
            cv2.putText(
                annotated,
                label,
                (badge_x1 + 4, badge_y2 - 4),
                font,
                font_scale,
                (255, 255, 255),
                thickness,
                cv2.LINE_AA
            )

        return annotated
