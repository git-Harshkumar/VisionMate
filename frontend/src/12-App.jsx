/**
 * VisionMate - Accessible AI Visual Assistant
 * File: frontend/src/App.jsx
 *
 * Core application coordinating:
 * - Real-time camera acquisition (navigator.mediaDevices)
 * - Dynamic frame capture & throttling (1 frame / 1.5s to prevent cognitive/audio overload)
 * - Object detection & spatial prioritization API (/api/v1/inspect-json)
 * - Temporal tracking cooldowns for deduplicated natural announcements
 * - Web Speech API synthesis with replay, pause, and mute controls
 * - On-demand EasyOCR text extraction (/api/v1/read-text-json)
 * - Accessible keyboard shortcuts (Space, R, T, I, M)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import "./styles/components.css";
import "./styles/glassmorphism.css";

import { useCamera } from "./hooks/useCamera";
import { useSpeech } from "./hooks/useSpeech";
import { useSpatialAudio } from "./hooks/useSpatialAudio";
import { useOrientation } from "./hooks/useOrientation";
import { useVoiceCommands } from "./hooks/useVoiceCommands";
import { fetchHealth, inspectFrame, readTextFromFrame, askVLM, translateText } from "./services/visionmateApi";
import {
  SUPPORTED_SPEECH_LANGUAGES,
  fixedHindiString,
  searchingForString,
  foundItemString,
} from "./services/speechStrings";

import { Header } from "./components/Header";
import { Icon } from "./components/Icon";
import { CameraStatus } from "./components/CameraStatus";
import { ErrorMessage } from "./components/ErrorMessage";
import { CameraPreview } from "./components/CameraPreview";
import { NavigationCard } from "./components/NavigationCard";
import { SpeechBanner } from "./components/SpeechBanner";
import { ControlPanel } from "./components/ControlPanel";
import { DetectionOverlay } from "./components/DetectionOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ReadTextButton } from "./components/ReadTextButton";
import { MetricsCard } from "./components/MetricsCard";
import { VoiceStatusPill } from "./components/VoiceStatusPill";

const THROTTLE_MS = 900; // Minimum start-to-start gap; never overlap requests.
const MAX_FRAME_AGE_MS = 5000; // Discard old guidance, not a navigation safety guarantee.

export default function App() {
  // Camera & Audio Hooks
  const {
    videoRef,
    isStreaming,
    error: cameraError,
    resolution,
    devices,
    selectedDeviceId,
    startCamera,
    stopCamera,
    switchCamera,
    captureFrame,
  } = useCamera();

  // Selected speech output language (persisted). Drives TTS voice/locale,
  // backend navigation guidance language, and spoken-string translation.
  const [speechLanguage, setSpeechLanguage] = useState(() => {
    try {
      return localStorage.getItem("vm-speech-lang") || "en-US";
    } catch {
      return "en-US";
    }
  });
  const speechLanguageRef = useRef(speechLanguage);
  useEffect(() => {
    speechLanguageRef.current = speechLanguage;
  }, [speechLanguage]);

  const {
    speak,
    cancel: cancelSpeech,
    repeat: repeatSpeech,
    isSpeaking,
    lastText: lastSpokenText,
    isVoiceAvailable,
  } = useSpeech({ rate: 0.95, pitch: 1.0, langRef: speechLanguageRef });

  /**
   * Speaks text in the selected language. Fixed app strings use deterministic
   * built-in translations (instant, no network). Open-ended text (OCR readings,
   * AI answers, catalog announcements) goes through the backend translator and
   * falls back to the original text if translation is unavailable, so content
   * is never lost. Navigation guidance arrives pre-localized from the backend
   * and is spoken directly.
   */
  const translateCacheRef = useRef(new Map());
  const speakLocalized = useCallback(
    async (text, opts) => {
      if (!text) return false;
      if (!speechLanguageRef.current.startsWith("hi")) return speak(text, opts);
      const fixed = fixedHindiString(text);
      if (fixed) return speak(fixed, opts);
      const cache = translateCacheRef.current;
      if (cache.has(text)) return speak(cache.get(text), opts);
      try {
        const res = await translateText(text, "hi");
        const translated = res?.translated && res?.translated_text ? res.translated_text : text;
        if (cache.size > 200) cache.clear();
        cache.set(text, translated);
        return speak(translated, opts);
      } catch {
        return speak(text, opts);
      }
    },
    [speak]
  );

  const handleSpeechLanguageChange = useCallback(
    (code) => {
      setSpeechLanguage(code);
      speechLanguageRef.current = code;
      try {
        localStorage.setItem("vm-speech-lang", code);
      } catch {
        /* storage unavailable */
      }
      cancelSpeech();
      speakLocalized(code.startsWith("hi") ? "Speech language set to Hindi." : "Speech language set to English.");
    },
    [cancelSpeech, speakLocalized]
  );

  const { playDirectionalChime } = useSpatialAudio();

  // Navigation & Perception State
  const [navigationMode, setNavigationMode] = useState(true);
  const [isReadingMode, setIsReadingMode] = useState(false); // Dedicated mode when holding item up to read
  const [isInspecting, setIsInspecting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [annotatedImage, setAnnotatedImage] = useState(null);

  // Telemetry & Results
  const [latestInspection, setLatestInspection] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [totalLatencyMs, setTotalLatencyMs] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);

  // On-Demand OCR State
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [vlmReading, setVlmReading] = useState(null);

  // Tier 2 Multimodal VLM State & Voice
  const [vlmLoading, setVlmLoading] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const [targetObject, setTargetObject] = useState(null);
  const targetObjectRef = useRef(null);
  targetObjectRef.current = targetObject;

  // Sample static image fallback (when no physical webcam is present)
  const [sampleImage, setSampleImage] = useState(null);

  // Ref to track processing to avoid race conditions in setInterval/timeout
  const processingRef = useRef(false);
  const inspectionControllerRef = useRef(null);
  const inspectionEpochRef = useRef(0);
  const readingBusyRef = useRef(false);
  const readingRequestRef = useRef(0);
  const targetAnnouncementRef = useRef("");

  const audioMutedRef = useRef(audioMuted);
  audioMutedRef.current = audioMuted;

  const navigationModeRef = useRef(navigationMode);
  navigationModeRef.current = navigationMode;

  const isReadingModeRef = useRef(isReadingMode);
  isReadingModeRef.current = isReadingMode;

  const navAnnouncementRef = useRef({ key: "", time: 0, count: 0 });
  const navCandidateRef = useRef({ key: "", count: 0 });
  // Last announced hazard identity (action + obstacle class). Stable against
  // frame-to-frame detection jitter, unlike the full navigation detail key.
  const hazardAnnounceRef = useRef({ key: "", time: 0 });

  // 1. Initial Health Check
  useEffect(() => {
    let mounted = true;
    async function checkHealth() {
      try {
        const health = await fetchHealth();
        if (mounted) setApiHealth(health);
      } catch (err) {
        if (mounted) {
          setErrorMessage(
            "Backend server is offline or unreachable at http://localhost:8000. Please ensure the FastAPI server is running."
          );
        }
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!latestInspection || !isStreaming) return;
    const timer = setTimeout(() => {
      setLatestInspection(null);
      setAnnotatedImage(null);
    }, MAX_FRAME_AGE_MS);
    return () => clearTimeout(timer);
  }, [latestInspection, isStreaming]);

  // Sync camera errors to user message
  useEffect(() => {
    if (cameraError) {
      setErrorMessage(cameraError);
    }
  }, [cameraError]);

  /**
   * Process a single frame through the inspection pipeline.
   */
  const processFrame = useCallback(
    async (frameDataUri, { automatic = false } = {}) => {
      if (!frameDataUri || processingRef.current) return;

      processingRef.current = true;
      const controller = new AbortController();
      inspectionControllerRef.current = controller;
      const epoch = inspectionEpochRef.current;
      setIsProcessing(true);
      setErrorMessage(null);
      const startTime = performance.now();

      try {
        const response = await inspectFrame(frameDataUri, showAnnotated, controller.signal, speechLanguageRef.current.split("-")[0]);
        if (epoch !== inspectionEpochRef.current || controller.signal.aborted) return;
        const elapsed = performance.now() - startTime;
        if (automatic && elapsed > MAX_FRAME_AGE_MS) {
          setLatestInspection(null);
          setAnnotatedImage(null);
          setErrorMessage("Analysis is too slow for current guidance. Keep still and inspect again; do not rely on an old frame.");
          return;
        }
        setTotalLatencyMs(elapsed);
        setLatestInspection(response);
        setFrameCount((prev) => prev + 1);

        if (response.annotated_image || response.annotated_image_base64) {
          setAnnotatedImage(response.annotated_image || response.annotated_image_base64);
        }

        const detectedList = response.detections || response.prioritized_detections || [];
        const nav = response.navigation;
        const urgent = !!nav?.urgent_hazard || nav?.action === "stop";
        const protectedReading = readingBusyRef.current || isReadingModeRef.current;
        if (!audioMutedRef.current && !protectedReading) {
          if (navigationModeRef.current && nav) {
            // Include the hazard identity, not just the maneuver: a new obstacle
            // must not be hidden by suppression of an unchanged turn/stop.
            const key = JSON.stringify([nav.action, nav.primary_obstacle, nav.urgent_hazard, ...Object.entries(nav.corridors || {}).map(([zone, detail]) => [zone, [...(detail.obstacles || [])].sort()])]);
            const candidate = navCandidateRef.current;
            navCandidateRef.current = { key, count: candidate.key === key ? candidate.count + 1 : 1 };
            const previous = navAnnouncementRef.current;
            const now = Date.now();
            const changed = key !== previous.key;
            const settled = navCandidateRef.current.count >= 2;
            if (urgent) {
              // Interrupt decisions use a STABLE hazard identity (action +
              // obstacle class). Proximity wording and corridor detail jitter
              // frame-to-frame and used to restart the warning mid-sentence
              // ("Caution... Caution...") without ever finishing it. The same
              // hazard re-announces at most every 20s as a reminder; a
              // genuinely different obstacle/action still interrupts instantly.
              const hazardKey = `${nav.action}|${(nav.primary_obstacle || "obstacle").toLowerCase()}`;
              const lastHazard = hazardAnnounceRef.current;
              if (hazardKey !== lastHazard.key || now - lastHazard.time >= 20000) {
                hazardAnnounceRef.current = { key: hazardKey, time: now };
                navAnnouncementRef.current = { key, time: now, count: 1 };
                const opts = { automatic: true, priority: true, dedupeKey: `hazard:${hazardKey}` };
                // Backend guidance arrives already localized; only the
                // hard-coded fallback needs frontend localization.
                const pending = nav.guidance_speech
                  ? Promise.resolve(speak(nav.guidance_speech, opts))
                  : speakLocalized("Obstacle detected. Stop and check your surroundings.", opts);
                pending.then((spoken) => {
                  if (spoken) playDirectionalChime(nav.action);
                });
              }
            } else if (changed && settled) {
              // Ordinary maneuver changes need two agreeing fresh frames and
              // never cut off a sentence in progress.
              const opts = { automatic: true, dedupeKey: key };
              const pending = nav.guidance_speech
                ? Promise.resolve(speak(nav.guidance_speech, opts))
                : speakLocalized("Obstacle detected. Stop and check your surroundings.", opts);
              pending.then((spoken) => {
                if (spoken) {
                  playDirectionalChime(nav.action);
                  navAnnouncementRef.current = { key, time: Date.now(), count: 1 };
                }
              });
            }
          } else if (response.new_announcements?.length) {
            speakLocalized(response.new_announcements.join(". "), { automatic: true });
          } else if (!Array.isArray(response.new_announcements)) {
            // Legacy responses only. An empty list explicitly means silence.
            speakLocalized(response.speech_text || response.announcement, { automatic: true });
          }
          if (targetObjectRef.current && !urgent) {
            const match = detectedList.find(obj => obj.label.toLowerCase().includes(targetObjectRef.current.toLowerCase()));
            if (match) {
              const position = match.position || match.spatial_position || "in front";
              const key = `${targetObjectRef.current}:${match.label}:${position}`;
              if (targetAnnouncementRef.current !== key &&
                  speak(foundItemString(match.label, position, speechLanguageRef.current.split("-")[0]), { automatic: true })) {
                targetAnnouncementRef.current = key;
                playDirectionalChime("clear");
              }
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted || epoch !== inspectionEpochRef.current) return;
        console.error("Frame inspection failed:", err);
        setErrorMessage(`Inspection error: ${err.message}`);
      } finally {
        if (inspectionControllerRef.current === controller) {
          processingRef.current = false;
          inspectionControllerRef.current = null;
          setIsProcessing(false);
        }
      }
    },
    [showAnnotated, speak, speakLocalized, playDirectionalChime]
  );

  /**
   * Manual Single Inspection Trigger
   */
  const handleInspectOnce = useCallback(() => {
    const frame = captureFrame() || sampleImage;
    if (frame) {
      processFrame(frame);
    } else {
      setErrorMessage("No active video feed or sample image to inspect.");
    }
  }, [captureFrame, sampleImage, processFrame]);

  /**
   * Dedicated Reading & Item Orientation Mode Toggle.
   * While active, the continuous inspection loop is paused (see effect below)
   * so no frames are sent for obstacle detection and no navigation speech fires.
   */
  const handleToggleReadingMode = useCallback(() => {
    const next = !isReadingModeRef.current;
    isReadingModeRef.current = next;
    inspectionEpochRef.current += 1;
    inspectionControllerRef.current?.abort();
    navAnnouncementRef.current = { key: "", time: 0 };
    navCandidateRef.current = { key: "", count: 0 };
    hazardAnnounceRef.current = { key: "", time: 0 };
    setLatestInspection(null);
    setAnnotatedImage(null);
    readingRequestRef.current += 1;
    readingBusyRef.current = false;
    setOcrLoading(false);
    setIsReadingMode(next);
    if (next) {
      setOcrResult(null);
      setVlmReading(null);
      speakLocalized("Reading mode on. Obstacle warnings paused. Hold the item in front of the camera, then press Read Text.");
    } else {
      speakLocalized("Reading mode off. Resuming navigation guidance.");
    }
  }, [speakLocalized]);

  /**
   * On-Demand OCR & AI Item Assistant Trigger
   */
  const handleTriggerOcr = useCallback(async () => {
    const frame = captureFrame() || sampleImage;
    if (!frame) {
      setErrorMessage("Please start the camera or upload an image before reading text.");
      return;
    }

    if (readingBusyRef.current) return;
    readingBusyRef.current = true;
    const request = ++readingRequestRef.current;
    inspectionEpochRef.current += 1;
    inspectionControllerRef.current?.abort();
    setLatestInspection(null);
    cancelSpeech();
    setOcrResult(null);
    setVlmReading(null);
    setOcrLoading(true);
    setErrorMessage(null);
    let delivered = false;
    let answered = false;
    const deliver = (text, isCloud = false) => {
      if (!text || delivered || request !== readingRequestRef.current) return;
      delivered = true;
      readingBusyRef.current = false;
      if (isCloud) setVlmReading(text);
      setOcrLoading(false);
      if (!audioMutedRef.current) speakLocalized(text);
    };
    try {
      // Publish the first usable reading immediately. A slower cloud response
      // must not delay local OCR or start a second, duplicate reading aloud.
      await Promise.allSettled([
        readTextFromFrame(frame).then(result => {
          if (request !== readingRequestRef.current) return;
          answered = true;
          setOcrResult(result);
          if (result.success && (result.total_text || result.full_text)) {
            deliver(result.speech_text || result.total_text || result.full_text);
          }
        }),
        askVLM(frame, "Read the visible text accurately. Do not guess missing text. Briefly identify the item and give framing advice if needed.").then(result => {
          if (result?.success && !/Fallback|Error/i.test(result.model_used || "")) answered = true;
          if (result?.success && !/Fallback|Error/i.test(result.model_used || "")) {
            deliver(result.spoken_response, true);
          }
        }),
      ]);
      if (!delivered && request === readingRequestRef.current) {
        if (!answered) setErrorMessage("Text reading is unavailable or timed out. Check the backend and try again.");
        deliver(answered ? "No readable text was returned. Hold the text flat and well lit, then try again." : "The text reader is unavailable. Please try again.");
      }
    } finally {
      if (request === readingRequestRef.current) {
        readingBusyRef.current = false;
        setOcrLoading(false);
      }
    }
  }, [captureFrame, sampleImage, speakLocalized, cancelSpeech]);

  /**
   * Tier 2 Multimodal VLM Conversational Query Trigger
   */
  const handleAskVLM = useCallback(
    async (prompt = "Describe this scene concisely for a blind person navigating.") => {
      const frame = captureFrame() || sampleImage;
      if (!frame) {
        setErrorMessage("Please enable the camera or load an image to analyze.");
        return;
      }

      setVlmLoading(true);
      setErrorMessage(null);

      try {
        const result = await askVLM(frame, prompt);
        if (result && result.spoken_response) {
          if (!audioMutedRef.current) {
            speakLocalized(result.spoken_response);
          }
        }
      } catch (err) {
        console.error("VLM query failed:", err);
        setErrorMessage(`AI query failed: ${err.message}`);
      } finally {
        setVlmLoading(false);
      }
    },
    [captureFrame, sampleImage, speakLocalized]
  );

  /**
   * Camera Orientation Guidance Hook
   */
  const { guidanceMessage: orientationGuidance } = useOrientation({
    isEnabled: isStreaming,
    onOrientationIssue: (issue) => {
      if (!audioMutedRef.current) {
        speakLocalized(issue, { automatic: true });
      }
    },
  });

  /**
   * Hands-Free Voice Commands Hook
   */
  const {
    isListening: isVoiceListening,
    transcript: voiceTranscript,
    permissionError: voicePermissionError,
    restartVoice,
  } = useVoiceCommands({
    isEnabled: true,
    isSpeaking,
    spokenText: lastSpokenText,
    onFeedback: (fb) => setVoiceFeedback(fb),
    onStopAudio: () => {
      cancelSpeech();
    },
    onRepeat: () => {
      repeatSpeech();
    },
    onReadText: () => {
      handleTriggerOcr();
    },
    onSceneDescription: (userQuery) => {
      handleAskVLM(userQuery || "Describe this scene concisely for a blind person navigating.");
    },
    onTargetSearch: (item) => {
      targetAnnouncementRef.current = "";
      setTargetObject(item);
      speak(searchingForString(item, speechLanguageRef.current.split("-")[0]));
    },
  });

  /**
   * Continuous Acquisition Loop
   */
  useEffect(() => {
    // Reading mode pauses the obstacle-detection loop entirely: the user is
    // holding an item up to read, so frames would only waste backend compute
    // and keep the navigation card churning with irrelevant updates.
    if (!isStreaming || !isInspecting || isReadingMode) return;

    let stopped = false;
    let timer;
    async function tick() {
      const started = performance.now();
      if (!processingRef.current && !readingBusyRef.current) {
        const frame = captureFrame();
        if (frame) await processFrame(frame, { automatic: true });
      }
      if (!stopped) timer = setTimeout(tick, Math.max(100, THROTTLE_MS - (performance.now() - started)));
    }
    tick(); // First frame now, not after a full interval.
    return () => {
      stopped = true;
      clearTimeout(timer);
      inspectionEpochRef.current += 1;
      inspectionControllerRef.current?.abort();
      navCandidateRef.current = { key: "", count: 0 };
      hazardAnnounceRef.current = { key: "", time: 0 };
      setLatestInspection(null);
      setAnnotatedImage(null);
    };
  }, [isStreaming, isInspecting, isReadingMode, captureFrame, processFrame]);

  /**
   * Handle Sample Static Image Upload
   */
  const handleSampleImageLoaded = useCallback(
    (dataUrl) => {
      setSampleImage(dataUrl);
      processFrame(dataUrl);
    },
    [processFrame]
  );

  /**
   * Keyboard Shortcuts Handler (Accessibility requirement)
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input or textarea
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        setIsInspecting((prev) => !prev);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNavigationMode((prev) => !prev);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        repeatSpeech();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        handleTriggerOcr();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        handleInspectOnce();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setAudioMuted((prev) => !prev);
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        handleToggleReadingMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [repeatSpeech, handleTriggerOcr, handleInspectOnce, handleToggleReadingMode]);

  return (
    <div className="app-container">
      {/* Header */}
      <Header
        apiHealth={apiHealth}
        speechLanguage={speechLanguage}
        speechLanguages={SUPPORTED_SPEECH_LANGUAGES}
        onSpeechLanguageChange={handleSpeechLanguageChange}
        speechVoiceMissing={!isVoiceAvailable(speechLanguage)}
      />

      {/* Live System Health & Telemetry Bar */}
      <div style={{ marginBottom: "12px" }}>
        <CameraStatus
          apiHealth={apiHealth}
          isStreaming={isStreaming}
          resolution={resolution}
          frameCount={frameCount}
          isInspecting={isInspecting}
          navigationMode={navigationMode}
          isReadingMode={isReadingMode}
        />
      </div>

      {/* Voice Assistant & Camera Orientation Guidance Status Bar */}
      <VoiceStatusPill
        isListening={isVoiceListening}
        lastVoiceFeedback={voiceFeedback}
        transcript={voiceTranscript}
        permissionError={voicePermissionError}
        onRestartVoice={restartVoice}
        guidanceMessage={orientationGuidance}
        targetObject={targetObject}
        onClearTarget={() => setTargetObject(null)}
        vlmLoading={vlmLoading}
      />

      {/* Accessible Error / Alert Banner */}
      {errorMessage && (
        <div style={{ marginBottom: "20px" }}>
          <ErrorMessage
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        </div>
      )}

      {/* Main Two-Column Accessibility Dashboard */}
      <main className="main-layout" role="main">
        {/* Left Column: Visual Stream, Speech Banner & Primary Controls */}
        <div className="column-stack">
          {/* Camera View */}
          <CameraPreview
            videoRef={videoRef}
            isStreaming={isStreaming}
            isProcessing={isProcessing}
            annotatedImage={annotatedImage}
            showAnnotated={showAnnotated}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onStartCamera={startCamera}
            onSwitchCamera={switchCamera}
            onSampleImageLoaded={handleSampleImageLoaded}
            overlayActive={isInspecting && !isReadingMode}
          />

          {/* Spoken Announcement Banner */}
          <SpeechBanner
            lastAnnouncement={
              lastSpokenText ||
              // Never fall back to stale navigation guidance while Reading
              // Mode has the inspection loop paused.
              (isReadingMode
                ? "Reading Mode is on: obstacle guidance is paused."
                : navigationMode && latestInspection?.navigation?.guidance_speech
                ? latestInspection.navigation.guidance_speech
                : latestInspection?.speech_text ||
                  latestInspection?.announcement)
            }
            isSpeaking={isSpeaking}
            audioMuted={audioMuted}
            onRepeat={repeatSpeech}
            onCancel={cancelSpeech}
          />

          {/* Primary Controls */}
          <ControlPanel
            isStreaming={isStreaming}
            isInspecting={isInspecting}
            isProcessing={isProcessing}
            audioMuted={audioMuted}
            showAnnotated={showAnnotated}
            navigationMode={navigationMode}
            onToggleCamera={() => (isStreaming ? stopCamera() : startCamera())}
            onToggleInspection={() => setIsInspecting((prev) => !prev)}
            onInspectOnce={handleInspectOnce}
            onRepeatSpeech={repeatSpeech}
            onToggleMute={() => setAudioMuted((prev) => !prev)}
            onToggleAnnotated={() => setShowAnnotated((prev) => !prev)}
            onToggleNavigationMode={() => setNavigationMode((prev) => !prev)}
          />

        </div>

        {/* Right Column: Safe Path Guide, OCR, Prioritized Detections & Metrics */}
        <div className="column-stack">
          {/* Safe Walking Path & Corridor Navigation Guide */}
          <ErrorBoundary label="Safe Path Guide">
            <NavigationCard
              navigation={latestInspection?.navigation}
              onSpeakGuidance={(text) => speak(text)}
              paused={isReadingMode}
            />
          </ErrorBoundary>

          {/* On-Demand Text Reader (OCR) */}
          <ErrorBoundary label="Reading Mode">
            <ReadTextButton
              isStreaming={isStreaming || !!sampleImage}
              isLoading={ocrLoading}
              ocrResult={ocrResult}
              vlmText={vlmReading}
              isReadingMode={isReadingMode}
              onToggleReadingMode={handleToggleReadingMode}
              onTriggerOcr={handleTriggerOcr}
              onSpeakText={(text) => speakLocalized(text)}
            />
          </ErrorBoundary>

          {/* Tier 2 Multimodal AI Scene Inquirer */}
          <button
            type="button"
            className="ai-btn"
            onClick={() => handleAskVLM()}
            disabled={vlmLoading || (!isStreaming && !sampleImage)}
            title="Ask AI to describe the entire scene (VLM Tier 2)"
            aria-label="Describe scene with AI"
          >
            {vlmLoading && <div className="spinner" style={{ borderTopColor: "var(--accent-info)" }} />}
            <Icon name="sparkles" size={16} />
            <span>{vlmLoading ? "Consulting AI..." : "Ask AI: What's In Front Of Me?"}</span>
          </button>

          {/* Prioritized Detections List */}
          <ErrorBoundary label="Observed Objects">
            <DetectionOverlay
            detections={
              latestInspection?.detections ||
              latestInspection?.prioritized_detections ||
              []
            }
            totalCount={
              latestInspection?.prioritized_count ??
              latestInspection?.total_detected_count ??
              latestInspection?.summary_metrics?.prioritized_count ??
              0
            }
            stale={isReadingMode || !isInspecting}
            hasInspected={!!latestInspection}
          />
          </ErrorBoundary>

          {/* Latency & Telemetry */}
          <ErrorBoundary label="Perception Telemetry">
            <MetricsCard
            metrics={
              latestInspection
                ? {
                    preprocess_time_ms: 0,
                    inference_time_ms: latestInspection.inference_time_ms,
                    prioritizer_time_ms: Math.max(
                      0,
                      (latestInspection.total_time_ms || 0) -
                        (latestInspection.inference_time_ms || 0)
                    ),
                    total_backend_time_ms: latestInspection.total_time_ms,
                    raw_detection_count: latestInspection.total_detected_count,
                    prioritized_count: latestInspection.prioritized_count,
                    ...latestInspection.summary_metrics,
                  }
                : null
            }
            totalLatencyMs={totalLatencyMs}
            stale={isReadingMode || !isInspecting}
          />
          </ErrorBoundary>
        </div>
      </main>

      {/* Accessible Footer */}
      <footer className="app-footer">
        <div>
          <strong>VisionMate</strong> — Assistive Visual Perception System. Built with YOLOv8, EasyOCR, FastAPI & React.
        </div>
        <ul className="footer-nav">
          <li>
            <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer">
              FastAPI Docs
            </a>
          </li>
          <li>
            <a href="http://localhost:8000/api/v1/health" target="_blank" rel="noopener noreferrer">
              Health Check
            </a>
          </li>
          <li>
            <a href="http://localhost:8000/api/v1/model-info" target="_blank" rel="noopener noreferrer">
              Model Info
            </a>
          </li>
        </ul>
      </footer>
    </div>
  );
}
