/**
 * VisionMate API Client
 * File: frontend/src/services/visionmateApi.js
 *
 * Centralised async fetch wrappers for all backend endpoints.
 * Uses Fetch API with clean error handling - no axios dependency needed.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const API_PREFIX = `${BASE_URL}/api/v1`;

/**
 * Core fetch utility with consistent error surfacing.
 */
async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * GET /api/v1/health
 * Returns service liveness, model loaded state, and device info.
 */
export async function fetchHealth() {
  return apiFetch(`${API_PREFIX}/health`);
}

/**
 * GET /api/v1/model-info
 * Returns model architecture parameters and supported classes.
 */
export async function fetchModelInfo() {
  return apiFetch(`${API_PREFIX}/model-info`);
}

/**
 * POST /api/v1/inspect-json
 * Sends a base64 camera frame for object detection and prioritization.
 * @param {string} imageBase64 - Data URI (data:image/jpeg;base64,...) from canvas.toDataURL()
 * @param {boolean} returnAnnotated - Whether to request the annotated debug overlay
 * @returns {Promise<InspectionResponse>}
 */
export async function inspectFrame(imageBase64, returnAnnotated = false) {
  return apiFetch(`${API_PREFIX}/inspect-json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      return_annotated_image: returnAnnotated,
    }),
  });
}

/**
 * POST /api/v1/read-text-json
 * Sends a base64 camera frame for on-demand OCR text reading.
 * @param {string} imageBase64 - Data URI from canvas.toDataURL()
 * @returns {Promise<OCRResponse>}
 */
export async function readTextFromFrame(imageBase64) {
  return apiFetch(`${API_PREFIX}/read-text-json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      return_annotated_image: false,
    }),
  });
}
