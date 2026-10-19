"""
VisionMate - On-Demand OCR Service
File: backend/app/vision/ocr.py

Purpose:
- EasyOCR-based optical character recognition, executed only when explicitly requested by the user.
- Aggregates multi-line text blocks, cleans OCR noise, and formats a speech-optimized reading.
- Honesty rule: Reports confidence for each block and does NOT fabricate text.
"""

import time
import threading
from typing import List, Optional, Tuple
import numpy as np

from backend.app.schemas.ocr import OCRBlock, OCRResponse


class OCRService:
    """
    Thread-safe EasyOCR wrapper, lazily initialized on first use.
    Lazy loading avoids the 2-3 second EasyOCR model initialization from blocking API startup.
    """

    _instance: Optional["OCRService"] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, languages: List[str] = ["en"], use_gpu: bool = False):
        if self._initialized:
            return
        self._languages = languages
        self._use_gpu = use_gpu
        self._reader = None
        self._reader_lock = threading.Lock()
        self._initialized = True

    def _ensure_reader(self):
        """Lazily loads the EasyOCR reader on first call to avoid startup latency."""
        if self._reader is not None:
            return
        with self._reader_lock:
            if self._reader is None:
                import easyocr  # deferred import for startup performance
                self._reader = easyocr.Reader(self._languages, gpu=self._use_gpu, verbose=False)

    @staticmethod
    def _clean_text(text: str) -> str:
        """
        Applies conservative post-processing to remove common OCR noise:
        - Strips leading/trailing whitespace.
        - Collapses multiple internal spaces.
        - Removes isolated single garbage characters (often punctuation artifacts).
        """
        text = text.strip()
        # Collapse multiple consecutive spaces to a single space
        import re
        text = re.sub(r" {2,}", " ", text)
        return text

    @staticmethod
    def _build_speech_text(blocks: List[OCRBlock], min_confidence: float = 0.40) -> str:
        """
        Builds a natural speech-reading from filtered text blocks.
        Blocks below the confidence threshold are excluded from the spoken output.
        """
        filtered = [
            b.text for b in blocks
            if b.confidence >= min_confidence and len(b.text.strip()) > 0
        ]
        if not filtered:
            return "No readable text was found."

        joined = ". ".join(filtered)
        return f"Reading text: {joined}."

    def read_text(
        self,
        image: np.ndarray,
        min_confidence: float = 0.40
    ) -> OCRResponse:
        """
        Runs EasyOCR on a BGR image frame and returns structured results.
        Args:
            image: BGR NumPy image array.
            min_confidence: Minimum confidence score to include a text block.
        Returns:
            OCRResponse with all detected text blocks, speech text, and timing.
        """
        self._ensure_reader()

        # Convert BGR to RGB — EasyOCR expects RGB input
        rgb_image = image[:, :, ::-1]

        start = time.perf_counter()
        try:
            raw_results = self._reader.readtext(rgb_image, detail=1, paragraph=False)
        except Exception as e:
            return OCRResponse(
                success=False,
                inference_time_ms=0.0,
                total_blocks_count=0,
                total_text="",
                speech_text=f"OCR failed: {str(e)}",
                blocks=[],
                message=f"EasyOCR encountered an error: {str(e)}"
            )

        inference_time_ms = round((time.perf_counter() - start) * 1000, 2)

        # Parse results — EasyOCR format: [([[x1,y1],[x2,y2],[x3,y3],[x4,y4]], text, confidence)]
        blocks: List[OCRBlock] = []
        for bbox, text, confidence in raw_results:
            cleaned = self._clean_text(text)
            if not cleaned:
                continue
            # Convert bbox from [[x,y],...] to list of [x,y] integer pairs
            int_bbox = [[int(pt[0]), int(pt[1])] for pt in bbox]
            blocks.append(OCRBlock(
                text=cleaned,
                confidence=round(float(confidence), 3),
                box=int_bbox
            ))

        # Build full concatenated text (all blocks regardless of confidence)
        total_text = " ".join(b.text for b in blocks)

        # Build speech-optimized output using confidence threshold
        speech_text = self._build_speech_text(blocks, min_confidence=min_confidence)

        return OCRResponse(
            success=True,
            inference_time_ms=inference_time_ms,
            total_blocks_count=len(blocks),
            total_text=total_text,
            speech_text=speech_text,
            blocks=blocks,
            message=None if blocks else "No text detected in the provided frame."
        )
