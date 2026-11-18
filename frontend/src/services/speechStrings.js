/**
 * VisionMate - Spoken String Localization
 * File: frontend/src/services/speechStrings.js
 *
 * Deterministic Hindi translations for the fixed, app-generated spoken strings
 * (mode announcements, search cues, orientation cues, fallbacks). These never
 * wait on a network call. Open-ended text (OCR readings, AI answers) is handled
 * by the backend /api/v1/translate endpoint instead.
 *
 * Navigation guidance (guidance_speech) is generated bilingually by the backend
 * NavigationEngine, so it does not appear here.
 */

export const SUPPORTED_SPEECH_LANGUAGES = [
  { code: "en-US", short: "en", label: "English" },
  { code: "hi-IN", short: "hi", label: "हिन्दी (Hindi)" },
];

// Fixed spoken strings: exact English source -> Hindi
const FIXED_STRINGS_HI = new Map([
  [
    "Reading mode on. Obstacle warnings paused. Hold the item in front of the camera, then press Read Text.",
    "रीडिंग मोड चालू। रुकावट चेतावनियाँ रुकी हुई हैं। वस्तु कैमरे के सामने पकड़ें, फिर Read Text दबाएँ।",
  ],
  [
    "Reading mode off. Resuming navigation guidance.",
    "रीडिंग मोड बंद। दिशा-निर्देश फिर से शुरू हो रहे हैं।",
  ],
  [
    "Obstacle detected. Stop and check your surroundings.",
    "रुकावट मिली है। रुकें और आस-पास जाँचें।",
  ],
  [
    "No readable text was returned. Hold the text flat and well lit, then try again.",
    "कोई पढ़ने योग्य टेक्स्ट नहीं मिला। टेक्स्ट को सीधा और अच्छी रोशनी में रखें, फिर कोशिश करें।",
  ],
  [
    "The text reader is unavailable. Please try again.",
    "टेक्स्ट रीडर अभी उपलब्ध नहीं है। कृपया फिर कोशिश करें।",
  ],
  ["Tilt camera up slightly", "कैमरा थोड़ा ऊपर करें"],
  ["Tilt camera down slightly", "कैमरा थोड़ा नीचे करें"],
  ["Hold phone upright", "फ़ोन सीधा पकड़ें"],
  ["Speech language set to Hindi.", "भाषा हिन्दी चुनी गई।"],
  ["Speech language set to English.", "भाषा अंग्रेज़ी चुनी गई।"],
]);

// Detection/obstacle labels -> Hindi (mirrors the backend navigation map, plus
// a few common COCO classes that target search can announce).
const LABEL_HI = new Map(Object.entries({
  person: "व्यक्ति",
  chair: "कुर्सी",
  couch: "सोफ़ा",
  bed: "बिस्तर",
  "dining table": "खाने की मेज़",
  bench: "बेंच",
  "potted plant": "गमला",
  refrigerator: "फ़्रिज",
  toilet: "शौचालय",
  tv: "टीवी",
  dog: "कुत्ता",
  cat: "बिल्ली",
  suitcase: "सूटकेस",
  backpack: "बैग",
  "sports ball": "गेंद",
  bicycle: "साइकिल",
  car: "गाड़ी",
  motorcycle: "मोटरसाइकिल",
  bus: "बस",
  truck: "ट्रक",
  umbrella: "छाता",
  handbag: "हैंडबैग",
  clock: "घड़ी",
  vase: "फूलदान",
  laptop: "लैपटॉप",
  keyboard: "कीबोर्ड",
  mouse: "माउस",
  remote: "रिमोट",
  bottle: "बोतल",
  cup: "कप",
  bowl: "कटोरा",
  book: "किताब",
  "teddy bear": "खिलौना भालू",
  "fire hydrant": "फ़ायर हाइड्रेंट",
  "cell phone": "मोबाइल फ़ोन",
  "closed door": "बंद दरवाज़ा",
  door: "दरवाज़ा",
  "closed door / wall": "बंद दरवाज़ा या दीवार",
  "wall barrier": "दीवार",
  "closed curtain": "बंद पर्दा",
  curtain: "पर्दा",
  curtains: "पर्दे",
  wall: "दीवार",
  obstacle: "रुकावट",
}));

// Spatial positions used by detections -> Hindi
const POSITION_HI = new Map(Object.entries({
  left: "बाईं ओर",
  right: "दाईं ओर",
  center: "सामने",
  "in front": "सामने",
  ahead: "आगे",
}));

/**
 * Returns the deterministic Hindi version of a fixed app string, or null when
 * the string is not a known fixed string (caller then uses cloud translation).
 */
export function fixedHindiString(text) {
  if (!text) return null;
  return FIXED_STRINGS_HI.get(text.trim()) || null;
}

/** Hindi label for a detection class, falling back to the raw label. */
export function labelHindi(label) {
  if (!label) return label;
  return LABEL_HI.get(String(label).toLowerCase().trim()) || label;
}

/** Hindi position phrase, falling back to the raw position. */
export function positionHindi(position) {
  if (!position) return "सामने";
  return POSITION_HI.get(String(position).toLowerCase().trim()) || position;
}

/** "Searching for {item}. Move your camera around slowly." localized. */
export function searchingForString(item, langShort) {
  if (langShort === "hi") return `${item} खोजा जा रहा है। कैमरा धीरे-धीरे इधर-उधर घुमाएँ।`;
  return `Searching for ${item}. Move your camera around slowly.`;
}

/** "Found {label} {position}." localized. */
export function foundItemString(label, position, langShort) {
  if (langShort === "hi") return `${labelHindi(label)} ${positionHindi(position)} मिल गया।`;
  return `Found ${label} ${position || "in front"}.`;
}
