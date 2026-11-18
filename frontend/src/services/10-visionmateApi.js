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
  const { timeoutMs = 20000, signal, ...fetchOptions } = options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.detail || `HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("Request timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
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
 * @param {string} language - Spoken navigation guidance language code ('en' or 'hi')
 * @returns {Promise<InspectionResponse>}
 */
export async function inspectFrame(imageBase64, returnAnnotated = false, signal, language = "en") {
  return apiFetch(`${API_PREFIX}/inspect-json`, {
    signal, timeoutMs: 10000,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      return_annotated_image: returnAnnotated,
      language,
    }),
  });
}

/**
 * POST /api/v1/translate
 * Translates open-ended spoken text (OCR readings, AI answers) into the selected
 * speech language. The backend falls back to the original text when translation
 * is unavailable, so callers always get speakable text back.
 * @param {string} text - Source text (English)
 * @param {string} targetLanguage - Target language code (e.g. 'hi')
 * @returns {Promise<TranslateResponse>}
 */
export async function translateText(text, targetLanguage) {
  return apiFetch(`${API_PREFIX}/translate`, {
    timeoutMs: 8000,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      target_language: targetLanguage,
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
    timeoutMs: 30000,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      return_annotated_image: false,
    }),
  });
}

/**
 * POST /api/v1/ask-vlm
 * Tier 2 Cloud/VLM multimodal query for conversational scene understanding.
 * @param {string} imageBase64 - Camera frame snapshot
 * @param {string} prompt - Question or request (e.g. "What is in front of me?", "Read handwriting")
 * @param {string} intent - Intent identifier
 * @returns {Promise<VLMResponse>}
 */
export async function askVLM(imageBase64, prompt = "Describe this scene for a blind person navigating.", intent = "scene_description") {
  return apiFetch(`${API_PREFIX}/ask-vlm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      prompt: prompt,
      intent: intent,
    }),
  });
}
